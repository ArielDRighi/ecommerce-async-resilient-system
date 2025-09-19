package worker

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

// WorkerConfig holds configuration for the worker service
type WorkerConfig struct {
	OutboxProcessor OutboxProcessorWorkerConfig `mapstructure:"outbox_processor"`
	RabbitMQ        RabbitMQWorkerConfig        `mapstructure:"rabbitmq"`
}

// OutboxProcessorWorkerConfig holds outbox processor configuration
type OutboxProcessorWorkerConfig struct {
	PollIntervalSeconds      int     `mapstructure:"poll_interval_seconds"`
	BatchSize                int     `mapstructure:"batch_size"`
	WorkerCount              int     `mapstructure:"worker_count"`
	MaxRetries               int     `mapstructure:"max_retries"`
	BaseRetryDelaySeconds    int     `mapstructure:"base_retry_delay_seconds"`
	MaxRetryDelaySeconds     int     `mapstructure:"max_retry_delay_seconds"`
	RetryMultiplier          float64 `mapstructure:"retry_multiplier"`
	MetricsIntervalSeconds   int     `mapstructure:"metrics_interval_seconds"`
	IdempotencyTTLHours      int     `mapstructure:"idempotency_ttl_hours"`
}

// RabbitMQWorkerConfig holds RabbitMQ configuration for workers
type RabbitMQWorkerConfig struct {
	Exchange         string `mapstructure:"exchange"`
	RoutingKeyPrefix string `mapstructure:"routing_key_prefix"`
}

// DefaultWorkerConfig returns default worker configuration
func DefaultWorkerConfig() WorkerConfig {
	return WorkerConfig{
		OutboxProcessor: OutboxProcessorWorkerConfig{
			PollIntervalSeconds:      5,
			BatchSize:                10,
			WorkerCount:              3,
			MaxRetries:               5,
			BaseRetryDelaySeconds:    1,
			MaxRetryDelaySeconds:     60,
			RetryMultiplier:          2.0,
			MetricsIntervalSeconds:   30,
			IdempotencyTTLHours:      24,
		},
		RabbitMQ: RabbitMQWorkerConfig{
			Exchange:         "orders.exchange",
			RoutingKeyPrefix: "order",
		},
	}
}

// WorkerService manages the outbox processor and provides a high-level interface
type WorkerService struct {
	processor      OutboxProcessor
	config         WorkerConfig
	logger         *zap.Logger
	
	// State management
	running        bool
	runningMu      sync.RWMutex
	
	// Context for graceful shutdown
	ctx            context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
}

// WorkerServiceConfig holds configuration for the worker service
type WorkerServiceConfig struct {
	Database    *gorm.DB
	RabbitMQ    *amqp091.Connection
	Redis       *redis.Client
	Logger      *zap.Logger
	Config      WorkerConfig
}

// NewWorkerService creates a new worker service with the outbox processor
func NewWorkerService(cfg WorkerServiceConfig) (*WorkerService, error) {
	if cfg.Database == nil {
		return nil, fmt.Errorf("database connection is required")
	}
	if cfg.RabbitMQ == nil {
		return nil, fmt.Errorf("rabbitmq connection is required")
	}
	if cfg.Redis == nil {
		return nil, fmt.Errorf("redis client is required")
	}
	if cfg.Logger == nil {
		return nil, fmt.Errorf("logger is required")
	}
	
	cfg.Logger.Info("Creating worker service",
		zap.String("event", "worker_service_creation"),
		zap.Duration("poll_interval", time.Duration(cfg.Config.OutboxProcessor.PollIntervalSeconds)*time.Second),
		zap.Int("batch_size", cfg.Config.OutboxProcessor.BatchSize),
		zap.Int("worker_count", cfg.Config.OutboxProcessor.WorkerCount),
	)
	
	// Create outbox event repository
	outboxRepo := NewPostgresOutboxEventRepository(cfg.Database)
	
	// Create outbox processor configuration
	processorConfig := OutboxProcessorConfig{
		PollInterval:      time.Duration(cfg.Config.OutboxProcessor.PollIntervalSeconds) * time.Second,
		BatchSize:         cfg.Config.OutboxProcessor.BatchSize,
		WorkerCount:       cfg.Config.OutboxProcessor.WorkerCount,
		MaxRetries:        cfg.Config.OutboxProcessor.MaxRetries,
		BaseRetryDelay:    time.Duration(cfg.Config.OutboxProcessor.BaseRetryDelaySeconds) * time.Second,
		MaxRetryDelay:     time.Duration(cfg.Config.OutboxProcessor.MaxRetryDelaySeconds) * time.Second,
		RetryMultiplier:   cfg.Config.OutboxProcessor.RetryMultiplier,
		Exchange:          cfg.Config.RabbitMQ.Exchange,
		RoutingKeyPrefix:  cfg.Config.RabbitMQ.RoutingKeyPrefix,
		MetricsInterval:   time.Duration(cfg.Config.OutboxProcessor.MetricsIntervalSeconds) * time.Second,
		IdempotencyTTL:    time.Duration(cfg.Config.OutboxProcessor.IdempotencyTTLHours) * time.Hour,
	}
	
	// Create outbox processor
	processor, err := NewOutboxProcessor(
		processorConfig,
		outboxRepo,
		cfg.RabbitMQ,
		cfg.Redis,
		cfg.Logger,
	)
	if err != nil {
		cfg.Logger.Error("Failed to create outbox processor",
			zap.String("event", "outbox_processor_creation_failed"),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to create outbox processor: %w", err)
	}
	
	ctx, cancel := context.WithCancel(context.Background())
	
	service := &WorkerService{
		processor: processor,
		config:    cfg.Config,
		logger:    cfg.Logger,
		ctx:       ctx,
		cancel:    cancel,
	}
	
	cfg.Logger.Info("Worker service created successfully",
		zap.String("event", "worker_service_created"),
	)
	
	return service, nil
}

// Start starts the worker service and all its components
func (s *WorkerService) Start(ctx context.Context) error {
	s.runningMu.Lock()
	if s.running {
		s.runningMu.Unlock()
		return fmt.Errorf("worker service is already running")
	}
	s.running = true
	s.runningMu.Unlock()
	
	s.logger.Info("Starting worker service",
		zap.String("event", "worker_service_starting"),
	)
	
	// Start the outbox processor
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		
		if err := s.processor.Start(s.ctx); err != nil {
			s.logger.Error("Outbox processor failed to start",
				zap.String("event", "outbox_processor_start_failed"),
				zap.Error(err),
			)
		}
	}()
	
	// Start health monitoring
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.healthMonitor(s.ctx)
	}()
	
	s.logger.Info("Worker service started successfully",
		zap.String("event", "worker_service_started"),
	)
	
	return nil
}

// Stop gracefully stops the worker service
func (s *WorkerService) Stop(ctx context.Context) error {
	s.runningMu.Lock()
	if !s.running {
		s.runningMu.Unlock()
		return nil
	}
	s.running = false
	s.runningMu.Unlock()
	
	s.logger.Info("Stopping worker service",
		zap.String("event", "worker_service_stopping"),
	)
	
	// Stop the outbox processor
	if err := s.processor.Stop(ctx); err != nil {
		s.logger.Error("Error stopping outbox processor",
			zap.String("event", "outbox_processor_stop_error"),
			zap.Error(err),
		)
	}
	
	// Cancel context to stop all goroutines
	s.cancel()
	
	// Wait for all goroutines to finish
	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	
	// Wait for graceful shutdown or timeout
	select {
	case <-done:
		s.logger.Info("Worker service stopped gracefully",
			zap.String("event", "worker_service_stopped_gracefully"),
		)
	case <-ctx.Done():
		s.logger.Warn("Worker service shutdown timeout",
			zap.String("event", "worker_service_shutdown_timeout"),
			zap.Error(ctx.Err()),
		)
	}
	
	s.logger.Info("Worker service stopped",
		zap.String("event", "worker_service_stopped"),
	)
	
	return nil
}

// IsRunning returns whether the worker service is currently running
func (s *WorkerService) IsRunning() bool {
	s.runningMu.RLock()
	defer s.runningMu.RUnlock()
	return s.running
}

// GetStatus returns the current status of the worker service
func (s *WorkerService) GetStatus() WorkerServiceStatus {
	s.runningMu.RLock()
	defer s.runningMu.RUnlock()
	
	status := WorkerServiceStatus{
		Running:           s.running,
		ProcessorStatus:   s.processor.GetStatus(),
		ProcessorMetrics:  s.processor.GetMetrics(),
	}
	
	return status
}

// GetMetrics returns comprehensive metrics for the worker service
func (s *WorkerService) GetMetrics() WorkerServiceMetrics {
	processorMetrics := s.processor.GetMetrics()
	
	return WorkerServiceMetrics{
		ProcessorMetrics: processorMetrics,
		ServiceStatus:    s.GetStatus(),
		Uptime:          time.Since(time.Now()), // This would be tracked properly in real implementation
	}
}

// healthMonitor periodically monitors the health of the worker service
func (s *WorkerService) healthMonitor(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second) // Health check every 30 seconds
	defer ticker.Stop()
	
	s.logger.Info("Health monitor started",
		zap.String("event", "health_monitor_started"),
	)
	
	for {
		select {
		case <-ctx.Done():
			s.logger.Info("Health monitor stopped",
				zap.String("event", "health_monitor_stopped"),
			)
			return
		case <-ticker.C:
			s.performHealthCheck()
		}
	}
}

// performHealthCheck performs a health check of the worker service
func (s *WorkerService) performHealthCheck() {
	status := s.GetStatus()
	metrics := status.ProcessorMetrics
	
	// Log health status
	s.logger.Info("Worker service health check",
		zap.String("event", "health_check"),
		zap.String("processor_status", string(status.ProcessorStatus)),
		zap.Int64("total_processed", metrics.TotalProcessed),
		zap.Int64("total_failed", metrics.TotalFailed),
		zap.Int("consecutive_failures", metrics.ConsecutiveFailures),
		zap.Duration("last_processing_time", metrics.LastProcessingTime),
		zap.Int64("pending_events", metrics.PendingEvents),
	)
	
	// Check for concerning conditions
	if metrics.ConsecutiveFailures > 10 {
		s.logger.Warn("High consecutive failures detected",
			zap.String("event", "high_consecutive_failures"),
			zap.Int("consecutive_failures", metrics.ConsecutiveFailures),
			zap.String("last_error", metrics.LastError),
		)
	}
	
	if metrics.PendingEvents > 1000 {
		s.logger.Warn("High number of pending events",
			zap.String("event", "high_pending_events"),
			zap.Int64("pending_events", metrics.PendingEvents),
		)
	}
	
	if status.ProcessorStatus == StatusErrored || status.ProcessorStatus == StatusDegraded {
		s.logger.Error("Processor in error or degraded state",
			zap.String("event", "processor_unhealthy"),
			zap.String("status", string(status.ProcessorStatus)),
		)
	}
}

// WorkerServiceStatus represents the current status of the worker service
type WorkerServiceStatus struct {
	Running           bool              `json:"running"`
	ProcessorStatus   ProcessorStatus   `json:"processor_status"`
	ProcessorMetrics  OutboxMetrics     `json:"processor_metrics"`
}

// WorkerServiceMetrics contains comprehensive metrics for the worker service
type WorkerServiceMetrics struct {
	ProcessorMetrics OutboxMetrics        `json:"processor_metrics"`
	ServiceStatus    WorkerServiceStatus  `json:"service_status"`
	Uptime          time.Duration        `json:"uptime"`
}

// Validate validates the worker service configuration
func (s *WorkerService) Validate() error {
	if s.processor == nil {
		return fmt.Errorf("outbox processor is not initialized")
	}
	
	status := s.processor.GetStatus()
	if status == StatusErrored {
		return fmt.Errorf("outbox processor is in error state")
	}
	
	return nil
}

// Restart restarts the worker service
func (s *WorkerService) Restart(ctx context.Context) error {
	s.logger.Info("Restarting worker service",
		zap.String("event", "worker_service_restarting"),
	)
	
	// Stop the service
	if err := s.Stop(ctx); err != nil {
		s.logger.Error("Error stopping service during restart",
			zap.String("event", "restart_stop_error"),
			zap.Error(err),
		)
		return fmt.Errorf("failed to stop service during restart: %w", err)
	}
	
	// Wait a moment for cleanup
	time.Sleep(2 * time.Second)
	
	// Start the service again
	if err := s.Start(ctx); err != nil {
		s.logger.Error("Error starting service during restart",
			zap.String("event", "restart_start_error"),
			zap.Error(err),
		)
		return fmt.Errorf("failed to start service during restart: %w", err)
	}
	
	s.logger.Info("Worker service restarted successfully",
		zap.String("event", "worker_service_restarted"),
	)
	
	return nil
}