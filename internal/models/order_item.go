package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// OrderItem represents an item within an order
type OrderItem struct {
	ID          uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrderID     uuid.UUID      `json:"order_id" gorm:"type:uuid;not null;index"`
	ProductID   uuid.UUID      `json:"product_id" gorm:"type:uuid;not null;index"`
	ProductName string         `json:"product_name" gorm:"type:varchar(255);not null"`
	Quantity    int            `json:"quantity" gorm:"not null;check:quantity > 0"`
	UnitPrice   float64        `json:"unit_price" gorm:"type:decimal(10,2);not null;check:unit_price >= 0"`
	TotalPrice  float64        `json:"total_price" gorm:"type:decimal(10,2);not null;check:total_price >= 0"`
	Metadata    datatypes.JSON `json:"metadata,omitempty" gorm:"type:jsonb"`
	CreatedAt   time.Time      `json:"created_at" gorm:"index"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `json:"-" gorm:"index"`
	
	// Relationships
	Order *Order `json:"-" gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE"`
}

// BeforeCreate hook to generate UUID if not provided
func (oi *OrderItem) BeforeCreate(tx *gorm.DB) error {
	if oi.ID == uuid.Nil {
		oi.ID = uuid.New()
	}
	return nil
}

// BeforeSave hook to calculate total price conditionally
func (oi *OrderItem) BeforeSave(tx *gorm.DB) error {
	// Only calculate TotalPrice if it is not set (zero or negative)
	// This allows for manual price adjustments (discounts, promotions, etc.)
	if oi.TotalPrice <= 0 {
		oi.TotalPrice = float64(oi.Quantity) * oi.UnitPrice
	}
	return nil
}

// TableName specifies the table name for the OrderItem model
func (OrderItem) TableName() string {
	return "order_items"
}