package middleware

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// CorrelationIDKey is the key used to store correlation ID in context
const CorrelationIDKey = "correlation_id"

// CorrelationIDHeader is the HTTP header name for correlation ID
const CorrelationIDHeader = "X-Correlation-ID"

// Logger creates a structured logging middleware using zap
// This middleware logs request start, end, and performance metrics
func Logger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		
		// Generate or extract correlation ID
		correlationID := c.GetHeader(CorrelationIDHeader)
		if correlationID == "" {
			correlationID = "req_" + uuid.New().String()
		}
		
		// Store correlation ID in context for other middleware and handlers
		c.Set(CorrelationIDKey, correlationID)
		c.Header(CorrelationIDHeader, correlationID)
		
		// Create logger with correlation ID
		requestLogger := logger.With(
			zap.String("correlation_id", correlationID),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.String("query", c.Request.URL.RawQuery),
			zap.String("user_agent", c.Request.UserAgent()),
			zap.String("remote_addr", c.ClientIP()),
		)
		
		// Log request start
		requestLogger.Info("Request started",
			zap.String("event", "request_start"),
		)
		
		// Store logger in context for handlers
		c.Set("logger", requestLogger)
		
		// Process request
		c.Next()
		
		// Calculate duration
		duration := time.Since(start)
		
		// Log request completion with metrics
		fields := []zap.Field{
			zap.String("event", "request_complete"),
			zap.Int("status", c.Writer.Status()),
			zap.Duration("duration", duration),
			zap.Int("response_size", c.Writer.Size()),
		}
		
		// Add error information if present
		if len(c.Errors) > 0 {
			fields = append(fields, zap.String("errors", c.Errors.String()))
		}
		
		// Log based on status code
		switch {
		case c.Writer.Status() >= 500:
			requestLogger.Error("Request completed with server error", fields...)
		case c.Writer.Status() >= 400:
			requestLogger.Warn("Request completed with client error", fields...)
		default:
			requestLogger.Info("Request completed successfully", fields...)
		}
		
		// Log performance metrics for monitoring
		requestLogger.Info("Request metrics",
			zap.String("event", "request_metrics"),
			zap.String("endpoint", c.Request.Method+" "+c.FullPath()),
			zap.Duration("response_time", duration),
			zap.Int("status_code", c.Writer.Status()),
			zap.Int("response_size_bytes", c.Writer.Size()),
		)
	}
}

// GetLogger extracts the logger from gin context
func GetLogger(c *gin.Context) *zap.Logger {
	if logger, exists := c.Get("logger"); exists {
		if zapLogger, ok := logger.(*zap.Logger); ok {
			return zapLogger
		}
	}
	// Fallback to a basic logger if not found
	logger, _ := zap.NewProduction()
	return logger
}

// GetCorrelationID extracts the correlation ID from gin context
func GetCorrelationID(c *gin.Context) string {
	if correlationID, exists := c.Get(CorrelationIDKey); exists {
		if id, ok := correlationID.(string); ok {
			return id
		}
	}
	return ""
}

// AddCorrelationIDToContext adds correlation ID to Go context
func AddCorrelationIDToContext(ctx context.Context, correlationID string) context.Context {
	return context.WithValue(ctx, CorrelationIDKey, correlationID)
}

// GetCorrelationIDFromContext extracts correlation ID from Go context
func GetCorrelationIDFromContext(ctx context.Context) string {
	if correlationID := ctx.Value(CorrelationIDKey); correlationID != nil {
		if id, ok := correlationID.(string); ok {
			return id
		}
	}
	return ""
}