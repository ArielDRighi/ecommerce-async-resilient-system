package domain

import (
	"fmt"
	"strings"
)

// OrderStatus represents the status of an order
type OrderStatus string

const (
	OrderStatusPending           OrderStatus = "pending"
	OrderStatusStockVerified     OrderStatus = "stock_verified"
	OrderStatusPaymentProcessing OrderStatus = "payment_processing"
	OrderStatusPaymentCompleted  OrderStatus = "payment_completed"
	OrderStatusConfirmed         OrderStatus = "confirmed"
	OrderStatusFailed            OrderStatus = "failed"
	OrderStatusCancelled         OrderStatus = "cancelled"
)

// AllOrderStatuses returns all valid order statuses
func AllOrderStatuses() []OrderStatus {
	return []OrderStatus{
		OrderStatusPending,
		OrderStatusStockVerified,
		OrderStatusPaymentProcessing,
		OrderStatusPaymentCompleted,
		OrderStatusConfirmed,
		OrderStatusFailed,
		OrderStatusCancelled,
	}
}

// IsValid checks if the order status is valid
func (s OrderStatus) IsValid() bool {
	for _, status := range AllOrderStatuses() {
		if s == status {
			return true
		}
	}
	return false
}

// String returns the string representation of the status
func (s OrderStatus) String() string {
	return string(s)
}

// IsTerminal checks if the status is a terminal state
func (s OrderStatus) IsTerminal() bool {
	return s == OrderStatusConfirmed || s == OrderStatusFailed || s == OrderStatusCancelled
}

// CanTransitionTo checks if a transition to another status is valid
func (s OrderStatus) CanTransitionTo(target OrderStatus) bool {
	if !s.IsValid() || !target.IsValid() {
		return false
	}

	// If already in terminal state, no transitions allowed
	if s.IsTerminal() {
		return false
	}

	// Define valid transitions
	validTransitions := map[OrderStatus][]OrderStatus{
		OrderStatusPending: {
			OrderStatusStockVerified,
			OrderStatusFailed,
			OrderStatusCancelled,
		},
		OrderStatusStockVerified: {
			OrderStatusPaymentProcessing,
			OrderStatusFailed,
			OrderStatusCancelled,
		},
		OrderStatusPaymentProcessing: {
			OrderStatusPaymentCompleted,
			OrderStatusFailed,
			OrderStatusCancelled,
		},
		OrderStatusPaymentCompleted: {
			OrderStatusConfirmed,
			OrderStatusFailed,
		},
	}

	allowedTargets, exists := validTransitions[s]
	if !exists {
		return false
	}

	for _, allowed := range allowedTargets {
		if allowed == target {
			return true
		}
	}

	return false
}

// ParseOrderStatus parses a string into OrderStatus
func ParseOrderStatus(s string) (OrderStatus, error) {
	normalized := OrderStatus(strings.ToLower(strings.TrimSpace(s)))
	
	if !normalized.IsValid() {
		return "", fmt.Errorf("invalid order status: %s", s)
	}

	return normalized, nil
}

// MustParseOrderStatus parses a string into OrderStatus and panics on error
func MustParseOrderStatus(s string) OrderStatus {
	status, err := ParseOrderStatus(s)
	if err != nil {
		panic(err)
	}
	return status
}

// GetNextPossibleStatuses returns all possible next statuses from current status
func (s OrderStatus) GetNextPossibleStatuses() []OrderStatus {
	if !s.IsValid() || s.IsTerminal() {
		return []OrderStatus{}
	}

	validTransitions := map[OrderStatus][]OrderStatus{
		OrderStatusPending: {
			OrderStatusStockVerified,
			OrderStatusFailed,
			OrderStatusCancelled,
		},
		OrderStatusStockVerified: {
			OrderStatusPaymentProcessing,
			OrderStatusFailed,
			OrderStatusCancelled,
		},
		OrderStatusPaymentProcessing: {
			OrderStatusPaymentCompleted,
			OrderStatusFailed,
			OrderStatusCancelled,
		},
		OrderStatusPaymentCompleted: {
			OrderStatusConfirmed,
			OrderStatusFailed,
		},
	}

	if transitions, exists := validTransitions[s]; exists {
		return transitions
	}

	return []OrderStatus{}
}