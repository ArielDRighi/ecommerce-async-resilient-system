package health

import (
	"context"
	"fmt"
	"time"

	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/database"
	"go.uber.org/zap"
)

// HealthChecker defines the interface for health check components
type HealthChecker interface {
	Name() string
	Check(ctx context.Context) error
}

// Service manages health checks for various system components
type Service struct {
	logger   *zap.Logger
	checkers map[string]HealthChecker
}

// NewService creates a new health check service
func NewService(logger *zap.Logger) *Service {
	return &Service{
		logger:   logger,
		checkers: make(map[string]HealthChecker),
	}
}

// RegisterChecker registers a new health checker
func (s *Service) RegisterChecker(checker HealthChecker) {
	s.checkers[checker.Name()] = checker
	s.logger.Info("Registered health checker", zap.String("name", checker.Name()))
}

// CheckResult represents the result of a health check
type CheckResult struct {
	Name     string        `json:"name"`
	Status   string        `json:"status"`
	Duration time.Duration `json:"duration"`
	Error    string        `json:"error,omitempty"`
}

// HealthStatus represents the overall health status
type HealthStatus struct {
	Status    string                 `json:"status"`
	Timestamp time.Time              `json:"timestamp"`
	Checks    []CheckResult          `json:"checks"`
	Details   map[string]interface{} `json:"details,omitempty"`
}

// CheckAll performs health checks on all registered components
func (s *Service) CheckAll(ctx context.Context) HealthStatus {
	start := time.Now()
	results := make([]CheckResult, 0, len(s.checkers))
	overallStatus := "healthy"

	for name, checker := range s.checkers {
		checkStart := time.Now()
		result := CheckResult{
			Name:     name,
			Status:   "healthy",
			Duration: 0,
		}

		if err := checker.Check(ctx); err != nil {
			result.Status = "unhealthy"
			result.Error = err.Error()
			overallStatus = "unhealthy"
			s.logger.Error("Health check failed",
				zap.String("checker", name),
				zap.Error(err),
			)
		}

		result.Duration = time.Since(checkStart)
		results = append(results, result)
	}

	status := HealthStatus{
		Status:    overallStatus,
		Timestamp: time.Now(),
		Checks:    results,
		Details: map[string]interface{}{
			"total_duration": time.Since(start),
			"total_checks":   len(results),
		},
	}

	s.logger.Info("Health check completed",
		zap.String("status", overallStatus),
		zap.Duration("duration", time.Since(start)),
		zap.Int("checks", len(results)),
	)

	return status
}

// DatabaseHealthChecker implements health checking for database connections
type DatabaseHealthChecker struct {
	db     *database.DB
	logger *zap.Logger
	name   string
}

// NewDatabaseHealthChecker creates a new database health checker
func NewDatabaseHealthChecker(db *database.DB, logger *zap.Logger) *DatabaseHealthChecker {
	return &DatabaseHealthChecker{
		db:     db,
		logger: logger,
		name:   "database",
	}
}

// Name returns the name of the health checker
func (d *DatabaseHealthChecker) Name() string {
	return d.name
}

// Check performs a health check on the database connection
func (d *DatabaseHealthChecker) Check(ctx context.Context) error {
	// Create a timeout context for the health check
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Perform database health check
	if err := d.db.Health(checkCtx); err != nil {
		return fmt.Errorf("database health check failed: %w", err)
	}

	// Check connection pool stats
	stats := d.db.Stats()
	if stats.OpenConnections == 0 {
		return fmt.Errorf("no open database connections")
	}

	// Log connection pool statistics
	d.logger.Debug("Database health check passed",
		zap.Int("open_connections", stats.OpenConnections),
		zap.Int("in_use", stats.InUse),
		zap.Int("idle", stats.Idle),
		zap.Int64("wait_count", stats.WaitCount),
		zap.Duration("wait_duration", stats.WaitDuration),
	)

	return nil
}

// GetDatabaseStats returns detailed database connection statistics
func (d *DatabaseHealthChecker) GetDatabaseStats() config.DBStats {
	return d.db.Stats()
}