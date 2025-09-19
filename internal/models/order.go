package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Order represents an order in the system
type Order struct {
	ID           uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CustomerID   uuid.UUID      `json:"customer_id" gorm:"type:uuid;not null;index"`
	Status       OrderStatus    `json:"status" gorm:"type:varchar(50);not null;default:'pending';index"`
	TotalAmount  float64        `json:"total_amount" gorm:"type:decimal(10,2);not null;check:total_amount >= 0"`
	Currency     string         `json:"currency" gorm:"type:varchar(3);not null;default:'USD';check:length(currency) = 3"`
	Metadata     datatypes.JSON `json:"metadata,omitempty" gorm:"type:jsonb"`
	CreatedAt    time.Time      `json:"created_at" gorm:"index"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index"`
	
	// Relationships
	Items []OrderItem `json:"items,omitempty" gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE"`
}

// OrderStatus represents the possible states of an order
type OrderStatus string

const (
	OrderStatusPending    OrderStatus = "pending"
	OrderStatusProcessing OrderStatus = "processing"
	OrderStatusShipped    OrderStatus = "shipped"
	OrderStatusDelivered  OrderStatus = "delivered"
	OrderStatusCancelled  OrderStatus = "cancelled"
	OrderStatusFailed     OrderStatus = "failed"
)

// IsValid checks if the order status is valid
func (s OrderStatus) IsValid() bool {
	switch s {
	case OrderStatusPending, OrderStatusProcessing, OrderStatusShipped,
		 OrderStatusDelivered, OrderStatusCancelled, OrderStatusFailed:
		return true
	default:
		return false
	}
}

// String returns the string representation of the order status
func (s OrderStatus) String() string {
	return string(s)
}

// BeforeCreate hook to generate UUID if not provided
func (o *Order) BeforeCreate(tx *gorm.DB) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	return nil
}

// TableName specifies the table name for the Order model
func (Order) TableName() string {
	return "orders"
}