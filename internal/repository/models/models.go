package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// OrderModel represents the GORM model for orders table
type OrderModel struct {
	ID            uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	CustomerID    uuid.UUID      `gorm:"type:uuid;not null;index:idx_orders_customer_id" json:"customer_id"`
	CustomerEmail string         `gorm:"type:varchar(255);not null" json:"customer_email"`
	TotalAmount   int64          `gorm:"not null" json:"total_amount"`        // Amount in cents
	Currency      string         `gorm:"type:varchar(3);not null" json:"currency"`
	Status        string         `gorm:"type:varchar(50);not null;default:'pending';index:idx_orders_status" json:"status"`
	CreatedAt     time.Time      `gorm:"not null;index:idx_orders_created_at" json:"created_at"`
	UpdatedAt     time.Time      `gorm:"not null" json:"updated_at"`
	ProcessedAt   *time.Time     `gorm:"index:idx_orders_processed_at" json:"processed_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index:idx_orders_deleted_at" json:"deleted_at"`
	
	// Relationships
	Items []OrderItemModel `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE" json:"items,omitempty"`
}

// TableName returns the table name for GORM
func (OrderModel) TableName() string {
	return "orders"
}

// BeforeCreate is a GORM hook that runs before creating a record
func (o *OrderModel) BeforeCreate(tx *gorm.DB) error {
	if o.ID == uuid.Nil {
		o.ID = uuid.New()
	}
	
	now := time.Now()
	o.CreatedAt = now
	o.UpdatedAt = now
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a record
func (o *OrderModel) BeforeUpdate(tx *gorm.DB) error {
	o.UpdatedAt = time.Now()
	return nil
}

// OrderItemModel represents the GORM model for order_items table
type OrderItemModel struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	OrderID     uuid.UUID      `gorm:"type:uuid;not null;index:idx_order_items_order_id" json:"order_id"`
	ProductID   uuid.UUID      `gorm:"type:uuid;not null;index:idx_order_items_product_id" json:"product_id"`
	ProductName string         `gorm:"type:varchar(255);not null" json:"product_name"`
	Quantity    int            `gorm:"not null;check:quantity > 0" json:"quantity"`
	UnitPrice   int64          `gorm:"not null" json:"unit_price"`   // Price in cents
	TotalPrice  int64          `gorm:"not null" json:"total_price"`  // Total in cents
	Currency    string         `gorm:"type:varchar(3);not null" json:"currency"`
	CreatedAt   time.Time      `gorm:"not null" json:"created_at"`
	UpdatedAt   time.Time      `gorm:"not null" json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index:idx_order_items_deleted_at" json:"deleted_at"`
	
	// Relationships
	Order *OrderModel `gorm:"foreignKey:OrderID;constraint:OnDelete:CASCADE" json:"order,omitempty"`
}

// TableName returns the table name for GORM
func (OrderItemModel) TableName() string {
	return "order_items"
}

// BeforeCreate is a GORM hook that runs before creating a record
func (oi *OrderItemModel) BeforeCreate(tx *gorm.DB) error {
	if oi.ID == uuid.Nil {
		oi.ID = uuid.New()
	}
	
	now := time.Now()
	oi.CreatedAt = now
	oi.UpdatedAt = now
	
	return nil
}

// BeforeUpdate is a GORM hook that runs before updating a record
func (oi *OrderItemModel) BeforeUpdate(tx *gorm.DB) error {
	oi.UpdatedAt = time.Now()
	return nil
}

// OutboxEventModel represents the GORM model for outbox_events table
type OutboxEventModel struct {
	ID          uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	AggregateID uuid.UUID      `gorm:"type:uuid;not null;index:idx_outbox_events_aggregate_id" json:"aggregate_id"`
	EventType   string         `gorm:"type:varchar(100);not null;index:idx_outbox_events_type" json:"event_type"`
	EventData   datatypes.JSON `gorm:"type:jsonb;not null" json:"event_data"`
	CreatedAt   time.Time      `gorm:"not null;index:idx_outbox_events_created_at" json:"created_at"`
	ProcessedAt *time.Time     `gorm:"index:idx_outbox_events_processed_at" json:"processed_at"`
	RetryCount  int            `gorm:"default:0" json:"retry_count"`
	LastError   *string        `gorm:"type:text" json:"last_error"`
	DeletedAt   gorm.DeletedAt `gorm:"index:idx_outbox_events_deleted_at" json:"deleted_at"`
}

// TableName returns the table name for GORM
func (OutboxEventModel) TableName() string {
	return "outbox_events"
}

// BeforeCreate is a GORM hook that runs before creating a record
func (oe *OutboxEventModel) BeforeCreate(tx *gorm.DB) error {
	if oe.ID == uuid.Nil {
		oe.ID = uuid.New()
	}
	
	if oe.CreatedAt.IsZero() {
		oe.CreatedAt = time.Now()
	}
	
	return nil
}

// IsProcessed checks if the event has been processed
func (oe *OutboxEventModel) IsProcessed() bool {
	return oe.ProcessedAt != nil
}

// MarkAsProcessed marks the event as processed
func (oe *OutboxEventModel) MarkAsProcessed() {
	now := time.Now()
	oe.ProcessedAt = &now
}

// IdempotencyKeyModel represents the GORM model for idempotency_keys table
type IdempotencyKeyModel struct {
	Key            string         `gorm:"type:varchar(255);primary_key" json:"key"`
	ResponseBody   datatypes.JSON `gorm:"type:jsonb" json:"response_body"`
	ResponseStatus int            `gorm:"not null" json:"response_status"`
	CreatedAt      time.Time      `gorm:"not null" json:"created_at"`
	ExpiresAt      time.Time      `gorm:"not null;index:idx_idempotency_keys_expires_at" json:"expires_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index:idx_idempotency_keys_deleted_at" json:"deleted_at"`
}

// TableName returns the table name for GORM
func (IdempotencyKeyModel) TableName() string {
	return "idempotency_keys"
}

// BeforeCreate is a GORM hook that runs before creating a record
func (ik *IdempotencyKeyModel) BeforeCreate(tx *gorm.DB) error {
	now := time.Now()
	ik.CreatedAt = now
	
	// Set default expiration if not set (24 hours)
	if ik.ExpiresAt.IsZero() {
		ik.ExpiresAt = now.Add(24 * time.Hour)
	}
	
	return nil
}

// IsExpired checks if the idempotency key has expired
func (ik *IdempotencyKeyModel) IsExpired() bool {
	return time.Now().After(ik.ExpiresAt)
}

// CommonModel provides common fields for all models
type CommonModel struct {
	ID        uuid.UUID      `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time      `gorm:"not null" json:"created_at"`
	UpdatedAt time.Time      `gorm:"not null" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at"`
}

// BeforeCreate is a GORM hook for CommonModel
func (c *CommonModel) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	
	now := time.Now()
	c.CreatedAt = now
	c.UpdatedAt = now
	
	return nil
}

// BeforeUpdate is a GORM hook for CommonModel
func (c *CommonModel) BeforeUpdate(tx *gorm.DB) error {
	c.UpdatedAt = time.Now()
	return nil
}

// OrderStatus constants matching domain layer
const (
	OrderStatusPending            = "pending"
	OrderStatusStockVerified      = "stock_verified"
	OrderStatusPaymentProcessing  = "payment_processing"
	OrderStatusPaymentCompleted   = "payment_completed"
	OrderStatusConfirmed          = "confirmed"
	OrderStatusFailed             = "failed"
	OrderStatusCancelled          = "cancelled"
)

// ValidOrderStatuses contains all valid order statuses
var ValidOrderStatuses = []string{
	OrderStatusPending,
	OrderStatusStockVerified,
	OrderStatusPaymentProcessing,
	OrderStatusPaymentCompleted,
	OrderStatusConfirmed,
	OrderStatusFailed,
	OrderStatusCancelled,
}

// IsValidOrderStatus checks if the given status is valid
func IsValidOrderStatus(status string) bool {
	for _, validStatus := range ValidOrderStatuses {
		if status == validStatus {
			return true
		}
	}
	return false
}

// Common currency codes
const (
	CurrencyUSD = "USD"
	CurrencyEUR = "EUR"
	CurrencyGBP = "GBP"
	CurrencyCAD = "CAD"
	CurrencyAUD = "AUD"
	CurrencyJPY = "JPY"
)

// ValidCurrencies contains supported currencies
var ValidCurrencies = []string{
	CurrencyUSD,
	CurrencyEUR,
	CurrencyGBP,
	CurrencyCAD,
	CurrencyAUD,
	CurrencyJPY,
}

// IsValidCurrency checks if the given currency is supported
func IsValidCurrency(currency string) bool {
	for _, validCurrency := range ValidCurrencies {
		if currency == validCurrency {
			return true
		}
	}
	return false
}

// ConvertCentsToFloat converts cents to float64
func ConvertCentsToFloat(cents int64) float64 {
	return float64(cents) / 100.0
}

// ConvertFloatToCents converts float64 to cents
func ConvertFloatToCents(amount float64) int64 {
	return int64(amount * 100)
}