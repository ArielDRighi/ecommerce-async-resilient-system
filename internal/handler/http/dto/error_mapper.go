package dto

import (
	"errors"
	"net/http"
	"time"

	"github.com/username/order-processor/internal/domain"
)

// DomainErrorMapper maps domain errors to HTTP responses
type DomainErrorMapper struct{}

// NewDomainErrorMapper creates a new domain error mapper
func NewDomainErrorMapper() *DomainErrorMapper {
	return &DomainErrorMapper{}
}

// MapDomainErrorToHTTP converts domain errors to appropriate HTTP responses
func (m *DomainErrorMapper) MapDomainErrorToHTTP(err error, correlationID, path string) (int, ErrorResponse) {
	// Handle domain errors
	var domainErr *domain.DomainError
	if errors.As(err, &domainErr) {
		return m.mapDomainError(domainErr, correlationID, path)
	}

	// Handle specific domain validation errors
	switch {
	case errors.Is(err, domain.ErrEmailRequired):
		return m.createValidationError("customer_email", "email is required", correlationID, path)
	case errors.Is(err, domain.ErrInvalidEmailFormat):
		return m.createValidationError("customer_email", "invalid email format", correlationID, path)
	case errors.Is(err, domain.ErrEmailTooLong):
		return m.createValidationError("customer_email", "email address too long (max 254 characters)", correlationID, path)
	
	case errors.Is(err, domain.ErrCustomerIDRequired):
		return m.createValidationError("customer_id", "customer ID is required", correlationID, path)
	case errors.Is(err, domain.ErrCustomerEmailRequired):
		return m.createValidationError("customer_email", "customer email is required", correlationID, path)
	case errors.Is(err, domain.ErrOrderItemsRequired):
		return m.createValidationError("items", "order must have at least one item", correlationID, path)
	
	case errors.Is(err, domain.ErrProductIDRequired):
		return m.createValidationError("product_id", "product ID is required", correlationID, path)
	case errors.Is(err, domain.ErrProductNameRequired):
		return m.createValidationError("product_name", "product name is required", correlationID, path)
	case errors.Is(err, domain.ErrInvalidQuantity):
		return m.createValidationError("quantity", "quantity must be positive", correlationID, path)
	case errors.Is(err, domain.ErrInvalidUnitPrice):
		return m.createValidationError("unit_price", "unit price must be positive", correlationID, path)
	
	case errors.Is(err, domain.ErrInvalidAmount):
		return m.createValidationError("amount", "amount must be non-negative", correlationID, path)
	case errors.Is(err, domain.ErrInvalidCurrency):
		return m.createValidationError("currency", "invalid currency code", correlationID, path)
	
	case errors.Is(err, domain.ErrInvalidOrderStatus):
		return m.createValidationError("status", "invalid order status", correlationID, path)
	case errors.Is(err, domain.ErrInvalidStatusTransition):
		return m.createBusinessRuleError("invalid status transition", correlationID, path)
	
	case errors.Is(err, domain.ErrItemNotFound):
		return m.createNotFoundError("order item not found", correlationID, path)
	
	default:
		// Unknown error - return as internal server error
		return m.createInternalError(err.Error(), correlationID, path)
	}
}

// mapDomainError handles structured domain errors
func (m *DomainErrorMapper) mapDomainError(domainErr *domain.DomainError, correlationID, path string) (int, ErrorResponse) {
	switch domainErr.Code {
	case "VALIDATION_ERROR":
		return m.createValidationErrorWithField(domainErr.Field, domainErr.Message, correlationID, path)
	case "BUSINESS_RULE_ERROR":
		return m.createBusinessRuleError(domainErr.Message, correlationID, path)
	default:
		return m.createInternalError(domainErr.Message, correlationID, path)
	}
}

// Helper methods for creating specific error responses

func (m *DomainErrorMapper) createValidationError(field, message, correlationID, path string) (int, ErrorResponse) {
	return http.StatusBadRequest, ErrorResponse{
		Code:          ErrorCodeValidation,
		Message:       "Validation failed",
		Details: map[string]interface{}{
			"validation_errors": []map[string]string{
				{"field": field, "message": message},
			},
		},
		CorrelationID: correlationID,
		Timestamp:     time.Now(),
		Path:          path,
	}
}

func (m *DomainErrorMapper) createValidationErrorWithField(field, message, correlationID, path string) (int, ErrorResponse) {
	if field == "" {
		return m.createValidationError("general", message, correlationID, path)
	}
	return m.createValidationError(field, message, correlationID, path)
}

func (m *DomainErrorMapper) createBusinessRuleError(message, correlationID, path string) (int, ErrorResponse) {
	return http.StatusUnprocessableEntity, ErrorResponse{
		Code:          ErrorCodeOrderNotEditable, // Use existing business rule error code
		Message:       "Business rule violation",
		Details: map[string]interface{}{
			"business_rule_error": message,
		},
		CorrelationID: correlationID,
		Timestamp:     time.Now(),
		Path:          path,
	}
}

func (m *DomainErrorMapper) createNotFoundError(message, correlationID, path string) (int, ErrorResponse) {
	return http.StatusNotFound, ErrorResponse{
		Code:          ErrorCodeNotFound,
		Message:       message,
		Details:       map[string]interface{}{},
		CorrelationID: correlationID,
		Timestamp:     time.Now(),
		Path:          path,
	}
}

func (m *DomainErrorMapper) createInternalError(message, correlationID, path string) (int, ErrorResponse) {
	return http.StatusInternalServerError, ErrorResponse{
		Code:          ErrorCodeInternalServer,
		Message:       "Internal server error",
		Details: map[string]interface{}{
			"error": message,
		},
		CorrelationID: correlationID,
		Timestamp:     time.Now(),
		Path:          path,
	}
}