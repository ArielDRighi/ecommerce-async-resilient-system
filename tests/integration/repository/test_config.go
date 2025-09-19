package repository

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/username/order-processor/internal/repository/models"
)

// TestConfig contains configuration for integration tests
type TestConfig struct {
	DatabaseURL     string
	TestTimeout     time.Duration
	CleanupEnabled  bool
	MigrationEnabled bool
}

// GetTestConfig returns the test configuration
func GetTestConfig() TestConfig {
	return TestConfig{
		DatabaseURL:     getTestDatabaseURL(),
		TestTimeout:     30 * time.Second,
		CleanupEnabled:  true,
		MigrationEnabled: true,
	}
}

// getTestDatabaseURL returns the test database URL from environment or default
func getTestDatabaseURL() string {
	if url := os.Getenv("TEST_DATABASE_URL"); url != "" {
		return url
	}
	
	// Default test database configuration
	return "host=localhost user=postgres password=postgres dbname=order_processor_test port=5432 sslmode=disable TimeZone=UTC"
}

// SetupTestDatabase sets up a test database connection
func SetupTestDatabase(t *testing.T) *gorm.DB {
	config := GetTestConfig()
	
	db, err := gorm.Open(postgres.Open(config.DatabaseURL), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
		NowFunc: func() time.Time {
			return time.Now().UTC()
		},
	})
	
	if err != nil {
		t.Skipf("Test database not available: %v", err)
		return nil
	}
	
	// Test the connection
	sqlDB, err := db.DB()
	require.NoError(t, err)
	
	err = sqlDB.Ping()
	if err != nil {
		t.Skipf("Cannot ping test database: %v", err)
		return nil
	}
	
	// Configure connection pool for tests
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)
	
	if config.MigrationEnabled {
		MigrateTestDatabase(t, db)
	}
	
	return db
}

// MigrateTestDatabase runs migrations on the test database
func MigrateTestDatabase(t *testing.T, db *gorm.DB) {
	err := db.AutoMigrate(
		&models.OrderModel{},
		&models.OrderItemModel{},
		&models.OutboxEventModel{},
		&models.IdempotencyKeyModel{},
	)
	require.NoError(t, err, "Failed to migrate test database")
}

// CleanTestDatabase cleans all test data from the database
func CleanTestDatabase(t *testing.T, db *gorm.DB) {
	// Clean in reverse order of dependencies
	tables := []string{
		"outbox_events",
		"order_items", 
		"orders",
		"idempotency_keys",
	}
	
	for _, table := range tables {
		result := db.Exec("TRUNCATE TABLE " + table + " RESTART IDENTITY CASCADE")
		if result.Error != nil {
			t.Logf("Warning: Failed to clean table %s: %v", table, result.Error)
		}
	}
}

// TeardownTestDatabase closes the test database connection
func TeardownTestDatabase(t *testing.T, db *gorm.DB) {
	if db == nil {
		return
	}
	
	config := GetTestConfig()
	if config.CleanupEnabled {
		CleanTestDatabase(t, db)
	}
	
	sqlDB, err := db.DB()
	if err != nil {
		t.Logf("Warning: Failed to get SQL DB: %v", err)
		return
	}
	
	err = sqlDB.Close()
	if err != nil {
		t.Logf("Warning: Failed to close database connection: %v", err)
	}
}

// WithTestDatabase is a helper that sets up and tears down a test database
func WithTestDatabase(t *testing.T, fn func(*gorm.DB)) {
	db := SetupTestDatabase(t)
	if db == nil {
		return
	}
	
	defer TeardownTestDatabase(t, db)
	fn(db)
}

// CreateTestSchema ensures the test schema exists
func CreateTestSchema(t *testing.T, adminDSN string) {
	// This function can be used to create the test database if it doesn't exist
	// Typically called from TestMain or similar setup function
	
	db, err := gorm.Open(postgres.Open(adminDSN), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	
	if err != nil {
		t.Skipf("Cannot connect to admin database: %v", err)
		return
	}
	
	defer func() {
		sqlDB, _ := db.DB()
		if sqlDB != nil {
			sqlDB.Close()
		}
	}()
	
	// Create test database if it doesn't exist
	db.Exec("CREATE DATABASE order_processor_test")
	// Note: We ignore errors here because the database might already exist
}

// TestDatabaseConfig contains configuration for different test environments
type TestDatabaseConfig struct {
	Development TestConfig
	CI          TestConfig
	Local       TestConfig
}

// GetEnvironmentConfig returns configuration based on the environment
func GetEnvironmentConfig() TestDatabaseConfig {
	return TestDatabaseConfig{
		Development: TestConfig{
			DatabaseURL:      "host=localhost user=postgres password=postgres dbname=order_processor_test port=5432 sslmode=disable",
			TestTimeout:      30 * time.Second,
			CleanupEnabled:   true,
			MigrationEnabled: true,
		},
		CI: TestConfig{
			DatabaseURL:      os.Getenv("CI_DATABASE_URL"),
			TestTimeout:      60 * time.Second,
			CleanupEnabled:   true,
			MigrationEnabled: true,
		},
		Local: TestConfig{
			DatabaseURL:      "host=localhost user=test password=test dbname=test_db port=5432 sslmode=disable",
			TestTimeout:      10 * time.Second,
			CleanupEnabled:   true,
			MigrationEnabled: true,
		},
	}
}

// IsIntegrationTest checks if integration tests should run
func IsIntegrationTest() bool {
	return os.Getenv("INTEGRATION_TESTS") != "" || os.Getenv("TEST_DATABASE_URL") != ""
}

// SkipIfNoDatabase skips the test if no database is available
func SkipIfNoDatabase(t *testing.T) {
	if !IsIntegrationTest() {
		t.Skip("Skipping integration test: no database configured")
	}
}