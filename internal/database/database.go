package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/models"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// DB holds the database connection and provides database operations
type DB struct {
	*gorm.DB
	logger *zap.Logger
	config *config.DatabaseConfig
}

// New creates a new database connection with the provided configuration
func New(cfg *config.DatabaseConfig, zapLogger *zap.Logger) (*DB, error) {
	if cfg == nil {
		return nil, fmt.Errorf("database config cannot be nil")
	}

	if zapLogger == nil {
		return nil, fmt.Errorf("logger cannot be nil")
	}

	// Build PostgreSQL DSN
	dsn := buildDSN(cfg)

	// Configure GORM logger
	gormLogger := NewGormLogger(zapLogger)

	// Configure GORM
	gormConfig := &gorm.Config{
		Logger:                 gormLogger,
		DisableForeignKeyConstraintWhenMigrating: false,
		SkipDefaultTransaction: false,
	}

	// Open database connection
	db, err := gorm.Open(postgres.Open(dsn), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Get underlying sql.DB for connection pool configuration
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	// Configure connection pool
	configureConnectionPool(sqlDB, cfg)

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	zapLogger.Info("Successfully connected to database",
		zap.String("host", cfg.Host),
		zap.Int("port", cfg.Port),
		zap.String("database", cfg.Database),
		zap.String("user", cfg.User),
	)

	return &DB{
		DB:     db,
		logger: zapLogger,
		config: cfg,
	}, nil
}

// buildDSN constructs the PostgreSQL Data Source Name from configuration
func buildDSN(cfg *config.DatabaseConfig) string {
	return fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%d sslmode=%s TimeZone=UTC",
		cfg.Host,
		cfg.User,
		cfg.Password,
		cfg.Database,
		cfg.Port,
		cfg.SSLMode,
	)
}

// configureConnectionPool sets up the database connection pool
func configureConnectionPool(sqlDB *sql.DB, cfg *config.DatabaseConfig) {
	// Maximum number of open connections to the database
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)

	// Maximum number of connections in the idle connection pool
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)

	// Maximum amount of time a connection may be reused
	sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetime) * time.Minute)

	// Maximum amount of time a connection may be idle
	sqlDB.SetConnMaxIdleTime(time.Duration(cfg.ConnMaxIdleTime) * time.Minute)
}

// AutoMigrate runs automatic migration for all models
func (db *DB) AutoMigrate() error {
	db.logger.Info("Running database auto-migration")

	err := db.DB.AutoMigrate(
		&models.Order{},
		&models.OrderItem{},
		&models.OutboxEvent{},
		&models.IdempotencyKey{},
	)

	if err != nil {
		db.logger.Error("Failed to run auto-migration", zap.Error(err))
		return fmt.Errorf("failed to run auto-migration: %w", err)
	}

	db.logger.Info("Database auto-migration completed successfully")
	return nil
}

// Close closes the database connection
func (db *DB) Close() error {
	sqlDB, err := db.DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	if err := sqlDB.Close(); err != nil {
		db.logger.Error("Failed to close database connection", zap.Error(err))
		return fmt.Errorf("failed to close database connection: %w", err)
	}

	db.logger.Info("Database connection closed successfully")
	return nil
}

// Health checks the database connection health
func (db *DB) Health(ctx context.Context) error {
	sqlDB, err := db.DB.DB()
	if err != nil {
		return fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}

	// Ping with context timeout
	if err := sqlDB.PingContext(ctx); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	return nil
}

// Stats returns database connection pool statistics
func (db *DB) Stats() config.DBStats {
	sqlDB, err := db.DB.DB()
	if err != nil {
		db.logger.Error("Failed to get underlying sql.DB for stats", zap.Error(err))
		return config.DBStats{}
	}

	stats := sqlDB.Stats()
	return config.DBStats{
		OpenConnections: stats.OpenConnections,
		InUse:          stats.InUse,
		Idle:           stats.Idle,
		WaitCount:      stats.WaitCount,
		WaitDuration:   stats.WaitDuration,
		MaxOpenConns:   db.config.MaxOpenConns,
		MaxIdleConns:   db.config.MaxIdleConns,
		MaxLifetime:    time.Duration(db.config.ConnMaxLifetime) * time.Minute,
		MaxIdleTime:    time.Duration(db.config.ConnMaxIdleTime) * time.Minute,
	}
}

// WithTransaction executes a function within a database transaction
func (db *DB) WithTransaction(ctx context.Context, fn func(*gorm.DB) error) error {
	return db.DB.WithContext(ctx).Transaction(fn)
}