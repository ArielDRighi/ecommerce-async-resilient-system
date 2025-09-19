package domain

import (
	"time"

	"github.com/google/uuid"
)

// OrderFilter represents filtering criteria for order queries
type OrderFilter struct {
	// Filter by customer ID
	CustomerID *uuid.UUID
	
	// Filter by order status
	Status string
	
	// Filter orders created after this date
	CreatedAfter *time.Time
	
	// Filter orders created before this date
	CreatedBefore *time.Time
	
	// Additional filters for future use
	MinAmount *Money
	MaxAmount *Money
	
	// Search term for product names
	SearchTerm string
}