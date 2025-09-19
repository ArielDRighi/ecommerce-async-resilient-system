package domain

import (
	"time"

	"github.com/google/uuid"
)

// OrderItem represents an item within an order
type OrderItem struct {
	id          uuid.UUID
	orderID     uuid.UUID
	productID   uuid.UUID
	productName string
	quantity    int
	unitPrice   *Money
	totalPrice  *Money
	createdAt   time.Time
	updatedAt   time.Time
}

// NewOrderItem creates a new order item with validation
func NewOrderItem(orderID, productID uuid.UUID, productName string, quantity int, unitPrice *Money) (*OrderItem, error) {
	// Validate required fields
	if orderID == uuid.Nil {
		return nil, ErrOrderIDRequired
	}

	if productID == uuid.Nil {
		return nil, ErrProductIDRequired
	}

	if productName == "" {
		return nil, ErrProductNameRequired
	}

	if quantity <= 0 {
		return nil, ErrInvalidQuantity
	}

	if unitPrice == nil || !unitPrice.IsPositive() {
		return nil, ErrInvalidUnitPrice
	}

	// Calculate total price
	totalPrice, err := unitPrice.Multiply(float64(quantity))
	if err != nil {
		return nil, err
	}

	now := time.Now()

	return &OrderItem{
		id:          uuid.New(),
		orderID:     orderID,
		productID:   productID,
		productName: productName,
		quantity:    quantity,
		unitPrice:   unitPrice,
		totalPrice:  totalPrice,
		createdAt:   now,
		updatedAt:   now,
	}, nil
}

// NewOrderItemForOrder creates a new order item without requiring an order ID upfront
// The order ID will be set when the item is added to an order
func NewOrderItemForOrder(productID uuid.UUID, productName string, quantity int, unitPrice *Money) (*OrderItem, error) {
	if productID == uuid.Nil {
		return nil, ErrProductIDRequired
	}

	if productName == "" {
		return nil, ErrProductNameRequired
	}

	if quantity <= 0 {
		return nil, ErrInvalidQuantity
	}

	if unitPrice == nil || !unitPrice.IsPositive() {
		return nil, ErrInvalidUnitPrice
	}

	// Calculate total price
	totalPrice, err := unitPrice.Multiply(float64(quantity))
	if err != nil {
		return nil, err
	}

	now := time.Now()

	return &OrderItem{
		id:          uuid.New(),
		orderID:     uuid.Nil, // Will be set when added to order
		productID:   productID,
		productName: productName,
		quantity:    quantity,
		unitPrice:   unitPrice,
		totalPrice:  totalPrice,
		createdAt:   now,
		updatedAt:   now,
	}, nil
}

// ID returns the item ID
func (oi *OrderItem) ID() uuid.UUID {
	return oi.id
}

// OrderID returns the order ID
func (oi *OrderItem) OrderID() uuid.UUID {
	return oi.orderID
}

// ProductID returns the product ID
func (oi *OrderItem) ProductID() uuid.UUID {
	return oi.productID
}

// ProductName returns the product name
func (oi *OrderItem) ProductName() string {
	return oi.productName
}

// Quantity returns the quantity
func (oi *OrderItem) Quantity() int {
	return oi.quantity
}

// UnitPrice returns the unit price
func (oi *OrderItem) UnitPrice() *Money {
	return oi.unitPrice
}

// TotalPrice returns the total price for this item
func (oi *OrderItem) TotalPrice() *Money {
	return oi.totalPrice
}

// CreatedAt returns the creation time
func (oi *OrderItem) CreatedAt() time.Time {
	return oi.createdAt
}

// UpdatedAt returns the last update time
func (oi *OrderItem) UpdatedAt() time.Time {
	return oi.updatedAt
}

// UpdateQuantity updates the quantity and recalculates total price
func (oi *OrderItem) UpdateQuantity(newQuantity int) error {
	if newQuantity <= 0 {
		return ErrInvalidQuantity
	}

	totalPrice, err := oi.unitPrice.Multiply(float64(newQuantity))
	if err != nil {
		return err
	}

	oi.quantity = newQuantity
	oi.totalPrice = totalPrice
	oi.updatedAt = time.Now()

	return nil
}

// UpdatePrice updates the unit price and recalculates total price
func (oi *OrderItem) UpdatePrice(newUnitPrice *Money) error {
	if newUnitPrice == nil || !newUnitPrice.IsPositive() {
		return ErrInvalidUnitPrice
	}

	totalPrice, err := newUnitPrice.Multiply(float64(oi.quantity))
	if err != nil {
		return err
	}

	oi.unitPrice = newUnitPrice
	oi.totalPrice = totalPrice
	oi.updatedAt = time.Now()

	return nil
}

// IsValid validates the order item
func (oi *OrderItem) IsValid() error {
	if oi.id == uuid.Nil {
		return ErrItemIDRequired
	}

	// OrderID can be Nil during item creation, but not when item is part of an order
	// This validation is context-dependent and will be enforced at the Order level

	if oi.productID == uuid.Nil {
		return ErrProductIDRequired
	}

	if oi.productName == "" {
		return ErrProductNameRequired
	}

	if oi.quantity <= 0 {
		return ErrInvalidQuantity
	}

	if oi.unitPrice == nil || !oi.unitPrice.IsPositive() {
		return ErrInvalidUnitPrice
	}

	if oi.totalPrice == nil || !oi.totalPrice.IsPositive() {
		return ErrInvalidAmount
	}

	// Verify total price calculation
	expectedTotal, err := oi.unitPrice.Multiply(float64(oi.quantity))
	if err != nil {
		return err
	}

	if !oi.totalPrice.Equals(*expectedTotal) {
		return NewBusinessRuleError("total price does not match unit price * quantity")
	}

	return nil
}

// IsValidForOrder validates the order item when it's part of an order
func (oi *OrderItem) IsValidForOrder() error {
	// First perform basic validation
	if err := oi.IsValid(); err != nil {
		return err
	}

	// Then ensure it has a valid order ID
	if oi.orderID == uuid.Nil {
		return ErrOrderIDRequired
	}

	return nil
}

// Clone creates a copy of the order item
func (oi *OrderItem) Clone() *OrderItem {
	return &OrderItem{
		id:          oi.id,
		orderID:     oi.orderID,
		productID:   oi.productID,
		productName: oi.productName,
		quantity:    oi.quantity,
		unitPrice:   oi.unitPrice,
		totalPrice:  oi.totalPrice,
		createdAt:   oi.createdAt,
		updatedAt:   oi.updatedAt,
	}
}

// SetOrderID sets the order ID (used during order creation)
func (oi *OrderItem) SetOrderID(orderID uuid.UUID) {
	oi.orderID = orderID
	oi.updatedAt = time.Now()
}