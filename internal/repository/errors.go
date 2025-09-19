package repository

import (
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
	"github.com/username/order-processor/internal/domain"
)

// Error handling and conversion utilities for GORM to domain errors

// ConvertGormError converts GORM errors to domain errors
func ConvertGormError(operation, entity string, err error) error {
	if err == nil {
		return nil
	}

	// Handle GORM specific errors
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return NewRepositoryError(operation, entity, ErrCodeNotFound, err)
	}

	if errors.Is(err, gorm.ErrInvalidTransaction) {
		return NewRepositoryError(operation, entity, ErrCodeTransactionFailed, err)
	}

	if errors.Is(err, gorm.ErrInvalidData) {
		return NewRepositoryError(operation, entity, ErrCodeInvalidQuery, err)
	}

	if errors.Is(err, gorm.ErrInvalidField) {
		return NewRepositoryError(operation, entity, ErrCodeInvalidQuery, err)
	}

	if errors.Is(err, gorm.ErrEmptySlice) {
		return NewRepositoryError(operation, entity, ErrCodeInvalidQuery, err)
	}

	if errors.Is(err, gorm.ErrInvalidValue) {
		return NewRepositoryError(operation, entity, ErrCodeInvalidQuery, err)
	}

	// Handle PostgreSQL specific errors by checking error message
	errMsg := strings.ToLower(err.Error())

	// Duplicate key constraint
	if strings.Contains(errMsg, "duplicate key") || strings.Contains(errMsg, "unique constraint") {
		return NewRepositoryError(operation, entity, ErrCodeDuplicateKey, err)
	}

	// Foreign key constraint
	if strings.Contains(errMsg, "foreign key constraint") || strings.Contains(errMsg, "violates foreign key") {
		return NewRepositoryError(operation, entity, ErrCodeForeignKey, err)
	}

	// Check constraint
	if strings.Contains(errMsg, "check constraint") || strings.Contains(errMsg, "violates check") {
		return NewRepositoryError(operation, entity, ErrCodeConstraintViolation, err)
	}

	// Not null constraint
	if strings.Contains(errMsg, "not null constraint") || strings.Contains(errMsg, "null value") {
		return NewRepositoryError(operation, entity, ErrCodeConstraintViolation, err)
	}

	// Connection errors
	if strings.Contains(errMsg, "connection") || strings.Contains(errMsg, "connect") || 
	   strings.Contains(errMsg, "dial") || strings.Contains(errMsg, "network") {
		return NewRepositoryError(operation, entity, ErrCodeConnectionError, err)
	}

	// Timeout errors
	if strings.Contains(errMsg, "timeout") || strings.Contains(errMsg, "deadline") {
		return NewRepositoryError(operation, entity, ErrCodeTimeout, err)
	}

	// Permission errors
	if strings.Contains(errMsg, "permission") || strings.Contains(errMsg, "access denied") {
		return NewRepositoryError(operation, entity, ErrCodePermissionDenied, err)
	}

	// Default to generic constraint violation for other database errors
	return NewRepositoryError(operation, entity, ErrCodeConstraintViolation, err)
}

// ConvertToDomainError converts repository errors to domain errors when appropriate
func ConvertToDomainError(err error) error {
	if err == nil {
		return nil
	}

	repoErr, ok := err.(*RepositoryError)
	if !ok {
		return err
	}

	switch repoErr.Code {
	case ErrCodeNotFound:
		// Convert specific not found errors to domain errors
		switch repoErr.Entity {
		case "order":
			return domain.NewValidationError("order_id", nil, "order not found")
		case "orderitem":
			return domain.NewValidationError("item_id", nil, "order item not found")
		default:
			return domain.NewValidationError(repoErr.Entity+"_id", nil, repoErr.Entity+" not found")
		}

	case ErrCodeDuplicateKey:
		return domain.NewBusinessRuleError(fmt.Sprintf("duplicate %s already exists", repoErr.Entity))

	case ErrCodeForeignKey, ErrCodeConstraintViolation:
		return domain.NewValidationError("constraint", nil, fmt.Sprintf("constraint violation for %s", repoErr.Entity))

	case ErrCodeConnectionError:
		return domain.NewBusinessRuleError("database connection failed")

	case ErrCodeTimeout:
		return domain.NewBusinessRuleError("database operation timed out")

	case ErrCodeTransactionFailed:
		return domain.NewBusinessRuleError("transaction failed")

	case ErrCodeInvalidQuery:
		return domain.NewValidationError("query", nil, "invalid query parameters")

	case ErrCodePermissionDenied:
		return domain.NewBusinessRuleError("insufficient database permissions")

	default:
		return repoErr
	}
}

// WrapWithRepositoryError wraps an error with repository context
func WrapWithRepositoryError(operation, entity string, err error) error {
	if err == nil {
		return nil
	}

	// If it's already a repository error, return as is
	if _, ok := err.(*RepositoryError); ok {
		return err
	}

	// Convert GORM error to repository error
	return ConvertGormError(operation, entity, err)
}

// ErrorHandler provides centralized error handling for repositories
type ErrorHandler struct {
	logger interface{} // Can be injected with any logger interface
}

// NewErrorHandler creates a new error handler
func NewErrorHandler(logger interface{}) *ErrorHandler {
	return &ErrorHandler{
		logger: logger,
	}
}

// Handle processes and converts errors with optional logging
func (eh *ErrorHandler) Handle(operation, entity string, err error) error {
	if err == nil {
		return nil
	}

	// Log the original error if logger is available
	if eh.logger != nil {
		// This would be implemented based on the specific logger interface
		// For now, we'll skip logging in the repository layer
	}

	// Convert to repository error
	repoErr := ConvertGormError(operation, entity, err)

	// Convert to domain error if appropriate
	return ConvertToDomainError(repoErr)
}

// RetryableError checks if an error is retryable
func RetryableError(err error) bool {
	if err == nil {
		return false
	}

	repoErr, ok := err.(*RepositoryError)
	if !ok {
		return false
	}

	switch repoErr.Code {
	case ErrCodeConnectionError, ErrCodeTimeout:
		return true
	default:
		return false
	}
}

// TemporaryError checks if an error is temporary
func TemporaryError(err error) bool {
	return RetryableError(err)
}

// PermanentError checks if an error is permanent
func PermanentError(err error) bool {
	if err == nil {
		return false
	}

	repoErr, ok := err.(*RepositoryError)
	if !ok {
		return false
	}

	switch repoErr.Code {
	case ErrCodeDuplicateKey, ErrCodeForeignKey, ErrCodeConstraintViolation, 
		 ErrCodeInvalidQuery, ErrCodePermissionDenied:
		return true
	default:
		return false
	}
}

// ShouldRetry determines if an operation should be retried based on the error
func ShouldRetry(err error, attemptCount int, maxAttempts int) bool {
	if err == nil || attemptCount >= maxAttempts {
		return false
	}

	return RetryableError(err)
}

// Common error messages for better consistency
const (
	ErrMsgOrderNotFound      = "order not found"
	ErrMsgOrderItemNotFound  = "order item not found"
	ErrMsgEventNotFound      = "event not found"
	ErrMsgDuplicateOrder     = "order already exists"
	ErrMsgInvalidOrderData   = "invalid order data"
	ErrMsgInvalidEventData   = "invalid event data"
	ErrMsgTransactionFailed  = "database transaction failed"
	ErrMsgConnectionFailed   = "database connection failed"
	ErrMsgOperationTimeout   = "database operation timed out"
)

// Repository-specific error constructors
func NewOrderNotFoundError(orderID string) error {
	return NewRepositoryError("find", "order", ErrCodeNotFound, 
		fmt.Errorf("%s with ID: %s", ErrMsgOrderNotFound, orderID))
}

func NewOrderItemNotFoundError(itemID string) error {
	return NewRepositoryError("find", "orderitem", ErrCodeNotFound, 
		fmt.Errorf("%s with ID: %s", ErrMsgOrderItemNotFound, itemID))
}

func NewEventNotFoundError(eventID string) error {
	return NewRepositoryError("find", "event", ErrCodeNotFound, 
		fmt.Errorf("%s with ID: %s", ErrMsgEventNotFound, eventID))
}

func NewDuplicateOrderError(orderID string) error {
	return NewRepositoryError("create", "order", ErrCodeDuplicateKey, 
		fmt.Errorf("%s with ID: %s", ErrMsgDuplicateOrder, orderID))
}

func NewTransactionFailedError(operation string) error {
	return NewRepositoryError(operation, "transaction", ErrCodeTransactionFailed, 
		fmt.Errorf("%s during %s", ErrMsgTransactionFailed, operation))
}

func NewConnectionFailedError() error {
	return NewRepositoryError("connect", "database", ErrCodeConnectionError, 
		fmt.Errorf(ErrMsgConnectionFailed))
}

func NewOperationTimeoutError(operation string) error {
	return NewRepositoryError(operation, "database", ErrCodeTimeout, 
		fmt.Errorf("%s during %s", ErrMsgOperationTimeout, operation))
}