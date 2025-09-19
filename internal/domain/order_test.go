package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOrder_NewOrder(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	// Create a test item
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(uuid.New(), uuid.New(), "Test Product", 2, unitPrice)
	require.NoError(t, err)

	items := []*OrderItem{item}

	tests := []struct {
		name        string
		customerID  uuid.UUID
		email       *Email
		items       []*OrderItem
		expectError bool
		expectedErr error
	}{
		{
			name:        "valid order",
			customerID:  customerID,
			email:       email,
			items:       items,
			expectError: false,
		},
		{
			name:        "empty customer ID",
			customerID:  uuid.Nil,
			email:       email,
			items:       items,
			expectError: true,
			expectedErr: ErrCustomerIDRequired,
		},
		{
			name:        "nil email",
			customerID:  customerID,
			email:       nil,
			items:       items,
			expectError: true,
			expectedErr: ErrCustomerEmailRequired,
		},
		{
			name:        "empty items",
			customerID:  customerID,
			email:       email,
			items:       []*OrderItem{},
			expectError: true,
			expectedErr: ErrOrderItemsRequired,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			order, err := NewOrder(tt.customerID, tt.email, tt.items)

			if tt.expectError {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedErr, err)
				assert.Nil(t, order)
			} else {
				assert.NoError(t, err)
				require.NotNil(t, order)
				assert.NotEqual(t, uuid.Nil, order.ID())
				assert.Equal(t, tt.customerID, order.CustomerID())
				assert.True(t, order.CustomerEmail().Equals(*tt.email))
				assert.Equal(t, OrderStatusPending, order.Status())
				assert.Len(t, order.Items(), len(tt.items))
				assert.NotZero(t, order.CreatedAt())
				assert.NotZero(t, order.UpdatedAt())
			}
		})
	}
}

func TestOrder_AddItem(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	// Create initial item for order creation
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	initialItem, err := NewOrderItem(uuid.New(), uuid.New(), "Initial Product", 1, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{initialItem})
	require.NoError(t, err)

	productID := uuid.New()

	// Test adding item to pending order
	err = order.AddItem(productID, "Test Product", 2, unitPrice)
	assert.NoError(t, err)
	assert.Len(t, order.Items(), 2)

	// Test adding item to non-pending order
	err = order.TransitionTo(OrderStatusStockVerified)
	require.NoError(t, err)

	anotherProductID := uuid.New()
	err = order.AddItem(anotherProductID, "Another Product", 1, unitPrice)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot add items to order")
	assert.Len(t, order.Items(), 2) // Should remain unchanged
}

func TestOrder_RemoveItem(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	// Create two initial items
	item1, err := NewOrderItem(uuid.New(), uuid.New(), "Product 1", 1, unitPrice)
	require.NoError(t, err)

	item2, err := NewOrderItem(uuid.New(), uuid.New(), "Product 2", 2, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item1, item2})
	require.NoError(t, err)

	// Test removing existing item
	err = order.RemoveItem(item1.ID())
	assert.NoError(t, err)
	assert.Len(t, order.Items(), 1)

	// Test removing non-existent item
	err = order.RemoveItem(uuid.New())
	assert.Error(t, err)

	// Test removing item from non-pending order
	err = order.TransitionTo(OrderStatusStockVerified)
	require.NoError(t, err)

	err = order.RemoveItem(item2.ID())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot remove items from order")
}

func TestOrder_UpdateItemQuantity(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(uuid.New(), uuid.New(), "Test Product", 2, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item})
	require.NoError(t, err)

	// Test updating quantity of existing item
	err = order.UpdateItemQuantity(item.ID(), 5)
	assert.NoError(t, err)
	assert.Equal(t, 5, order.Items()[0].Quantity())

	// Test updating quantity of non-existent item
	err = order.UpdateItemQuantity(uuid.New(), 3)
	assert.Error(t, err)

	// Test updating with invalid quantity
	err = order.UpdateItemQuantity(item.ID(), 0)
	assert.Error(t, err)
	assert.Equal(t, ErrInvalidQuantity, err)

	// Test updating item in non-pending order
	err = order.TransitionTo(OrderStatusStockVerified)
	require.NoError(t, err)

	err = order.UpdateItemQuantity(item.ID(), 10)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "cannot update")
}

func TestOrder_TotalAmount(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	// Create items with known prices
	price1, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item1, err := NewOrderItem(uuid.New(), uuid.New(), "Product 1", 2, price1)
	require.NoError(t, err)

	price2, err := NewMoney(5.25, USD)
	require.NoError(t, err)

	item2, err := NewOrderItem(uuid.New(), uuid.New(), "Product 2", 3, price2)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item1, item2})
	require.NoError(t, err)

	total := order.TotalAmount()
	assert.Equal(t, 36.75, total.Amount()) // (10.50 * 2) + (5.25 * 3) = 21.0 + 15.75
	assert.Equal(t, USD, total.Currency())
}

func TestOrder_TransitionTo(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(uuid.New(), uuid.New(), "Test Product", 2, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item})
	require.NoError(t, err)

	originalUpdatedAt := order.UpdatedAt()

	// Valid transition
	time.Sleep(time.Millisecond) // Ensure time difference
	err = order.TransitionTo(OrderStatusStockVerified)
	assert.NoError(t, err)
	assert.Equal(t, OrderStatusStockVerified, order.Status())
	assert.True(t, order.UpdatedAt().After(originalUpdatedAt))

	// Invalid transition
	err = order.TransitionTo(OrderStatusPending)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid status transition")
	assert.Equal(t, OrderStatusStockVerified, order.Status()) // Should remain unchanged

	// Valid transition to confirmed
	err = order.TransitionTo(OrderStatusPaymentProcessing)
	assert.NoError(t, err)
	err = order.TransitionTo(OrderStatusPaymentCompleted)
	assert.NoError(t, err)
	err = order.TransitionTo(OrderStatusConfirmed)
	assert.NoError(t, err)
	assert.Equal(t, OrderStatusConfirmed, order.Status())

	// Cannot transition from final state
	err = order.TransitionTo(OrderStatusCancelled)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid status transition")
}

func TestOrder_StatusPredicates(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(uuid.New(), uuid.New(), "Test Product", 2, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item})
	require.NoError(t, err)

	// Test pending status
	assert.True(t, order.IsPending())
	assert.False(t, order.IsCompleted())

	// Test stock verified status
	err = order.TransitionTo(OrderStatusStockVerified)
	require.NoError(t, err)
	assert.False(t, order.IsPending())
	assert.False(t, order.IsCompleted())

	// Test completed status (confirmed is a final state)
	err = order.TransitionTo(OrderStatusPaymentProcessing)
	require.NoError(t, err)
	err = order.TransitionTo(OrderStatusPaymentCompleted)
	require.NoError(t, err)
	err = order.TransitionTo(OrderStatusConfirmed)
	require.NoError(t, err)
	assert.False(t, order.IsPending())
	assert.True(t, order.IsCompleted())
}

func TestOrder_DomainEvents(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(uuid.New(), uuid.New(), "Test Product", 2, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item})
	require.NoError(t, err)

	// Should have OrderCreatedEvent
	events := order.Events()
	assert.Len(t, events, 1)
	assert.IsType(t, &OrderCreatedEvent{}, events[0])

	createdEvent := events[0].(*OrderCreatedEvent)
	assert.Equal(t, order.ID(), createdEvent.Order().ID())
	assert.Equal(t, customerID, createdEvent.Order().CustomerID())

	// Clear events
	order.ClearEvents()
	assert.Empty(t, order.Events())

	// Transition should add event
	err = order.TransitionTo(OrderStatusStockVerified)
	require.NoError(t, err)

	events = order.Events()
	assert.Len(t, events, 1)
	// The event type depends on the transition implementation
}

func TestOrder_IsValid(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(uuid.New(), uuid.New(), "Test Product", 2, unitPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{item})
	require.NoError(t, err)

	// Valid order should pass validation
	err = order.IsValid()
	assert.NoError(t, err)
}

func TestOrder_ItemManagementWithDifferentCurrencies(t *testing.T) {
	customerID := uuid.New()
	email, err := NewEmail("test@example.com")
	require.NoError(t, err)

	// Create initial USD item
	usdPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	usdItem, err := NewOrderItem(uuid.New(), uuid.New(), "USD Product", 2, usdPrice)
	require.NoError(t, err)

	order, err := NewOrder(customerID, email, []*OrderItem{usdItem})
	require.NoError(t, err)

	// Try to add EUR item (behavior depends on business rules)
	eurPrice, err := NewMoney(8.75, EUR)
	require.NoError(t, err)

	eurProductID := uuid.New()
	err = order.AddItem(eurProductID, "EUR Product", 1, eurPrice)
	// This might succeed or fail depending on business rules for mixed currencies
	// The test validates that the system handles this case appropriately
	if err == nil {
		assert.Len(t, order.Items(), 2)
	} else {
		assert.Contains(t, err.Error(), "currency")
	}
}