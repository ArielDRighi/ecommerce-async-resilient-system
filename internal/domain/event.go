package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// DomainEvent represents a domain event interface
type DomainEvent interface {
	ID() uuid.UUID
	Type() string
	AggregateID() uuid.UUID
	OccurredAt() time.Time
	Data() map[string]interface{}
}

// Event represents a generic domain event for the outbox pattern
type Event struct {
	id          uuid.UUID
	eventType   string
	aggregateID uuid.UUID
	payload     map[string]interface{}
	occurredAt  time.Time
	processedAt *time.Time
}

// NewEvent creates a new domain event
func NewEvent(eventType string, aggregateID uuid.UUID, payload map[string]interface{}) (*Event, error) {
	if eventType == "" {
		return nil, ErrEventTypeRequired
	}

	if aggregateID == uuid.Nil {
		return nil, ErrAggregateIDRequired
	}

	if payload == nil {
		return nil, ErrEventPayloadRequired
	}

	return &Event{
		id:          uuid.New(),
		eventType:   eventType,
		aggregateID: aggregateID,
		payload:     payload,
		occurredAt:  time.Now(),
	}, nil
}

// ID returns the event ID
func (e *Event) ID() uuid.UUID {
	return e.id
}

// Type returns the event type
func (e *Event) Type() string {
	return e.eventType
}

// AggregateID returns the aggregate ID
func (e *Event) AggregateID() uuid.UUID {
	return e.aggregateID
}

// OccurredAt returns when the event occurred
func (e *Event) OccurredAt() time.Time {
	return e.occurredAt
}

// Data returns the event payload
func (e *Event) Data() map[string]interface{} {
	// Return a copy to prevent mutation
	data := make(map[string]interface{})
	for k, v := range e.payload {
		data[k] = v
	}
	return data
}

// ProcessedAt returns when the event was processed
func (e *Event) ProcessedAt() *time.Time {
	return e.processedAt
}

// MarkAsProcessed marks the event as processed
func (e *Event) MarkAsProcessed() {
	now := time.Now()
	e.processedAt = &now
}

// IsProcessed checks if the event has been processed
func (e *Event) IsProcessed() bool {
	return e.processedAt != nil
}

// ToJSON serializes the event to JSON
func (e *Event) ToJSON() ([]byte, error) {
	data := map[string]interface{}{
		"id":           e.id,
		"type":         e.eventType,
		"aggregate_id": e.aggregateID,
		"payload":      e.payload,
		"occurred_at":  e.occurredAt,
		"processed_at": e.processedAt,
	}
	return json.Marshal(data)
}

// OrderCreatedEvent represents an order created event
type OrderCreatedEvent struct {
	*Event
	order *Order
}

// NewOrderCreatedEvent creates a new order created event
func NewOrderCreatedEvent(order *Order) *OrderCreatedEvent {
	payload := map[string]interface{}{
		"order_id":       order.ID(),
		"customer_id":    order.CustomerID(),
		"customer_email": order.CustomerEmail().Value(),
		"total_amount":   order.TotalAmount().Amount(),
		"currency":       order.TotalAmount().Currency(),
		"item_count":     order.GetItemCount(),
		"status":         order.Status(),
		"created_at":     order.CreatedAt(),
	}

	event, _ := NewEvent("order.created", order.ID(), payload)
	
	return &OrderCreatedEvent{
		Event: event,
		order: order,
	}
}

// Order returns the order that was created
func (e *OrderCreatedEvent) Order() *Order {
	return e.order
}

// OrderProcessedEvent represents an order processed event
type OrderProcessedEvent struct {
	*Event
	order     *Order
	oldStatus OrderStatus
	newStatus OrderStatus
}

// NewOrderProcessedEvent creates a new order processed event
func NewOrderProcessedEvent(order *Order, oldStatus, newStatus OrderStatus) *OrderProcessedEvent {
	payload := map[string]interface{}{
		"order_id":       order.ID(),
		"customer_id":    order.CustomerID(),
		"customer_email": order.CustomerEmail().Value(),
		"old_status":     oldStatus,
		"new_status":     newStatus,
		"total_amount":   order.TotalAmount().Amount(),
		"currency":       order.TotalAmount().Currency(),
		"processed_at":   order.ProcessedAt(),
	}

	event, _ := NewEvent("order.processed", order.ID(), payload)
	
	return &OrderProcessedEvent{
		Event:     event,
		order:     order,
		oldStatus: oldStatus,
		newStatus: newStatus,
	}
}

// Order returns the order that was processed
func (e *OrderProcessedEvent) Order() *Order {
	return e.order
}

// OldStatus returns the previous status
func (e *OrderProcessedEvent) OldStatus() OrderStatus {
	return e.oldStatus
}

// NewStatus returns the new status
func (e *OrderProcessedEvent) NewStatus() OrderStatus {
	return e.newStatus
}

// OrderFailedEvent represents an order failed event
type OrderFailedEvent struct {
	*Event
	order     *Order
	oldStatus OrderStatus
	newStatus OrderStatus
	reason    string
}

// NewOrderFailedEvent creates a new order failed event
func NewOrderFailedEvent(order *Order, oldStatus, newStatus OrderStatus) *OrderFailedEvent {
	return NewOrderFailedEventWithReason(order, oldStatus, newStatus, "")
}

// NewOrderFailedEventWithReason creates a new order failed event with reason
func NewOrderFailedEventWithReason(order *Order, oldStatus, newStatus OrderStatus, reason string) *OrderFailedEvent {
	payload := map[string]interface{}{
		"order_id":       order.ID(),
		"customer_id":    order.CustomerID(),
		"customer_email": order.CustomerEmail().Value(),
		"old_status":     oldStatus,
		"new_status":     newStatus,
		"total_amount":   order.TotalAmount().Amount(),
		"currency":       order.TotalAmount().Currency(),
		"reason":         reason,
		"failed_at":      time.Now(),
	}

	event, _ := NewEvent("order.failed", order.ID(), payload)
	
	return &OrderFailedEvent{
		Event:     event,
		order:     order,
		oldStatus: oldStatus,
		newStatus: newStatus,
		reason:    reason,
	}
}

// Order returns the order that failed
func (e *OrderFailedEvent) Order() *Order {
	return e.order
}

// OldStatus returns the previous status
func (e *OrderFailedEvent) OldStatus() OrderStatus {
	return e.oldStatus
}

// NewStatus returns the new status
func (e *OrderFailedEvent) NewStatus() OrderStatus {
	return e.newStatus
}

// Reason returns the failure reason
func (e *OrderFailedEvent) Reason() string {
	return e.reason
}

// OrderStatusChangedEvent represents a general order status change event
type OrderStatusChangedEvent struct {
	*Event
	order     *Order
	oldStatus OrderStatus
	newStatus OrderStatus
}

// NewOrderStatusChangedEvent creates a new order status changed event
func NewOrderStatusChangedEvent(order *Order, oldStatus, newStatus OrderStatus) *OrderStatusChangedEvent {
	payload := map[string]interface{}{
		"order_id":       order.ID(),
		"customer_id":    order.CustomerID(),
		"customer_email": order.CustomerEmail().Value(),
		"old_status":     oldStatus,
		"new_status":     newStatus,
		"total_amount":   order.TotalAmount().Amount(),
		"currency":       order.TotalAmount().Currency(),
		"changed_at":     time.Now(),
	}

	event, _ := NewEvent("order.status.changed", order.ID(), payload)
	
	return &OrderStatusChangedEvent{
		Event:     event,
		order:     order,
		oldStatus: oldStatus,
		newStatus: newStatus,
	}
}

// Order returns the order
func (e *OrderStatusChangedEvent) Order() *Order {
	return e.order
}

// OldStatus returns the previous status
func (e *OrderStatusChangedEvent) OldStatus() OrderStatus {
	return e.oldStatus
}

// NewStatus returns the new status
func (e *OrderStatusChangedEvent) NewStatus() OrderStatus {
	return e.newStatus
}