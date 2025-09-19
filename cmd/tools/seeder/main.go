package main

import (
	"log"
	"os"

	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/database"
	"github.com/username/order-processor/internal/logger"
	"go.uber.org/zap"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize logger
	if err := logger.Initialize(cfg.Logger); err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Logger.Sync()

	// Initialize database connection
	db, err := database.New(&cfg.Database, logger.Logger)
	if err != nil {
		logger.Logger.Fatal("Failed to initialize database connection", zap.Error(err))
	}
	defer db.Close()

	// Create seeder
	seeder := database.NewSeeder(db, logger.Logger)

	// Run seeding
	if err := seeder.SeedAll(); err != nil {
		logger.Logger.Fatal("Failed to seed database", zap.Error(err))
		os.Exit(1)
	}

	logger.Logger.Info("Database seeding completed successfully")
}