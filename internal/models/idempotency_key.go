package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// IdempotencyKey represents an idempotency key for request deduplication
type IdempotencyKey struct {
	ID                 uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	IdempotencyKey     string         `json:"idempotency_key" gorm:"type:varchar(255);not null;uniqueIndex"`
	RequestHash        string         `json:"request_hash" gorm:"type:varchar(64);not null"`
	ResponseStatusCode *int           `json:"response_status_code,omitempty" gorm:"check:response_status_code >= 100 AND response_status_code < 600"`
	ResponseBody       datatypes.JSON `json:"response_body,omitempty" gorm:"type:jsonb"`
	ResourceType       string         `json:"resource_type" gorm:"type:varchar(100);not null;index:idx_resource"`
	ResourceID         *uuid.UUID     `json:"resource_id,omitempty" gorm:"type:uuid;index:idx_resource"`
	ExpiresAt          time.Time      `json:"expires_at" gorm:"not null;index"`
	CreatedAt          time.Time      `json:"created_at" gorm:"index"`
	UpdatedAt          time.Time      `json:"updated_at"`
	DeletedAt          gorm.DeletedAt `json:"-" gorm:"index"`
}

// ResourceType constants for common resource types
const (
	ResourceTypeOrder     = "order"
	ResourceTypePayment   = "payment"
	ResourceTypeShipment  = "shipment"
	ResourceTypeRefund    = "refund"
)

// BeforeCreate hook to generate UUID if not provided
func (ik *IdempotencyKey) BeforeCreate(tx *gorm.DB) error {
	if ik.ID == uuid.Nil {
		ik.ID = uuid.New()
	}
	return nil
}

// IsExpired checks if the idempotency key has expired
func (ik *IdempotencyKey) IsExpired() bool {
	return time.Now().After(ik.ExpiresAt)
}

// HasResponse checks if the idempotency key has a stored response
func (ik *IdempotencyKey) HasResponse() bool {
	return ik.ResponseStatusCode != nil
}

// SetResponse sets the response data for the idempotency key
func (ik *IdempotencyKey) SetResponse(statusCode int, body interface{}) error {
	ik.ResponseStatusCode = &statusCode
	if body != nil {
		// Convert body to JSON
		if jsonData, ok := body.(datatypes.JSON); ok {
			ik.ResponseBody = jsonData
		}
	}
	return nil
}

// TableName specifies the table name for the IdempotencyKey model
func (IdempotencyKey) TableName() string {
	return "idempotency_keys"
}