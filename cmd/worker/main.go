package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/logger"
)

var (
	// Version information (set during build)
	Version   = "1.0.0"
	BuildTime = "unknown"
	GitCommit = "unknown"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger
	if err := logger.Initialize(cfg.Logger); err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	// Log application startup
	logger.SugaredLogger.Infow("Starting Order Processor Worker",
		"version", Version,
		"build_time", BuildTime,
		"git_commit", GitCommit,
		"environment", cfg.App.Environment,
	)

	// Create context for graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// TODO: Initialize dependencies (database, Redis, RabbitMQ)
	logger.SugaredLogger.Info("Initializing dependencies...")

	// TODO: Initialize repositories
	logger.SugaredLogger.Info("Initializing repositories...")

	// TODO: Initialize services
	logger.SugaredLogger.Info("Initializing services...")

	// TODO: Initialize message consumers
	logger.SugaredLogger.Info("Initializing message consumers...")

	// TODO: Initialize outbox processor
	logger.SugaredLogger.Info("Initializing outbox processor...")

	// TODO: Start background workers
	logger.SugaredLogger.Info("Starting background workers...")

	// Simulate worker processing for now
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				logger.SugaredLogger.Info("Worker context cancelled, stopping...")
				return
			case <-ticker.C:
				logger.WithComponent("worker").Info("Worker heartbeat - processing orders...")
				// TODO: Replace with actual worker logic
			}
		}
	}()

	logger.SugaredLogger.Infow("Order Processor Worker started successfully",
		"environment", cfg.App.Environment,
		"debug", cfg.App.Debug,
	)

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.SugaredLogger.Info("Shutting down worker...")

	// Cancel context to stop all background processes
	cancel()

	// Give background processes time to finish
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	// TODO: Gracefully shutdown message consumers
	logger.SugaredLogger.Info("Stopping message consumers...")

	// TODO: Gracefully shutdown outbox processor
	logger.SugaredLogger.Info("Stopping outbox processor...")

	// TODO: Close database connections
	logger.SugaredLogger.Info("Closing database connections...")

	// TODO: Close Redis connections
	logger.SugaredLogger.Info("Closing Redis connections...")

	// TODO: Close RabbitMQ connections
	logger.SugaredLogger.Info("Closing RabbitMQ connections...")

	// Wait for shutdown timeout or completion
	select {
	case <-shutdownCtx.Done():
		logger.SugaredLogger.Warn("Shutdown timeout exceeded, forcing exit")
	case <-time.After(1 * time.Second):
		logger.SugaredLogger.Info("Worker shutdown completed gracefully")
	}

	logger.SugaredLogger.Info("Worker exited")
}