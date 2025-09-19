package dto

import (
	"time"
)

// ErrorResponse represents a standardized error response
// @Description Standardized error response structure
type ErrorResponse struct {
	// Error code
	// @Description Machine-readable error code for programmatic handling
	// @Example "VALIDATION_ERROR"
	Code string `json:"code" example:"VALIDATION_ERROR"`

	// Error message
	// @Description Human-readable error message
	// @Example "Validation failed for one or more fields"
	Message string `json:"message" example:"Validation failed for one or more fields"`

	// Detailed error information
	// @Description Additional details about the error
	Details interface{} `json:"details,omitempty" swaggertype:"object"`

	// Correlation ID for tracking
	// @Description Correlation ID for tracking this request through logs
	// @Example "req_789e0123-e89b-12d3-a456-426614174002"
	CorrelationID string `json:"correlation_id" example:"req_789e0123-e89b-12d3-a456-426614174002"`

	// Timestamp when error occurred
	// @Description When this error occurred (RFC3339 format)
	// @Example "2024-01-15T10:30:00Z"
	Timestamp time.Time `json:"timestamp" example:"2024-01-15T10:30:00Z"`

	// Request path where error occurred
	// @Description The API endpoint path where this error occurred
	// @Example "/api/v1/orders"
	Path string `json:"path" example:"/api/v1/orders"`
}

// ValidationError represents detailed validation error information
// @Description Detailed validation error for specific fields
type ValidationError struct {
	// Field name that failed validation
	// @Description Name of the field that failed validation
	// @Example "customer_email"
	Field string `json:"field" example:"customer_email"`

	// Value that caused the validation failure
	// @Description The value that was provided for this field
	// @Example "invalid-email"
	Value interface{} `json:"value" example:"invalid-email"`

	// Validation rule that was violated
	// @Description The validation rule that was not satisfied
	// @Example "email"
	Tag string `json:"tag" example:"email"`

	// Human-readable error message for this field
	// @Description User-friendly message explaining the validation error
	// @Example "must be a valid email address"
	Message string `json:"message" example:"must be a valid email address"`
}

// BusinessError represents domain-specific business logic errors
// @Description Business logic error with domain context
type BusinessError struct {
	// Business error type
	// @Description Type of business error that occurred
	// @Example "INSUFFICIENT_STOCK"
	Type string `json:"type" example:"INSUFFICIENT_STOCK"`

	// Entity ID related to the error
	// @Description Identifier of the entity that caused the error
	// @Example "456e7890-e89b-12d3-a456-426614174001"
	EntityID string `json:"entity_id,omitempty" example:"456e7890-e89b-12d3-a456-426614174001"`

	// Human-readable error message
	// @Description User-friendly message explaining the business error
	// @Example "Product is out of stock"
	Message string `json:"message" example:"Product is out of stock"`

	// Additional context about the error
	// @Description Additional information that might help resolve the error
	Context map[string]interface{} `json:"context,omitempty"`
}

// Common error codes used throughout the API
const (
	// Validation errors
	ErrorCodeValidation    = "VALIDATION_ERROR"
	ErrorCodeMissingField  = "MISSING_REQUIRED_FIELD"
	ErrorCodeInvalidFormat = "INVALID_FORMAT"

	// Authentication and authorization errors
	ErrorCodeUnauthorized = "UNAUTHORIZED"
	ErrorCodeForbidden    = "FORBIDDEN"
	ErrorCodeInvalidToken = "INVALID_TOKEN"

	// Resource errors
	ErrorCodeNotFound      = "RESOURCE_NOT_FOUND"
	ErrorCodeAlreadyExists = "RESOURCE_ALREADY_EXISTS"
	ErrorCodeConflict      = "RESOURCE_CONFLICT"

	// Business logic errors
	ErrorCodeInsufficientStock = "INSUFFICIENT_STOCK"
	ErrorCodePaymentFailed     = "PAYMENT_FAILED"
	ErrorCodeOrderNotEditable  = "ORDER_NOT_EDITABLE"

	// System errors
	ErrorCodeInternalServer = "INTERNAL_SERVER_ERROR"
	ErrorCodeServiceUnavailable = "SERVICE_UNAVAILABLE"
	ErrorCodeTimeout        = "REQUEST_TIMEOUT"
	ErrorCodeRateLimit      = "RATE_LIMIT_EXCEEDED"

	// Idempotency errors
	ErrorCodeDuplicateRequest = "DUPLICATE_REQUEST"
	ErrorCodeIdempotencyKeyConflict = "IDEMPOTENCY_KEY_CONFLICT"
)

// HTTP status code mappings for error codes
var ErrorCodeStatusMap = map[string]int{
	ErrorCodeValidation:     400,
	ErrorCodeMissingField:   400,
	ErrorCodeInvalidFormat:  400,
	ErrorCodeUnauthorized:   401,
	ErrorCodeForbidden:      403,
	ErrorCodeInvalidToken:   401,
	ErrorCodeNotFound:       404,
	ErrorCodeAlreadyExists:  409,
	ErrorCodeConflict:       409,
	ErrorCodeInsufficientStock: 409,
	ErrorCodePaymentFailed:     422,
	ErrorCodeOrderNotEditable:  422,
	ErrorCodeInternalServer:    500,
	ErrorCodeServiceUnavailable: 503,
	ErrorCodeTimeout:           408,
	ErrorCodeRateLimit:         429,
	ErrorCodeDuplicateRequest:  409,
	ErrorCodeIdempotencyKeyConflict: 409,
}