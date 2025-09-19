package logger

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

const (
	// CorrelationIDHeader is the header name for correlation ID
	CorrelationIDHeader = "X-Correlation-ID"
	// CorrelationIDKey is the key used to store correlation ID in gin context
	CorrelationIDKey = "correlation_id"
)

// GinLogger returns a gin.HandlerFunc for request logging with structured logging
func GinLogger() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		// Generate or extract correlation ID
		correlationID := c.GetHeader(CorrelationIDHeader)
		if correlationID == "" {
			correlationID = uuid.New().String()
		}

		// Store correlation ID in context for use in other handlers
		c.Set(CorrelationIDKey, correlationID)

		// Set correlation ID header in response
		c.Header(CorrelationIDHeader, correlationID)

		// Capture start time
		start := time.Now()

		// Create request-scoped logger
		requestLogger := WithCorrelationID(correlationID).With(
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.String("query", c.Request.URL.RawQuery),
			zap.String("user_agent", c.Request.UserAgent()),
			zap.String("client_ip", c.ClientIP()),
			zap.String("protocol", c.Request.Proto),
		)

		// Log request start
		requestLogger.Info("Request started")

		// Process request
		c.Next()

		// Calculate request duration
		duration := time.Since(start)

		// Get response size
		responseSize := c.Writer.Size()

		// Create response logger with additional fields
		responseLogger := requestLogger.With(
			zap.Int("status_code", c.Writer.Status()),
			zap.Duration("duration", duration),
			zap.Float64("duration_ms", float64(duration.Nanoseconds())/1e6),
			zap.Int("response_size", responseSize),
		)

		// Log response based on status code
		if c.Writer.Status() >= 500 {
			responseLogger.Error("Request completed with server error")
		} else if c.Writer.Status() >= 400 {
			responseLogger.Warn("Request completed with client error")
		} else {
			responseLogger.Info("Request completed successfully")
		}

		// Log performance metrics for slow requests (>1 second)
		if duration > time.Second {
			LogPerformanceMetric(
				correlationID,
				"http_request_slow",
				duration,
				c.Writer.Status() < 400,
				map[string]interface{}{
					"method":      c.Request.Method,
					"path":        c.Request.URL.Path,
					"status_code": c.Writer.Status(),
				},
			)
		}
	})
}

// GinRecovery returns a gin.HandlerFunc for panic recovery with structured logging
func GinRecovery() gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		correlationID := GetCorrelationID(c)
		
		recoveryLogger := WithCorrelationID(correlationID).With(
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Any("panic", recovered),
		)

		recoveryLogger.Error("Panic recovered")

		// Return 500 Internal Server Error
		c.JSON(500, gin.H{
			"error":          "Internal Server Error",
			"correlation_id": correlationID,
			"timestamp":      time.Now().Format(time.RFC3339),
		})
	})
}

// GetCorrelationID retrieves the correlation ID from gin context
func GetCorrelationID(c *gin.Context) string {
	if correlationID, exists := c.Get(CorrelationIDKey); exists {
		if id, ok := correlationID.(string); ok {
			return id
		}
	}
	return ""
}

// LogRequestBody logs request body for debugging (use with caution for sensitive data)
func LogRequestBody() gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		correlationID := GetCorrelationID(c)
		
		// Only log for specific content types and in development
		contentType := c.GetHeader("Content-Type")
		if contentType == "application/json" {
			// Note: This is for debugging only, be careful with sensitive data
			requestLogger := WithCorrelationID(correlationID)
			requestLogger.Debug("Request body logging enabled")
		}
		
		c.Next()
	})
}

// LogBusinessEvent logs business-specific events from HTTP handlers
func LogBusinessEventFromContext(c *gin.Context, event, status string, details map[string]interface{}) {
	correlationID := GetCorrelationID(c)
	
	// Extract order ID if present in the context or URL params
	orderID := c.Param("id")
	if orderID == "" {
		if id, exists := c.Get("order_id"); exists {
			if oid, ok := id.(string); ok {
				orderID = oid
			}
		}
	}
	
	LogOrderEvent(correlationID, orderID, event, status, details)
}

// SecurityLogger logs security-related events
func SecurityLogger(event string, details map[string]interface{}) gin.HandlerFunc {
	return gin.HandlerFunc(func(c *gin.Context) {
		correlationID := GetCorrelationID(c)
		
		securityLogger := WithCorrelationID(correlationID).With(
			zap.String("security_event", event),
			zap.String("client_ip", c.ClientIP()),
			zap.String("user_agent", c.Request.UserAgent()),
			zap.Any("details", details),
		)
		
		securityLogger.Warn("Security event")
		c.Next()
	})
}