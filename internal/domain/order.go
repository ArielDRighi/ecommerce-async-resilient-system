package domain

import (
	"time"

	"github.com/google/uuid"
)

// Order represents an order aggregate root
type Order struct {
	id            uuid.UUID
	customerID    uuid.UUID
	customerEmail *Email
	items         []*OrderItem
	totalAmount   *Money
	status        OrderStatus
	createdAt     time.Time
	updatedAt     time.Time
	processedAt   *time.Time
	events        []DomainEvent
}

// NewOrder creates a new order with validation
func NewOrder(customerID uuid.UUID, customerEmail *Email, items []*OrderItem) (*Order, error) {
	// Validate required fields
	if customerID == uuid.Nil {
		return nil, ErrCustomerIDRequired
	}

	if customerEmail == nil {
		return nil, ErrCustomerEmailRequired
	}

	if len(items) == 0 {
		return nil, ErrOrderItemsRequired
	}

	// Validate all items
	for _, item := range items {
		if err := item.IsValidForOrder(); err != nil {
			return nil, err
		}
	}

	// Calculate total amount
	totalAmount, err := calculateTotalAmount(items)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	orderID := uuid.New()

	// Update order ID in all items
	for _, item := range items {
		item.SetOrderID(orderID)
	}

	order := &Order{
		id:            orderID,
		customerID:    customerID,
		customerEmail: customerEmail,
		items:         items,
		totalAmount:   totalAmount,
		status:        OrderStatusPending,
		createdAt:     now,
		updatedAt:     now,
		events:        []DomainEvent{},
	}

	// Add domain event
	order.AddEvent(NewOrderCreatedEvent(order))

	return order, nil
}

// ID returns the order ID
func (o *Order) ID() uuid.UUID {
	return o.id
}

// CustomerID returns the customer ID
func (o *Order) CustomerID() uuid.UUID {
	return o.customerID
}

// CustomerEmail returns the customer email
func (o *Order) CustomerEmail() *Email {
	return o.customerEmail
}

// Items returns a copy of the order items
func (o *Order) Items() []*OrderItem {
	items := make([]*OrderItem, len(o.items))
	for i, item := range o.items {
		items[i] = item.Clone()
	}
	return items
}

// TotalAmount returns the total amount
func (o *Order) TotalAmount() *Money {
	return o.totalAmount
}

// Status returns the current status
func (o *Order) Status() OrderStatus {
	return o.status
}

// CreatedAt returns the creation time
func (o *Order) CreatedAt() time.Time {
	return o.createdAt
}

// UpdatedAt returns the last update time
func (o *Order) UpdatedAt() time.Time {
	return o.updatedAt
}

// ProcessedAt returns the processing time
func (o *Order) ProcessedAt() *time.Time {
	return o.processedAt
}

// Events returns the domain events
func (o *Order) Events() []DomainEvent {
	return append([]DomainEvent{}, o.events...)
}

// ClearEvents clears all domain events
func (o *Order) ClearEvents() {
	o.events = []DomainEvent{}
}

// AddEvent adds a domain event
func (o *Order) AddEvent(event DomainEvent) {
	o.events = append(o.events, event)
}

// TransitionTo changes the order status with validation
func (o *Order) TransitionTo(newStatus OrderStatus) error {
	if !o.status.CanTransitionTo(newStatus) {
		return NewValidationError("status", newStatus, 
			"invalid status transition from "+string(o.status)+" to "+string(newStatus))
	}

	oldStatus := o.status
	o.status = newStatus
	o.updatedAt = time.Now()

	// Set processed time for terminal states
	if newStatus.IsTerminal() && o.processedAt == nil {
		now := time.Now()
		o.processedAt = &now
	}

	// Add appropriate domain event
	switch newStatus {
	case OrderStatusConfirmed:
		o.AddEvent(NewOrderProcessedEvent(o, oldStatus, newStatus))
	case OrderStatusFailed, OrderStatusCancelled:
		o.AddEvent(NewOrderFailedEvent(o, oldStatus, newStatus))
	default:
		o.AddEvent(NewOrderStatusChangedEvent(o, oldStatus, newStatus))
	}

	return nil
}

// AddItem adds a new item to the order
func (o *Order) AddItem(productID uuid.UUID, productName string, quantity int, unitPrice *Money) error {
	// Can only add items to pending orders
	if o.status != OrderStatusPending {
		return NewBusinessRuleError("cannot add items to order with status: " + string(o.status))
	}

	item, err := NewOrderItem(o.id, productID, productName, quantity, unitPrice)
	if err != nil {
		return err
	}

	o.items = append(o.items, item)

	// Recalculate total
	totalAmount, err := calculateTotalAmount(o.items)
	if err != nil {
		return err
	}

	o.totalAmount = totalAmount
	o.updatedAt = time.Now()

	return nil
}

// RemoveItem removes an item from the order
func (o *Order) RemoveItem(itemID uuid.UUID) error {
	// Can only remove items from pending orders
	if o.status != OrderStatusPending {
		return NewBusinessRuleError("cannot remove items from order with status: " + string(o.status))
	}

	for i, item := range o.items {
		if item.ID() == itemID {
			// Remove item
			o.items = append(o.items[:i], o.items[i+1:]...)
			
			// Ensure at least one item remains
			if len(o.items) == 0 {
				return ErrOrderItemsRequired
			}

			// Recalculate total
			totalAmount, err := calculateTotalAmount(o.items)
			if err != nil {
				return err
			}

			o.totalAmount = totalAmount
			o.updatedAt = time.Now()

			return nil
		}
	}

	return NewValidationError("itemID", itemID, "item not found in order")
}

// UpdateItemQuantity updates the quantity of an existing item
func (o *Order) UpdateItemQuantity(itemID uuid.UUID, newQuantity int) error {
	// Can only update items in pending orders
	if o.status != OrderStatusPending {
		return NewBusinessRuleError("cannot update items in order with status: " + string(o.status))
	}

	for _, item := range o.items {
		if item.ID() == itemID {
			err := item.UpdateQuantity(newQuantity)
			if err != nil {
				return err
			}

			// Recalculate total
			totalAmount, err := calculateTotalAmount(o.items)
			if err != nil {
				return err
			}

			o.totalAmount = totalAmount
			o.updatedAt = time.Now()

			return nil
		}
	}

	return NewValidationError("itemID", itemID, "item not found in order")
}

// IsValid validates the entire order
func (o *Order) IsValid() error {
	if o.id == uuid.Nil {
		return ErrOrderIDRequired
	}

	if o.customerID == uuid.Nil {
		return ErrCustomerIDRequired
	}

	if o.customerEmail == nil {
		return ErrCustomerEmailRequired
	}

	if len(o.items) == 0 {
		return ErrOrderItemsRequired
	}

	if !o.status.IsValid() {
		return ErrInvalidOrderStatus
	}

	// Validate all items
	for _, item := range o.items {
		if err := item.IsValidForOrder(); err != nil {
			return err
		}
	}

	// Validate total amount calculation
	expectedTotal, err := calculateTotalAmount(o.items)
	if err != nil {
		return err
	}

	if !o.totalAmount.Equals(*expectedTotal) {
		return NewBusinessRuleError("total amount does not match sum of item totals")
	}

	return nil
}

// IsPending checks if the order is in pending status
func (o *Order) IsPending() bool {
	return o.status == OrderStatusPending
}

// IsProcessing checks if the order is being processed
func (o *Order) IsProcessing() bool {
	return o.status == OrderStatusStockVerified ||
		o.status == OrderStatusPaymentProcessing ||
		o.status == OrderStatusPaymentCompleted
}

// IsCompleted checks if the order is completed successfully
func (o *Order) IsCompleted() bool {
	return o.status == OrderStatusConfirmed
}

// IsFailed checks if the order has failed
func (o *Order) IsFailed() bool {
	return o.status == OrderStatusFailed || o.status == OrderStatusCancelled
}

// GetItemCount returns the total number of items
func (o *Order) GetItemCount() int {
	count := 0
	for _, item := range o.items {
		count += item.Quantity()
	}
	return count
}

// calculateTotalAmount calculates the total amount from all items
func calculateTotalAmount(items []*OrderItem) (*Money, error) {
	if len(items) == 0 {
		return nil, ErrOrderItemsRequired
	}

	// Get currency from first item
	total, err := NewMoneyFromCents(0, items[0].TotalPrice().Currency())
	if err != nil {
		return nil, err
	}

	for _, item := range items {
		// Ensure all items have the same currency
		if item.TotalPrice().Currency() != total.Currency() {
			return nil, NewBusinessRuleError("all items must have the same currency")
		}

		var err error
		total, err = total.Add(*item.TotalPrice())
		if err != nil {
			return nil, err
		}
	}

	return total, nil
}