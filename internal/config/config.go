package config

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
	"github.com/username/order-processor/internal/logger"
)

// Config holds all configuration for the application
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Redis    RedisConfig    `mapstructure:"redis"`
	RabbitMQ RabbitMQConfig `mapstructure:"rabbitmq"`
	Logger   logger.Config  `mapstructure:"logger"`
	App      AppConfig      `mapstructure:"app"`
}

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Host         string `mapstructure:"host"`
	Port         int    `mapstructure:"port"`
	ReadTimeout  int    `mapstructure:"read_timeout"`  // seconds
	WriteTimeout int    `mapstructure:"write_timeout"` // seconds
	IdleTimeout  int    `mapstructure:"idle_timeout"`  // seconds
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	Host            string `mapstructure:"host"`
	Port            int    `mapstructure:"port"`
	User            string `mapstructure:"user"`
	Password        string `mapstructure:"password"`
	Database        string `mapstructure:"database"`
	SSLMode         string `mapstructure:"sslmode"`
	MaxOpenConns    int    `mapstructure:"max_open_conns"`
	MaxIdleConns    int    `mapstructure:"max_idle_conns"`
	ConnMaxLifetime int    `mapstructure:"conn_max_lifetime"`  // minutes
	ConnMaxIdleTime int    `mapstructure:"conn_max_idle_time"` // minutes
}

// RedisConfig holds Redis configuration
type RedisConfig struct {
	Host         string `mapstructure:"host"`
	Port         int    `mapstructure:"port"`
	Password     string `mapstructure:"password"`
	DB           int    `mapstructure:"db"`
	PoolSize     int    `mapstructure:"pool_size"`
	MinIdleConns int    `mapstructure:"min_idle_conns"`
	IdleTimeout  int    `mapstructure:"idle_timeout"` // minutes
}

// RabbitMQConfig holds RabbitMQ configuration
type RabbitMQConfig struct {
	Host         string `mapstructure:"host"`
	Port         int    `mapstructure:"port"`
	User         string `mapstructure:"user"`
	Password     string `mapstructure:"password"`
	VHost        string `mapstructure:"vhost"`
	Exchange     string `mapstructure:"exchange"`
	Queue        string `mapstructure:"queue"`
	DLQ          string `mapstructure:"dlq"`
	RoutingKey   string `mapstructure:"routing_key"`
	MaxRetries   int    `mapstructure:"max_retries"`
	RetryDelay   int    `mapstructure:"retry_delay"` // seconds
}

// AppConfig holds application-specific configuration
type AppConfig struct {
	Name         string `mapstructure:"name"`
	Version      string `mapstructure:"version"`
	Environment  string `mapstructure:"environment"`
	Debug        bool   `mapstructure:"debug"`
	Idempotency  IdempotencyConfig `mapstructure:"idempotency"`
	External     ExternalConfig    `mapstructure:"external"`
}

// IdempotencyConfig holds idempotency settings
type IdempotencyConfig struct {
	TTL         int    `mapstructure:"ttl"`          // seconds
	KeyPrefix   string `mapstructure:"key_prefix"`
	Enabled     bool   `mapstructure:"enabled"`
}

// ExternalConfig holds external service configurations
type ExternalConfig struct {
	Stock   ServiceConfig `mapstructure:"stock"`
	Payment ServiceConfig `mapstructure:"payment"`
	Email   ServiceConfig `mapstructure:"email"`
}

// ServiceConfig holds external service configuration
type ServiceConfig struct {
	Enabled        bool   `mapstructure:"enabled"`
	URL            string `mapstructure:"url"`
	Timeout        int    `mapstructure:"timeout"`         // seconds
	MaxRetries     int    `mapstructure:"max_retries"`
	RetryDelay     int    `mapstructure:"retry_delay"`     // seconds
	CircuitBreaker CircuitBreakerConfig `mapstructure:"circuit_breaker"`
}

// CircuitBreakerConfig holds circuit breaker configuration
type CircuitBreakerConfig struct {
	Enabled           bool   `mapstructure:"enabled"`
	FailureThreshold  int    `mapstructure:"failure_threshold"`
	RecoveryTimeout   int    `mapstructure:"recovery_timeout"`   // seconds
	HalfOpenRequests  int    `mapstructure:"half_open_requests"`
}

// DBStats represents database connection pool statistics
type DBStats struct {
	OpenConnections int
	InUse          int
	Idle           int
	WaitCount      int64
	WaitDuration   time.Duration
	MaxOpenConns   int
	MaxIdleConns   int
	MaxLifetime    time.Duration
	MaxIdleTime    time.Duration
}

// DB is an alias for sql.DB to avoid circular imports
type DB = sql.DB

// Load loads configuration from files and environment variables
func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./configs")
	viper.AddConfigPath("/etc/order-processor/")
	viper.AddConfigPath("$HOME/.order-processor")

	// Set environment variable prefix
	viper.SetEnvPrefix("ORDER")
	viper.AutomaticEnv()
	
	// Replace dots and dashes with underscores for environment variables
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_", "-", "_"))

	// Set default values
	setDefaults()

	// Read config file
	if err := viper.ReadInConfig(); err != nil {
		// Config file is optional, continue with defaults and env vars
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("error reading config file: %w", err)
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("error unmarshaling config: %w", err)
	}

	// Validate configuration
	if err := validateConfig(&config); err != nil {
		return nil, fmt.Errorf("configuration validation failed: %w", err)
	}

	return &config, nil
}

// setDefaults sets default configuration values
func setDefaults() {
	// Server defaults
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("server.read_timeout", 30)
	viper.SetDefault("server.write_timeout", 30)
	viper.SetDefault("server.idle_timeout", 120)

	// Database defaults
	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", 5432)
	viper.SetDefault("database.user", "postgres")
	viper.SetDefault("database.password", "postgres")
	viper.SetDefault("database.database", "order_processor")
	viper.SetDefault("database.sslmode", "disable")
	viper.SetDefault("database.max_open_conns", 25)
	viper.SetDefault("database.max_idle_conns", 5)
	viper.SetDefault("database.conn_max_lifetime", 30)
	viper.SetDefault("database.conn_max_idle_time", 15)

	// Redis defaults
	viper.SetDefault("redis.host", "localhost")
	viper.SetDefault("redis.port", 6379)
	viper.SetDefault("redis.password", "")
	viper.SetDefault("redis.db", 0)
	viper.SetDefault("redis.pool_size", 10)
	viper.SetDefault("redis.min_idle_conns", 2)
	viper.SetDefault("redis.idle_timeout", 5)

	// RabbitMQ defaults
	viper.SetDefault("rabbitmq.host", "localhost")
	viper.SetDefault("rabbitmq.port", 5672)
	viper.SetDefault("rabbitmq.user", "guest")
	viper.SetDefault("rabbitmq.password", "guest")
	viper.SetDefault("rabbitmq.vhost", "/")
	viper.SetDefault("rabbitmq.exchange", "orders.exchange")
	viper.SetDefault("rabbitmq.queue", "orders.created")
	viper.SetDefault("rabbitmq.dlq", "orders.dlq")
	viper.SetDefault("rabbitmq.routing_key", "order.created")
	viper.SetDefault("rabbitmq.max_retries", 3)
	viper.SetDefault("rabbitmq.retry_delay", 5)

	// Logger defaults
	viper.SetDefault("logger.level", "info")
	viper.SetDefault("logger.format", "json")
	viper.SetDefault("logger.filename", "logs/application.log")
	viper.SetDefault("logger.max_size", 100)
	viper.SetDefault("logger.max_backups", 5)
	viper.SetDefault("logger.max_age", 30)
	viper.SetDefault("logger.compress", true)
	viper.SetDefault("logger.environment", "production")

	// App defaults
	viper.SetDefault("app.name", "order-processor")
	viper.SetDefault("app.version", "1.0.0")
	viper.SetDefault("app.environment", "production")
	viper.SetDefault("app.debug", false)

	// Idempotency defaults
	viper.SetDefault("app.idempotency.ttl", 3600) // 1 hour
	viper.SetDefault("app.idempotency.key_prefix", "idempotency:")
	viper.SetDefault("app.idempotency.enabled", true)

	// External services defaults
	setExternalServiceDefaults("stock")
	setExternalServiceDefaults("payment")
	setExternalServiceDefaults("email")
}

// setExternalServiceDefaults sets defaults for external services
func setExternalServiceDefaults(service string) {
	prefix := fmt.Sprintf("app.external.%s", service)
	viper.SetDefault(prefix+".enabled", true)
	viper.SetDefault(prefix+".timeout", 30)
	viper.SetDefault(prefix+".max_retries", 3)
	viper.SetDefault(prefix+".retry_delay", 1)
	
	// Circuit breaker defaults
	viper.SetDefault(prefix+".circuit_breaker.enabled", true)
	viper.SetDefault(prefix+".circuit_breaker.failure_threshold", 5)
	viper.SetDefault(prefix+".circuit_breaker.recovery_timeout", 30)
	viper.SetDefault(prefix+".circuit_breaker.half_open_requests", 3)
}

// validateConfig validates the configuration
func validateConfig(config *Config) error {
	if config.Server.Port <= 0 || config.Server.Port > 65535 {
		return fmt.Errorf("invalid server port: %d", config.Server.Port)
	}

	if config.Database.Host == "" {
		return fmt.Errorf("database host is required")
	}

	if config.Database.Port <= 0 || config.Database.Port > 65535 {
		return fmt.Errorf("invalid database port: %d", config.Database.Port)
	}

	if config.Redis.Host == "" {
		return fmt.Errorf("redis host is required")
	}

	if config.RabbitMQ.Host == "" {
		return fmt.Errorf("rabbitmq host is required")
	}

	return nil
}

// GetDatabaseURL returns the PostgreSQL connection URL
func (c *Config) GetDatabaseURL() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Database.Host,
		c.Database.Port,
		c.Database.User,
		c.Database.Password,
		c.Database.Database,
		c.Database.SSLMode,
	)
}

// GetRedisAddr returns the Redis address
func (c *Config) GetRedisAddr() string {
	return fmt.Sprintf("%s:%d", c.Redis.Host, c.Redis.Port)
}

// GetRabbitMQURL returns the RabbitMQ connection URL
func (c *Config) GetRabbitMQURL() string {
	return fmt.Sprintf("amqp://%s:%s@%s:%d%s",
		c.RabbitMQ.User,
		c.RabbitMQ.Password,
		c.RabbitMQ.Host,
		c.RabbitMQ.Port,
		c.RabbitMQ.VHost,
	)
}

// IsProduction returns true if the environment is production
func (c *Config) IsProduction() bool {
	return c.App.Environment == "production"
}

// IsDevelopment returns true if the environment is development
func (c *Config) IsDevelopment() bool {
	return c.App.Environment == "development"
}