package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/handler/http/dto"
)

// ValidationMiddleware creates a middleware for request validation
func ValidationMiddleware() gin.HandlerFunc {
	validate := validator.New()
	
	return func(c *gin.Context) {
		// Store validator in context for handlers
		c.Set("validator", validate)
		c.Next()
	}
}

// ValidateJSON validates JSON request body against a struct
func ValidateJSON(c *gin.Context, obj interface{}) bool {
	logger := GetLogger(c)
	correlationID := GetCorrelationID(c)
	
	// Bind JSON to struct
	if err := c.ShouldBindJSON(obj); err != nil {
		var validationErrors []dto.ValidationError
		
		// Check if it's a validation error
		if validationErr, ok := err.(validator.ValidationErrors); ok {
			for _, fieldErr := range validationErr {
				validationErrors = append(validationErrors, dto.ValidationError{
					Field:   getJSONFieldName(fieldErr),
					Value:   fieldErr.Value(),
					Tag:     fieldErr.Tag(),
					Message: getValidationErrorMessage(fieldErr),
				})
			}
		} else {
			// JSON parsing error
			validationErrors = append(validationErrors, dto.ValidationError{
				Field:   "body",
				Value:   nil,
				Tag:     "json",
				Message: "Invalid JSON format",
			})
		}
		
		logger.Warn("Request validation failed",
			zap.String("event", "validation_failed"),
			zap.String("path", c.Request.URL.Path),
			zap.String("method", c.Request.Method),
			zap.Any("validation_errors", validationErrors),
		)
		
		errorResponse := dto.ErrorResponse{
			Code:          dto.ErrorCodeValidation,
			Message:       "Validation failed for one or more fields",
			Details:       map[string]interface{}{"validation_errors": validationErrors},
			CorrelationID: correlationID,
			Timestamp:     time.Now(),
			Path:          c.Request.URL.Path,
		}
		
		c.JSON(http.StatusBadRequest, errorResponse)
		return false
	}
	
	return true
}

// ValidateQuery validates query parameters
func ValidateQuery(c *gin.Context, obj interface{}) bool {
	logger := GetLogger(c)
	correlationID := GetCorrelationID(c)
	
	// Bind query parameters to struct
	if err := c.ShouldBindQuery(obj); err != nil {
		var validationErrors []dto.ValidationError
		
		// Check if it's a validation error
		if validationErr, ok := err.(validator.ValidationErrors); ok {
			for _, fieldErr := range validationErr {
				validationErrors = append(validationErrors, dto.ValidationError{
					Field:   getQueryFieldName(fieldErr),
					Value:   fieldErr.Value(),
					Tag:     fieldErr.Tag(),
					Message: getValidationErrorMessage(fieldErr),
				})
			}
		} else {
			// Query parameter parsing error
			validationErrors = append(validationErrors, dto.ValidationError{
				Field:   "query",
				Value:   nil,
				Tag:     "format",
				Message: "Invalid query parameter format",
			})
		}
		
		logger.Warn("Query validation failed",
			zap.String("event", "query_validation_failed"),
			zap.String("path", c.Request.URL.Path),
			zap.String("method", c.Request.Method),
			zap.Any("validation_errors", validationErrors),
		)
		
		errorResponse := dto.ErrorResponse{
			Code:          dto.ErrorCodeValidation,
			Message:       "Validation failed for one or more query parameters",
			Details:       map[string]interface{}{"validation_errors": validationErrors},
			CorrelationID: correlationID,
			Timestamp:     time.Now(),
			Path:          c.Request.URL.Path,
		}
		
		c.JSON(http.StatusBadRequest, errorResponse)
		return false
	}
	
	return true
}

// ValidateUUID validates that a path parameter is a valid UUID
func ValidateUUID(c *gin.Context, paramName string) bool {
	logger := GetLogger(c)
	correlationID := GetCorrelationID(c)
	
	param := c.Param(paramName)
	if param == "" {
		logger.Warn("Missing required UUID parameter",
			zap.String("event", "missing_uuid_param"),
			zap.String("param_name", paramName),
			zap.String("path", c.Request.URL.Path),
		)
		
		errorResponse := dto.ErrorResponse{
			Code:          dto.ErrorCodeMissingField,
			Message:       "Missing required parameter: " + paramName,
			CorrelationID: correlationID,
			Timestamp:     time.Now(),
			Path:          c.Request.URL.Path,
		}
		
		c.JSON(http.StatusBadRequest, errorResponse)
		return false
	}
	
	// Validate UUID format using regex (basic validation)
	if !isValidUUID(param) {
		logger.Warn("Invalid UUID parameter format",
			zap.String("event", "invalid_uuid_param"),
			zap.String("param_name", paramName),
			zap.String("param_value", param),
			zap.String("path", c.Request.URL.Path),
		)
		
		errorResponse := dto.ErrorResponse{
			Code:          dto.ErrorCodeInvalidFormat,
			Message:       "Invalid UUID format for parameter: " + paramName,
			Details: map[string]interface{}{
				"parameter": paramName,
				"value":     param,
				"expected":  "UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000)",
			},
			CorrelationID: correlationID,
			Timestamp:     time.Now(),
			Path:          c.Request.URL.Path,
		}
		
		c.JSON(http.StatusBadRequest, errorResponse)
		return false
	}
	
	return true
}

// Helper functions

func getJSONFieldName(fieldErr validator.FieldError) string {
	// Convert struct field name to JSON field name (snake_case)
	return toSnakeCase(fieldErr.Field())
}

func getQueryFieldName(fieldErr validator.FieldError) string {
	// Query parameters are typically already in snake_case
	return strings.ToLower(fieldErr.Field())
}

func toSnakeCase(str string) string {
	var result strings.Builder
	for i, r := range str {
		if i > 0 && r >= 'A' && r <= 'Z' {
			result.WriteRune('_')
		}
		result.WriteRune(r)
	}
	return strings.ToLower(result.String())
}

func getValidationErrorMessage(fieldErr validator.FieldError) string {
	switch fieldErr.Tag() {
	case "required":
		return "This field is required"
	case "email":
		return "Must be a valid email address"
	case "min":
		if fieldErr.Kind().String() == "string" {
			return "Must be at least " + fieldErr.Param() + " characters long"
		}
		return "Must be at least " + fieldErr.Param()
	case "max":
		if fieldErr.Kind().String() == "string" {
			return "Must be at most " + fieldErr.Param() + " characters long"
		}
		return "Must be at most " + fieldErr.Param()
	case "uuid":
		return "Must be a valid UUID"
	case "oneof":
		return "Must be one of: " + fieldErr.Param()
	default:
		return "Invalid value"
	}
}

func isValidUUID(uuid string) bool {
	// Basic UUID format validation (8-4-4-4-12 pattern)
	if len(uuid) != 36 {
		return false
	}
	
	// Check hyphen positions
	if uuid[8] != '-' || uuid[13] != '-' || uuid[18] != '-' || uuid[23] != '-' {
		return false
	}
	
	// Check that all other characters are hexadecimal
	for i, r := range uuid {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			continue // Skip hyphens
		}
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}
	
	return true
}

// GetValidator extracts the validator from gin context
func GetValidator(c *gin.Context) *validator.Validate {
	if validate, exists := c.Get("validator"); exists {
		if v, ok := validate.(*validator.Validate); ok {
			return v
		}
	}
	// Fallback to new validator if not found
	return validator.New()
}