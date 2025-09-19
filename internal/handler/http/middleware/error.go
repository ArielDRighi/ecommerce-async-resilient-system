package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/handler/http/dto"
)

// ErrorHandler creates a middleware that handles panics and errors
// It provides structured error responses and comprehensive error logging
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				logger := GetLogger(c)
				correlationID := GetCorrelationID(c)
				
				// Log the panic with full context
				logger.Error("Panic recovered",
					zap.String("event", "panic_recovered"),
					zap.Any("panic", err),
					zap.String("path", c.Request.URL.Path),
					zap.String("method", c.Request.Method),
					zap.Stack("stack_trace"),
				)
				
				// Return internal server error response
				errorResponse := dto.ErrorResponse{
					Code:          dto.ErrorCodeInternalServer,
					Message:       "An internal server error occurred",
					CorrelationID: correlationID,
					Timestamp:     time.Now(),
					Path:          c.Request.URL.Path,
				}
				
				c.JSON(http.StatusInternalServerError, errorResponse)
				c.Abort()
			}
		}()
		
		// Process request
		c.Next()
		
		// Handle any errors that were added during request processing
		if len(c.Errors) > 0 {
			logger := GetLogger(c)
			correlationID := GetCorrelationID(c)
			
			// Get the last error (most recent)
			err := c.Errors.Last()
			
			// Log the error with context
			logger.Error("Request error",
				zap.String("event", "request_error"),
				zap.Error(err),
				zap.String("path", c.Request.URL.Path),
				zap.String("method", c.Request.Method),
				zap.Any("error_meta", err.Meta),
			)
			
			// If response wasn't already written, send error response
			if !c.Writer.Written() {
				var errorResponse dto.ErrorResponse
				var statusCode int
				
				// Try to extract structured error information
				if businessErr, ok := err.Meta.(*dto.BusinessError); ok {
					errorResponse = dto.ErrorResponse{
						Code:          businessErr.Type,
						Message:       businessErr.Message,
						Details:       businessErr,
						CorrelationID: correlationID,
						Timestamp:     time.Now(),
						Path:          c.Request.URL.Path,
					}
					statusCode = getStatusCodeForError(businessErr.Type)
				} else {
					// Generic error response
					errorResponse = dto.ErrorResponse{
						Code:          dto.ErrorCodeInternalServer,
						Message:       "An error occurred while processing your request",
						CorrelationID: correlationID,
						Timestamp:     time.Now(),
						Path:          c.Request.URL.Path,
					}
					statusCode = http.StatusInternalServerError
				}
				
				c.JSON(statusCode, errorResponse)
			}
		}
	}
}

// getStatusCodeForError maps error codes to HTTP status codes
func getStatusCodeForError(errorCode string) int {
	if statusCode, exists := dto.ErrorCodeStatusMap[errorCode]; exists {
		return statusCode
	}
	return http.StatusInternalServerError
}

// AbortWithError is a helper function to abort request with structured error
func AbortWithError(c *gin.Context, statusCode int, errorCode, message string, details interface{}) {
	correlationID := GetCorrelationID(c)
	
	errorResponse := dto.ErrorResponse{
		Code:          errorCode,
		Message:       message,
		Details:       details,
		CorrelationID: correlationID,
		Timestamp:     time.Now(),
		Path:          c.Request.URL.Path,
	}
	
	// Log the error
	logger := GetLogger(c)
	logger.Error("Request aborted with error",
		zap.String("event", "request_aborted"),
		zap.String("error_code", errorCode),
		zap.String("error_message", message),
		zap.Int("status_code", statusCode),
		zap.Any("error_details", details),
	)
	
	c.JSON(statusCode, errorResponse)
	c.Abort()
}

// AbortWithBusinessError is a helper function to abort request with business logic error
func AbortWithBusinessError(c *gin.Context, businessErr *dto.BusinessError) {
	statusCode := getStatusCodeForError(businessErr.Type)
	correlationID := GetCorrelationID(c)
	
	errorResponse := dto.ErrorResponse{
		Code:          businessErr.Type,
		Message:       businessErr.Message,
		Details:       businessErr,
		CorrelationID: correlationID,
		Timestamp:     time.Now(),
		Path:          c.Request.URL.Path,
	}
	
	// Log the business error
	logger := GetLogger(c)
	logger.Warn("Business logic error",
		zap.String("event", "business_error"),
		zap.String("error_type", businessErr.Type),
		zap.String("error_message", businessErr.Message),
		zap.String("entity_id", businessErr.EntityID),
		zap.Int("status_code", statusCode),
		zap.Any("error_context", businessErr.Context),
	)
	
	c.JSON(statusCode, errorResponse)
	c.Abort()
}