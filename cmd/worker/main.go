package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/logger"
	"github.com/username/order-processor/internal/worker"
)

var (
	// Version information (set during build)
	Version   = "1.0.0"
	BuildTime = "unknown"
	GitCommit = "unknown"
)

func main() {
	// Generate correlation ID for this worker session
	workerCorrelationID := uuid.New().String()
	
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger using the existing system
	if err := logger.Initialize(cfg.Logger); err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	// Get the logger instance with correlation ID
	log := logger.Logger.With(
		zap.String("correlation_id", workerCorrelationID),
		zap.String("service", "outbox-processor"),
	)

	// Log application startup with structured logging
	log.Info("Starting Order Processor Worker with Outbox Pattern",
		zap.String("event", "worker_startup"),
		zap.String("version", Version),
		zap.String("build_time", BuildTime),
		zap.String("git_commit", GitCommit),
		zap.String("environment", cfg.App.Environment),
	)

	// Initialize database connection
	db, err := gorm.Open(postgres.Open(cfg.GetDatabaseURL()), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database",
			zap.String("event", "database_connection_failed"),
			zap.Error(err),
		)
	}

	log.Info("Database connection established",
		zap.String("event", "database_connected"),
		zap.String("host", cfg.Database.Host),
		zap.Int("port", cfg.Database.Port),
	)

	// Initialize RabbitMQ connection
	rabbitConn, err := amqp091.Dial(cfg.GetRabbitMQURL())
	if err != nil {
		log.Fatal("Failed to connect to RabbitMQ",
			zap.String("event", "rabbitmq_connection_failed"),
			zap.Error(err),
		)
	}
	defer func() {
		if err := rabbitConn.Close(); err != nil {
			log.Error("Error closing RabbitMQ connection",
				zap.String("event", "rabbitmq_close_error"),
				zap.Error(err),
			)
		}
	}()

	log.Info("RabbitMQ connection established",
		zap.String("event", "rabbitmq_connected"),
		zap.String("host", cfg.RabbitMQ.Host),
		zap.Int("port", cfg.RabbitMQ.Port),
	)

	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:         cfg.GetRedisAddr(),
		Password:     cfg.Redis.Password,
		DB:           cfg.Redis.DB,
		PoolSize:     cfg.Redis.PoolSize,
		MinIdleConns: cfg.Redis.MinIdleConns,
	})
	defer func() {
		if err := redisClient.Close(); err != nil {
			log.Error("Error closing Redis connection",
				zap.String("event", "redis_close_error"),
				zap.Error(err),
			)
		}
	}()

	// Test Redis connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatal("Failed to connect to Redis",
			zap.String("event", "redis_connection_failed"),
			zap.Error(err),
		)
	}

	log.Info("Redis connection established",
		zap.String("event", "redis_connected"),
		zap.String("addr", cfg.GetRedisAddr()),
		zap.Int("db", cfg.Redis.DB),
	)

	// Create worker service configuration
	workerConfig := worker.DefaultWorkerConfig()
	workerServiceConfig := worker.WorkerServiceConfig{
		Database: db,
		RabbitMQ: rabbitConn,
		Redis:    redisClient,
		Logger:   log,
		Config:   workerConfig,
	}

	// Create worker service
	workerService, err := worker.NewWorkerService(workerServiceConfig)
	if err != nil {
		log.Fatal("Failed to create worker service",
			zap.String("event", "worker_service_creation_failed"),
			zap.Error(err),
		)
	}

	// Start worker service
	log.Info("Starting worker service",
		zap.String("event", "worker_startup"),
		zap.String("correlation_id", workerCorrelationID),
	)

	serviceCtx, serviceCancel := context.WithCancel(context.Background())
	defer serviceCancel()

	if err := workerService.Start(serviceCtx); err != nil {
		log.Fatal("Failed to start worker service",
			zap.String("event", "worker_service_start_failed"),
			zap.Error(err),
		)
	}

	log.Info("Worker service started successfully",
		zap.String("event", "worker_service_started"),
		zap.String("status", "running"),
	)

	// Setup graceful shutdown
	var wg sync.WaitGroup
	
	// Listen for interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Wait for shutdown signal
	wg.Add(1)
	go func() {
		defer wg.Done()
		sig := <-sigChan
		
		log.Info("Shutdown signal received",
			zap.String("event", "shutdown_signal_received"),
			zap.String("signal", sig.String()),
		)

		// Create shutdown context with timeout
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()

		// Stop worker service
		if err := workerService.Stop(shutdownCtx); err != nil {
			log.Error("Error during worker service shutdown",
				zap.String("event", "worker_service_shutdown_error"),
				zap.Error(err),
			)
		}

		// Cancel main context
		cancel()
	}()

	// Monitor worker service health
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Info("Health monitor stopping",
					zap.String("event", "health_monitor_stopping"),
				)
				return
			case <-ticker.C:
				status := workerService.GetStatus()
				metrics := workerService.GetMetrics()
				
				log.Info("Worker service health check",
					zap.String("event", "worker_health_check"),
					zap.Bool("running", status.Running),
					zap.String("processor_status", string(status.ProcessorStatus)),
					zap.Int64("total_processed", metrics.ProcessorMetrics.TotalProcessed),
					zap.Int64("total_failed", metrics.ProcessorMetrics.TotalFailed),
					zap.Int64("pending_events", metrics.ProcessorMetrics.PendingEvents),
					zap.Duration("uptime", metrics.Uptime),
				)

				// Log warning if there are issues
				if !status.Running {
					log.Warn("Worker service is not running",
						zap.String("event", "worker_service_not_running"),
						zap.String("processor_status", string(status.ProcessorStatus)),
					)
				}

				if metrics.ProcessorMetrics.ConsecutiveFailures > 5 {
					log.Warn("High consecutive failures detected",
						zap.String("event", "high_consecutive_failures"),
						zap.Int("consecutive_failures", metrics.ProcessorMetrics.ConsecutiveFailures),
						zap.String("last_error", metrics.ProcessorMetrics.LastError),
					)
				}
			}
		}
	}()

	// Wait for shutdown
	wg.Wait()

	log.Info("Worker shutdown complete",
		zap.String("event", "worker_shutdown_complete"),
		zap.String("service", "outbox-processor"),
		zap.String("version", Version),
	)
}