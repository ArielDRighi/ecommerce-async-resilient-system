package domain

import (
	"errors"
	"fmt"
)

// Domain errors for business logic violations
var (
	// Email validation errors
	ErrEmailRequired       = errors.New("email is required")
	ErrInvalidEmailFormat  = errors.New("invalid email format")
	ErrEmailTooLong        = errors.New("email address too long (max 254 characters)")

	// Order validation errors
	ErrOrderIDRequired     = errors.New("order ID is required")
	ErrCustomerIDRequired  = errors.New("customer ID is required")
	ErrCustomerEmailRequired = errors.New("customer email is required")
	ErrOrderItemsRequired  = errors.New("order must have at least one item")
	ErrInvalidOrderStatus  = errors.New("invalid order status")
	ErrInvalidStatusTransition = errors.New("invalid status transition")

	// OrderItem validation errors
	ErrItemIDRequired      = errors.New("item ID is required")
	ErrProductIDRequired   = errors.New("product ID is required")
	ErrProductNameRequired = errors.New("product name is required")
	ErrInvalidQuantity     = errors.New("quantity must be positive")
	ErrInvalidUnitPrice    = errors.New("unit price must be positive")

	// Money validation errors
	ErrInvalidAmount       = errors.New("amount must be non-negative")
	ErrInvalidCurrency     = errors.New("invalid currency code")

	// Item management errors
	ErrItemNotFound        = errors.New("item not found")

	// Event errors
	ErrEventIDRequired     = errors.New("event ID is required")
	ErrEventTypeRequired   = errors.New("event type is required")
	ErrEventPayloadRequired = errors.New("event payload is required")
	ErrAggregateIDRequired = errors.New("aggregate ID is required")
)

// DomainError represents a domain-specific error with additional context
type DomainError struct {
	Code    string
	Message string
	Field   string
	Value   interface{}
	Err     error
}

// Error implements the error interface
func (e *DomainError) Error() string {
	if e.Field != "" {
		return fmt.Sprintf("domain error [%s]: %s (field: %s, value: %v)", e.Code, e.Message, e.Field, e.Value)
	}
	return fmt.Sprintf("domain error [%s]: %s", e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *DomainError) Unwrap() error {
	return e.Err
}

// NewDomainError creates a new domain error
func NewDomainError(code, message, field string, value interface{}, err error) *DomainError {
	return &DomainError{
		Code:    code,
		Message: message,
		Field:   field,
		Value:   value,
		Err:     err,
	}
}

// Validation error creators
func NewValidationError(field string, value interface{}, message string) *DomainError {
	return NewDomainError("VALIDATION_ERROR", message, field, value, nil)
}

func NewBusinessRuleError(message string) *DomainError {
	return NewDomainError("BUSINESS_RULE_ERROR", message, "", nil, nil)
}