package domain

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestOrderStatus_String(t *testing.T) {
	tests := []struct {
		status   OrderStatus
		expected string
	}{
		{OrderStatusPending, "pending"},
		{OrderStatusStockVerified, "stock_verified"},
		{OrderStatusPaymentProcessing, "payment_processing"},
		{OrderStatusPaymentCompleted, "payment_completed"},
		{OrderStatusConfirmed, "confirmed"},
		{OrderStatusCancelled, "cancelled"},
		{OrderStatusFailed, "failed"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.status.String())
		})
	}
}

func TestOrderStatus_IsValid(t *testing.T) {
	validStatuses := []OrderStatus{
		OrderStatusPending,
		OrderStatusStockVerified,
		OrderStatusPaymentProcessing,
		OrderStatusPaymentCompleted,
		OrderStatusConfirmed,
		OrderStatusCancelled,
		OrderStatusFailed,
	}

	for _, status := range validStatuses {
		t.Run(status.String(), func(t *testing.T) {
			assert.True(t, status.IsValid())
		})
	}

	// Test invalid status
	invalidStatus := OrderStatus("invalid")
	assert.False(t, invalidStatus.IsValid())
}

func TestOrderStatus_IsTerminal(t *testing.T) {
	tests := []struct {
		status   OrderStatus
		expected bool
	}{
		{OrderStatusPending, false},
		{OrderStatusStockVerified, false},
		{OrderStatusPaymentProcessing, false},
		{OrderStatusPaymentCompleted, false},
		{OrderStatusConfirmed, true},
		{OrderStatusCancelled, true},
		{OrderStatusFailed, true},
	}

	for _, tt := range tests {
		t.Run(tt.status.String(), func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.status.IsTerminal())
		})
	}
}

func TestOrderStatus_CanTransitionTo(t *testing.T) {
	tests := []struct {
		name     string
		from     OrderStatus
		to       OrderStatus
		expected bool
	}{
		// From Pending
		{"pending to stock_verified", OrderStatusPending, OrderStatusStockVerified, true},
		{"pending to cancelled", OrderStatusPending, OrderStatusCancelled, true},
		{"pending to failed", OrderStatusPending, OrderStatusFailed, true},
		{"pending to payment_processing", OrderStatusPending, OrderStatusPaymentProcessing, false},
		{"pending to confirmed", OrderStatusPending, OrderStatusConfirmed, false},

		// From StockVerified
		{"stock_verified to payment_processing", OrderStatusStockVerified, OrderStatusPaymentProcessing, true},
		{"stock_verified to cancelled", OrderStatusStockVerified, OrderStatusCancelled, true},
		{"stock_verified to failed", OrderStatusStockVerified, OrderStatusFailed, true},
		{"stock_verified to pending", OrderStatusStockVerified, OrderStatusPending, false},
		{"stock_verified to confirmed", OrderStatusStockVerified, OrderStatusConfirmed, false},

		// From PaymentProcessing
		{"payment_processing to payment_completed", OrderStatusPaymentProcessing, OrderStatusPaymentCompleted, true},
		{"payment_processing to failed", OrderStatusPaymentProcessing, OrderStatusFailed, true},
		{"payment_processing to cancelled", OrderStatusPaymentProcessing, OrderStatusCancelled, true}, // Cancellation is allowed during payment processing to support user-initiated cancellations or payment timeouts, as per business requirements.
		{"payment_processing to pending", OrderStatusPaymentProcessing, OrderStatusPending, false},

		// From PaymentCompleted
		{"payment_completed to confirmed", OrderStatusPaymentCompleted, OrderStatusConfirmed, true},
		{"payment_completed to failed", OrderStatusPaymentCompleted, OrderStatusFailed, true},
		{"payment_completed to cancelled", OrderStatusPaymentCompleted, OrderStatusCancelled, false},

		// From final states
		{"confirmed to any", OrderStatusConfirmed, OrderStatusPending, false},
		{"cancelled to any", OrderStatusCancelled, OrderStatusPending, false},
		{"failed to pending", OrderStatusFailed, OrderStatusPending, false}, // Failed is terminal
		{"failed to stock_verified", OrderStatusFailed, OrderStatusStockVerified, false},

		// Same status
		{"pending to pending", OrderStatusPending, OrderStatusPending, false},
		{"confirmed to confirmed", OrderStatusConfirmed, OrderStatusConfirmed, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := tt.from.CanTransitionTo(tt.to)
			assert.Equal(t, tt.expected, result, 
				"Expected %s to %s: %v, got: %v", 
				tt.from.String(), tt.to.String(), tt.expected, result)
		})
	}
}

func TestParseOrderStatus(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		expected    OrderStatus
		expectError bool
	}{
		{"valid pending", "pending", OrderStatusPending, false},
		{"valid stock_verified", "stock_verified", OrderStatusStockVerified, false},
		{"valid payment_processing", "payment_processing", OrderStatusPaymentProcessing, false},
		{"valid payment_completed", "payment_completed", OrderStatusPaymentCompleted, false},
		{"valid confirmed", "confirmed", OrderStatusConfirmed, false},
		{"valid cancelled", "cancelled", OrderStatusCancelled, false},
		{"valid failed", "failed", OrderStatusFailed, false},
		
		// Case insensitive
		{"uppercase pending", "PENDING", OrderStatusPending, false},
		{"mixed case confirmed", "Confirmed", OrderStatusConfirmed, false},
		
		// Invalid cases
		{"empty string", "", OrderStatus(""), true},
		{"invalid status", "invalid", OrderStatus(""), true},
		{"with spaces", " pending ", OrderStatusPending, false}, // Should trim spaces
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ParseOrderStatus(tt.input)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), "invalid order status")
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestOrderStatus_GetNextPossibleStatuses(t *testing.T) {
	// Test that pending status has multiple next statuses
	nextStatuses := OrderStatusPending.GetNextPossibleStatuses()
	assert.Contains(t, nextStatuses, OrderStatusStockVerified)
	assert.Contains(t, nextStatuses, OrderStatusCancelled)
	assert.Contains(t, nextStatuses, OrderStatusFailed)

	// Test that terminal status has no next statuses
	nextStatuses = OrderStatusConfirmed.GetNextPossibleStatuses()
	assert.Empty(t, nextStatuses)
}

func TestOrderStatus_Workflow(t *testing.T) {
	// Test a complete workflow
	status := OrderStatusPending
	
	// Can transition to stock verified
	assert.True(t, status.CanTransitionTo(OrderStatusStockVerified))
	status = OrderStatusStockVerified
	
	// Can transition to payment processing
	assert.True(t, status.CanTransitionTo(OrderStatusPaymentProcessing))
	status = OrderStatusPaymentProcessing
	
	// Can transition to payment completed
	assert.True(t, status.CanTransitionTo(OrderStatusPaymentCompleted))
	status = OrderStatusPaymentCompleted
	
	// Can transition to confirmed
	assert.True(t, status.CanTransitionTo(OrderStatusConfirmed))
	status = OrderStatusConfirmed
	
	// Cannot transition from confirmed to anything
	assert.False(t, status.CanTransitionTo(OrderStatusPending))
	assert.False(t, status.CanTransitionTo(OrderStatusStockVerified))
	assert.False(t, status.CanTransitionTo(OrderStatusPaymentProcessing))
	assert.False(t, status.CanTransitionTo(OrderStatusCancelled))
	assert.False(t, status.CanTransitionTo(OrderStatusFailed))
}

func TestOrderStatus_CancellationWorkflow(t *testing.T) {
	// Test cancellation from pending
	status := OrderStatusPending
	assert.True(t, status.CanTransitionTo(OrderStatusCancelled))
	
	// Test cancellation from stock verified
	status = OrderStatusStockVerified
	assert.True(t, status.CanTransitionTo(OrderStatusCancelled))
	
	// Can cancel during payment processing (per business rules)
	status = OrderStatusPaymentProcessing
	assert.True(t, status.CanTransitionTo(OrderStatusCancelled))
}

func TestOrderStatus_FailureWorkflow(t *testing.T) {
	// Can fail from any active state
	activeStatuses := []OrderStatus{
		OrderStatusPending,
		OrderStatusStockVerified,
		OrderStatusPaymentProcessing,
		OrderStatusPaymentCompleted,
	}
	
	for _, status := range activeStatuses {
		t.Run("fail_from_"+status.String(), func(t *testing.T) {
			assert.True(t, status.CanTransitionTo(OrderStatusFailed))
		})
	}
	
	// Test retry from failed - failed is terminal, so no transitions allowed
	status := OrderStatusFailed
	assert.False(t, status.CanTransitionTo(OrderStatusPending))
}