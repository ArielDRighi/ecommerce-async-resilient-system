package domain

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOrderItem_NewOrderItem(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	tests := []struct {
		name        string
		orderID     uuid.UUID
		productID   uuid.UUID
		productName string
		quantity    int
		unitPrice   *Money
		expectError bool
		expectedErr error
	}{
		{
			name:        "valid order item",
			orderID:     orderID,
			productID:   productID,
			productName: "Test Product",
			quantity:    2,
			unitPrice:   unitPrice,
			expectError: false,
		},
		{
			name:        "nil order ID",
			orderID:     uuid.Nil,
			productID:   productID,
			productName: "Test Product",
			quantity:    2,
			unitPrice:   unitPrice,
			expectError: true,
			expectedErr: ErrOrderIDRequired,
		},
		{
			name:        "nil product ID",
			orderID:     orderID,
			productID:   uuid.Nil,
			productName: "Test Product",
			quantity:    2,
			unitPrice:   unitPrice,
			expectError: true,
			expectedErr: ErrProductIDRequired,
		},
		{
			name:        "empty product name",
			orderID:     orderID,
			productID:   productID,
			productName: "",
			quantity:    2,
			unitPrice:   unitPrice,
			expectError: true,
			expectedErr: ErrProductNameRequired,
		},
		{
			name:        "zero quantity",
			orderID:     orderID,
			productID:   productID,
			productName: "Test Product",
			quantity:    0,
			unitPrice:   unitPrice,
			expectError: true,
			expectedErr: ErrInvalidQuantity,
		},
		{
			name:        "negative quantity",
			orderID:     orderID,
			productID:   productID,
			productName: "Test Product",
			quantity:    -1,
			unitPrice:   unitPrice,
			expectError: true,
			expectedErr: ErrInvalidQuantity,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item, err := NewOrderItem(tt.orderID, tt.productID, tt.productName, tt.quantity, tt.unitPrice)

			if tt.expectError {
				assert.Error(t, err)
				assert.Equal(t, tt.expectedErr, err)
				assert.Nil(t, item)
			} else {
				assert.NoError(t, err)
				require.NotNil(t, item)
				assert.NotEqual(t, uuid.Nil, item.ID())
				assert.Equal(t, tt.orderID, item.OrderID())
				assert.Equal(t, tt.productID, item.ProductID())
				assert.Equal(t, tt.productName, item.ProductName())
				assert.Equal(t, tt.quantity, item.Quantity())
				assert.True(t, item.UnitPrice().Equals(*tt.unitPrice))
				assert.NotZero(t, item.CreatedAt())
			}
		})
	}
}

func TestOrderItem_TotalPrice(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(orderID, productID, "Test Product", 2, unitPrice)
	require.NoError(t, err)

	totalPrice := item.TotalPrice()
	assert.Equal(t, 21.00, totalPrice.Amount())
	assert.Equal(t, USD, totalPrice.Currency())
}

func TestOrderItem_UpdateQuantity(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(orderID, productID, "Test Product", 2, unitPrice)
	require.NoError(t, err)

	// Test valid quantity update
	err = item.UpdateQuantity(5)
	assert.NoError(t, err)
	assert.Equal(t, 5, item.Quantity())

	// Test invalid quantity update
	err = item.UpdateQuantity(0)
	assert.Error(t, err)
	assert.Equal(t, ErrInvalidQuantity, err)
	assert.Equal(t, 5, item.Quantity()) // Should remain unchanged

	err = item.UpdateQuantity(-1)
	assert.Error(t, err)
	assert.Equal(t, ErrInvalidQuantity, err)
	assert.Equal(t, 5, item.Quantity()) // Should remain unchanged
}

func TestOrderItem_UpdatePrice(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(orderID, productID, "Test Product", 2, unitPrice)
	require.NoError(t, err)

	newPrice, err := NewMoney(15.75, USD)
	require.NoError(t, err)

	// Test valid price update
	err = item.UpdatePrice(newPrice)
	assert.NoError(t, err)
	assert.True(t, item.UnitPrice().Equals(*newPrice))

	// Verify total price is updated
	totalPrice := item.TotalPrice()
	assert.Equal(t, 31.50, totalPrice.Amount()) // 15.75 * 2
}

func TestOrderItem_IsValid(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(orderID, productID, "Test Product", 2, unitPrice)
	require.NoError(t, err)

	// Valid item should pass validation
	err = item.IsValid()
	assert.NoError(t, err)
}

func TestOrderItem_ProductValidation(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	tests := []struct {
		name        string
		productName string
		expectError bool
	}{
		{
			name:        "valid product name",
			productName: "Valid Product Name",
			expectError: false,
		},
		{
			name:        "long product name",
			productName: "This is a very long product name that should still be valid because there is no explicit length limit in the business rules",
			expectError: false,
		},
		{
			name:        "product name with special characters",
			productName: "Product with special chars: áéíóú ñ & symbols",
			expectError: false,
		},
		{
			name:        "empty product name",
			productName: "",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item, err := NewOrderItem(orderID, productID, tt.productName, 1, unitPrice)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, item)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, item)
			}
		})
	}
}

func TestOrderItem_QuantityBoundaryValues(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	tests := []struct {
		name        string
		quantity    int
		expectError bool
	}{
		{"quantity 1", 1, false},
		{"quantity 100", 100, false},
		{"quantity 1000", 1000, false},
		{"quantity 0", 0, true},
		{"quantity -1", -1, true},
		{"quantity -100", -100, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item, err := NewOrderItem(orderID, productID, "Test Product", tt.quantity, unitPrice)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, item)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, item)
				assert.Equal(t, tt.quantity, item.Quantity())
			}
		})
	}
}

func TestOrderItem_TimestampValidation(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	beforeCreate := time.Now()
	item, err := NewOrderItem(orderID, productID, "Test Product", 2, unitPrice)
	afterCreate := time.Now()

	require.NoError(t, err)
	assert.True(t, item.CreatedAt().After(beforeCreate) || item.CreatedAt().Equal(beforeCreate))
	assert.True(t, item.CreatedAt().Before(afterCreate) || item.CreatedAt().Equal(afterCreate))
}

func TestOrderItem_MoneyIntegration(t *testing.T) {
	orderID := uuid.New()
	productID1 := uuid.New()
	productID2 := uuid.New()

	// Test with different currencies
	usdPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	eurPrice, err := NewMoney(8.75, EUR)
	require.NoError(t, err)

	// Create items with different currencies
	usdItem, err := NewOrderItem(orderID, productID1, "USD Product", 2, usdPrice)
	require.NoError(t, err)

	eurItem, err := NewOrderItem(orderID, productID2, "EUR Product", 3, eurPrice)
	require.NoError(t, err)

	// Verify currencies are preserved
	usdTotal := usdItem.TotalPrice()
	assert.Equal(t, USD, usdTotal.Currency())

	eurTotal := eurItem.TotalPrice()
	assert.Equal(t, EUR, eurTotal.Currency())
}

func TestOrderItem_Clone(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(10.50, USD)
	require.NoError(t, err)

	original, err := NewOrderItem(orderID, productID, "Test Product", 2, unitPrice)
	require.NoError(t, err)

	cloned := original.Clone()

	// Should have same values
	assert.Equal(t, original.ID(), cloned.ID())
	assert.Equal(t, original.OrderID(), cloned.OrderID())
	assert.Equal(t, original.ProductID(), cloned.ProductID())
	assert.Equal(t, original.ProductName(), cloned.ProductName())
	assert.Equal(t, original.Quantity(), cloned.Quantity())
	assert.True(t, original.UnitPrice().Equals(*cloned.UnitPrice()))
	assert.True(t, original.TotalPrice().Equals(*cloned.TotalPrice()))
	assert.Equal(t, original.CreatedAt(), cloned.CreatedAt())
	assert.Equal(t, original.UpdatedAt(), cloned.UpdatedAt())

	// Should be different instances
	assert.NotSame(t, original, cloned)
}

func TestOrderItem_SetOrderID(t *testing.T) {
	orderID := uuid.New()
	productID := uuid.New()
	unitPrice, err := NewMoney(15.99, USD)
	require.NoError(t, err)

	item, err := NewOrderItem(orderID, productID, "Test Product", 3, unitPrice)
	require.NoError(t, err)

	originalUpdateTime := item.UpdatedAt()
	time.Sleep(1 * time.Millisecond) // Ensure time difference

	newOrderID := uuid.New()
	item.SetOrderID(newOrderID)

	// Verify the order ID was updated
	assert.Equal(t, newOrderID, item.OrderID())
	// Verify the updated time was changed
	assert.True(t, item.UpdatedAt().After(originalUpdateTime))
}