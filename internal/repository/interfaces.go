package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/username/order-processor/internal/domain"
)

// OrderRepository defines the interface for order data persistence
type OrderRepository interface {
	// Create saves a new order with its items in a transaction
	Create(ctx context.Context, order *domain.Order) error
	
	// FindByID retrieves an order by its ID including all items
	FindByID(ctx context.Context, id uuid.UUID) (*domain.Order, error)
	
	// FindByCustomerID retrieves orders for a specific customer with pagination
	FindByCustomerID(ctx context.Context, customerID uuid.UUID, filter OrderFilter) ([]*domain.Order, *PaginationResult, error)
	
	// FindAll retrieves orders with pagination and filtering
	FindAll(ctx context.Context, filter OrderFilter) ([]*domain.Order, *PaginationResult, error)
	
	// Update updates an existing order
	Update(ctx context.Context, order *domain.Order) error
	
	// UpdateStatus updates only the order status and timestamps
	UpdateStatus(ctx context.Context, id uuid.UUID, status domain.OrderStatus) error
	
	// Delete soft deletes an order (marks as deleted)
	Delete(ctx context.Context, id uuid.UUID) error
	
	// Count returns the total number of orders matching the filter
	Count(ctx context.Context, filter OrderFilter) (int64, error)
	
	// ExistsByID checks if an order exists by its ID
	ExistsByID(ctx context.Context, id uuid.UUID) (bool, error)
	
	// FindByStatus retrieves orders by status with pagination
	FindByStatus(ctx context.Context, status domain.OrderStatus, filter OrderFilter) ([]*domain.Order, *PaginationResult, error)
	
	// FindPendingOrders retrieves orders that need processing
	FindPendingOrders(ctx context.Context, limit int) ([]*domain.Order, error)
	
	// FindOrdersCreatedBetween retrieves orders created within a time range
	FindOrdersCreatedBetween(ctx context.Context, start, end time.Time, filter OrderFilter) ([]*domain.Order, *PaginationResult, error)
}

// OutboxRepository defines the interface for outbox pattern implementation
type OutboxRepository interface {
	// Create saves a new outbox event
	Create(ctx context.Context, event *domain.Event) error
	
	// CreateWithOrder saves an order and its outbox event in a single transaction
	CreateWithOrder(ctx context.Context, order *domain.Order, events []*domain.Event) error
	
	// FindUnprocessedEvents retrieves events that haven't been processed
	FindUnprocessedEvents(ctx context.Context, limit int) ([]*domain.Event, error)
	
	// FindUnprocessedEventsByType retrieves unprocessed events of a specific type
	FindUnprocessedEventsByType(ctx context.Context, eventType string, limit int) ([]*domain.Event, error)
	
	// MarkAsProcessed marks an event as processed
	MarkAsProcessed(ctx context.Context, eventID uuid.UUID) error
	
	// MarkMultipleAsProcessed marks multiple events as processed in a transaction
	MarkMultipleAsProcessed(ctx context.Context, eventIDs []uuid.UUID) error
	
	// FindByID retrieves an event by its ID
	FindByID(ctx context.Context, id uuid.UUID) (*domain.Event, error)
	
	// FindByAggregateID retrieves events for a specific aggregate
	FindByAggregateID(ctx context.Context, aggregateID uuid.UUID) ([]*domain.Event, error)
	
	// DeleteProcessedEvents removes processed events older than the specified time
	DeleteProcessedEvents(ctx context.Context, olderThan time.Time) (int64, error)
	
	// Count returns the total number of events matching the criteria
	Count(ctx context.Context, processed *bool, eventType string) (int64, error)
	
	// FindEventsCreatedBetween retrieves events created within a time range
	FindEventsCreatedBetween(ctx context.Context, start, end time.Time, processed *bool) ([]*domain.Event, error)
}

// TransactionManager defines the interface for managing database transactions
type TransactionManager interface {
	// WithTransaction executes a function within a database transaction
	WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error
	
	// BeginTransaction starts a new transaction and returns a context with the transaction
	BeginTransaction(ctx context.Context) (context.Context, error)
	
	// CommitTransaction commits the transaction in the given context
	CommitTransaction(ctx context.Context) error
	
	// RollbackTransaction rolls back the transaction in the given context
	RollbackTransaction(ctx context.Context) error
	
	// IsInTransaction checks if the context contains an active transaction
	IsInTransaction(ctx context.Context) bool
}

// OrderFilter represents filtering options for order queries
type OrderFilter struct {
	// Pagination
	Page     int `json:"page" validate:"min=1"`
	PageSize int `json:"page_size" validate:"min=1,max=100"`
	
	// Sorting
	SortBy    string `json:"sort_by" validate:"oneof=created_at updated_at total_amount customer_email"`
	SortOrder string `json:"sort_order" validate:"oneof=asc desc"`
	
	// Filtering
	CustomerID    *uuid.UUID              `json:"customer_id,omitempty"`
	CustomerEmail string                  `json:"customer_email,omitempty"`
	Status        *domain.OrderStatus     `json:"status,omitempty"`
	MinAmount     *float64                `json:"min_amount,omitempty"`
	MaxAmount     *float64                `json:"max_amount,omitempty"`
	Currency      string                  `json:"currency,omitempty"`
	
	// Date range filtering
	CreatedAfter  *time.Time `json:"created_after,omitempty"`
	CreatedBefore *time.Time `json:"created_before,omitempty"`
	UpdatedAfter  *time.Time `json:"updated_after,omitempty"`
	UpdatedBefore *time.Time `json:"updated_before,omitempty"`
	
	// Text search
	SearchTerm string `json:"search_term,omitempty"` // Search in customer email or product names
	
	// Include relationships
	IncludeItems bool `json:"include_items"`
}

// PaginationResult contains pagination metadata
type PaginationResult struct {
	Page         int   `json:"page"`
	PageSize     int   `json:"page_size"`
	TotalItems   int64 `json:"total_items"`
	TotalPages   int   `json:"total_pages"`
	HasNext      bool  `json:"has_next"`
	HasPrevious  bool  `json:"has_previous"`
}

// NewOrderFilter creates a new OrderFilter with default values
func NewOrderFilter() OrderFilter {
	return OrderFilter{
		Page:         1,
		PageSize:     20,
		SortBy:       "created_at",
		SortOrder:    "desc",
		IncludeItems: true,
	}
}

// Validate validates the order filter parameters
func (f *OrderFilter) Validate() error {
	if f.Page < 1 {
		f.Page = 1
	}
	
	if f.PageSize < 1 || f.PageSize > 100 {
		f.PageSize = 20
	}
	
	if f.SortBy == "" {
		f.SortBy = "created_at"
	}
	
	if f.SortOrder != "asc" && f.SortOrder != "desc" {
		f.SortOrder = "desc"
	}
	
	// Validate amounts
	if f.MinAmount != nil && *f.MinAmount < 0 {
		return domain.NewValidationError("min_amount", *f.MinAmount, "minimum amount cannot be negative")
	}
	
	if f.MaxAmount != nil && *f.MaxAmount < 0 {
		return domain.NewValidationError("max_amount", *f.MaxAmount, "maximum amount cannot be negative")
	}
	
	if f.MinAmount != nil && f.MaxAmount != nil && *f.MinAmount > *f.MaxAmount {
		return domain.NewValidationError("amount_range", nil, "minimum amount cannot be greater than maximum amount")
	}
	
	// Validate date ranges
	if f.CreatedAfter != nil && f.CreatedBefore != nil && f.CreatedAfter.After(*f.CreatedBefore) {
		return domain.NewValidationError("created_date_range", nil, "created_after cannot be after created_before")
	}
	
	if f.UpdatedAfter != nil && f.UpdatedBefore != nil && f.UpdatedAfter.After(*f.UpdatedBefore) {
		return domain.NewValidationError("updated_date_range", nil, "updated_after cannot be after updated_before")
	}
	
	return nil
}

// Offset calculates the offset for pagination
func (f *OrderFilter) Offset() int {
	return (f.Page - 1) * f.PageSize
}

// CalculatePagination calculates pagination metadata
func (f *OrderFilter) CalculatePagination(totalItems int64) *PaginationResult {
	totalPages := int((totalItems + int64(f.PageSize) - 1) / int64(f.PageSize))
	
	return &PaginationResult{
		Page:        f.Page,
		PageSize:    f.PageSize,
		TotalItems:  totalItems,
		TotalPages:  totalPages,
		HasNext:     f.Page < totalPages,
		HasPrevious: f.Page > 1,
	}
}

// RepositoryError represents a repository-specific error
type RepositoryError struct {
	Operation string
	Entity    string
	Err       error
	Code      string
}

// Error implements the error interface
func (e *RepositoryError) Error() string {
	return e.Err.Error()
}

// Unwrap returns the underlying error
func (e *RepositoryError) Unwrap() error {
	return e.Err
}

// Common repository error codes
const (
	ErrCodeNotFound          = "NOT_FOUND"
	ErrCodeDuplicateKey      = "DUPLICATE_KEY"
	ErrCodeForeignKey        = "FOREIGN_KEY"
	ErrCodeConstraintViolation = "CONSTRAINT_VIOLATION"
	ErrCodeConnectionError   = "CONNECTION_ERROR"
	ErrCodeTimeout          = "TIMEOUT"
	ErrCodeTransactionFailed = "TRANSACTION_FAILED"
	ErrCodeInvalidQuery     = "INVALID_QUERY"
	ErrCodePermissionDenied = "PERMISSION_DENIED"
)

// NewRepositoryError creates a new repository error
func NewRepositoryError(operation, entity, code string, err error) *RepositoryError {
	return &RepositoryError{
		Operation: operation,
		Entity:    entity,
		Err:       err,
		Code:      code,
	}
}

// IsNotFoundError checks if the error is a not found error
func IsNotFoundError(err error) bool {
	if repoErr, ok := err.(*RepositoryError); ok {
		return repoErr.Code == ErrCodeNotFound
	}
	return false
}

// IsDuplicateKeyError checks if the error is a duplicate key error
func IsDuplicateKeyError(err error) bool {
	if repoErr, ok := err.(*RepositoryError); ok {
		return repoErr.Code == ErrCodeDuplicateKey
	}
	return false
}

// IsConstraintViolationError checks if the error is a constraint violation error
func IsConstraintViolationError(err error) bool {
	if repoErr, ok := err.(*RepositoryError); ok {
		return repoErr.Code == ErrCodeConstraintViolation || repoErr.Code == ErrCodeForeignKey
	}
	return false
}

// IsConnectionError checks if the error is a connection error
func IsConnectionError(err error) bool {
	if repoErr, ok := err.(*RepositoryError); ok {
		return repoErr.Code == ErrCodeConnectionError
	}
	return false
}