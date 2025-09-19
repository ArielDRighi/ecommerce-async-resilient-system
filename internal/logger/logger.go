package logger

import (
	"os"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var (
	// Logger is the global logger instance
	Logger *zap.Logger
	// SugaredLogger is the global sugared logger instance for easier usage
	SugaredLogger *zap.SugaredLogger
)

// Config holds the configuration for the logger
type Config struct {
	Level       string `mapstructure:"level"`       // debug, info, warn, error
	Format      string `mapstructure:"format"`      // json, console
	Filename    string `mapstructure:"filename"`    // log file path
	MaxSize     int    `mapstructure:"max_size"`    // megabytes
	MaxBackups  int    `mapstructure:"max_backups"` // number of backups
	MaxAge      int    `mapstructure:"max_age"`     // days
	Compress    bool   `mapstructure:"compress"`    // compress rotated files
	Environment string `mapstructure:"environment"` // development, production
}

// DefaultConfig returns default logger configuration
func DefaultConfig() Config {
	return Config{
		Level:       "info",
		Format:      "json",
		Filename:    "logs/application.log",
		MaxSize:     100, // 100MB
		MaxBackups:  5,
		MaxAge:      30, // 30 days
		Compress:    true,
		Environment: "production",
	}
}

// Initialize initializes the global logger with the given configuration
func Initialize(config Config) error {
	// Parse log level
	level, err := zapcore.ParseLevel(config.Level)
	if err != nil {
		return err
	}

	// Create encoder config
	var encoderConfig zapcore.EncoderConfig
	if config.Environment == "development" {
		encoderConfig = zap.NewDevelopmentEncoderConfig()
		encoderConfig.EncodeTime = zapcore.TimeEncoderOfLayout(time.RFC3339)
	} else {
		encoderConfig = zap.NewProductionEncoderConfig()
		encoderConfig.EncodeTime = zapcore.EpochTimeEncoder
		encoderConfig.TimeKey = "timestamp"
		encoderConfig.LevelKey = "level"
		encoderConfig.MessageKey = "message"
		encoderConfig.CallerKey = "caller"
		encoderConfig.StacktraceKey = "stacktrace"
	}

	// Create encoder
	var encoder zapcore.Encoder
	if config.Format == "console" {
		encoder = zapcore.NewConsoleEncoder(encoderConfig)
	} else {
		encoder = zapcore.NewJSONEncoder(encoderConfig)
	}

	// Create writer syncer for file output with rotation
	fileWriter := &lumberjack.Logger{
		Filename:   config.Filename,
		MaxSize:    config.MaxSize,
		MaxBackups: config.MaxBackups,
		MaxAge:     config.MaxAge,
		Compress:   config.Compress,
	}

	// Create core with both file and console output
	var cores []zapcore.Core

	// File output
	cores = append(cores, zapcore.NewCore(encoder, zapcore.AddSync(fileWriter), level))

	// Console output for development or if format is console
	if config.Environment == "development" || config.Format == "console" {
		consoleEncoder := zapcore.NewConsoleEncoder(encoderConfig)
		cores = append(cores, zapcore.NewCore(consoleEncoder, zapcore.AddSync(os.Stdout), level))
	}

	// Create tee core
	core := zapcore.NewTee(cores...)

	// Create logger with caller information and stack traces for errors
	Logger = zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))
	SugaredLogger = Logger.Sugar()

	return nil
}

// WithCorrelationID adds correlation ID to the logger context
func WithCorrelationID(correlationID string) *zap.Logger {
	return Logger.With(zap.String("correlation_id", correlationID))
}

// WithCorrelationIDSugar adds correlation ID to the sugared logger context
func WithCorrelationIDSugar(correlationID string) *zap.SugaredLogger {
	return SugaredLogger.With("correlation_id", correlationID)
}

// WithComponent adds component name to the logger context
func WithComponent(component string) *zap.Logger {
	return Logger.With(zap.String("component", component))
}

// WithComponentSugar adds component name to the sugared logger context
func WithComponentSugar(component string) *zap.SugaredLogger {
	return SugaredLogger.With("component", component)
}

// WithRequestInfo adds request information to the logger context
func WithRequestInfo(method, path, userAgent, clientIP string) *zap.Logger {
	return Logger.With(
		zap.String("http_method", method),
		zap.String("http_path", path),
		zap.String("user_agent", userAgent),
		zap.String("client_ip", clientIP),
	)
}

// WithPerformance adds performance metrics to the logger context
func WithPerformance(duration time.Duration, statusCode int) *zap.Logger {
	return Logger.With(
		zap.Duration("duration", duration),
		zap.Int("status_code", statusCode),
		zap.Float64("duration_ms", float64(duration.Nanoseconds())/1e6),
	)
}

// WithError adds error information to the logger context
func WithError(err error) *zap.Logger {
	return Logger.With(zap.Error(err))
}

// WithBusinessContext adds business context information
func WithBusinessContext(customerID, orderID string) *zap.Logger {
	return Logger.With(
		zap.String("customer_id", customerID),
		zap.String("order_id", orderID),
	)
}

// LogOrderEvent logs order-related business events
func LogOrderEvent(correlationID, orderID, event, status string, details map[string]interface{}) {
	logger := WithCorrelationID(correlationID).With(
		zap.String("order_id", orderID),
		zap.String("event_type", event),
		zap.String("status", status),
		zap.Any("details", details),
	)
	logger.Info("Order event")
}

// LogPerformanceMetric logs performance metrics
func LogPerformanceMetric(correlationID, operation string, duration time.Duration, success bool, metadata map[string]interface{}) {
	logger := WithCorrelationID(correlationID).With(
		zap.String("operation", operation),
		zap.Duration("duration", duration),
		zap.Float64("duration_ms", float64(duration.Nanoseconds())/1e6),
		zap.Bool("success", success),
		zap.Any("metadata", metadata),
	)
	logger.Info("Performance metric")
}

// Sync flushes any buffered log entries
func Sync() {
	if Logger != nil {
		_ = Logger.Sync()
	}
}

// Close closes the logger and flushes any remaining entries
func Close() {
	if Logger != nil {
		_ = Logger.Sync()
	}
}