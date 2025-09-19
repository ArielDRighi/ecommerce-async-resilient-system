package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// OutboxEvent represents an event in the outbox pattern for reliable messaging
type OutboxEvent struct {
	ID            uuid.UUID      `json:"id" gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	AggregateType string         `json:"aggregate_type" gorm:"type:varchar(100);not null;index:idx_aggregate"`
	AggregateID   uuid.UUID      `json:"aggregate_id" gorm:"type:uuid;not null;index:idx_aggregate"`
	EventType     string         `json:"event_type" gorm:"type:varchar(100);not null;index"`
	EventData     datatypes.JSON `json:"event_data" gorm:"type:jsonb;not null"`
	EventVersion  int            `json:"event_version" gorm:"not null;default:1;check:event_version > 0"`
	CorrelationID *uuid.UUID     `json:"correlation_id,omitempty" gorm:"type:uuid;index"`
	CausationID   *uuid.UUID     `json:"causation_id,omitempty" gorm:"type:uuid"`
	Processed     bool           `json:"processed" gorm:"not null;default:false;index"`
	ProcessedAt   *time.Time     `json:"processed_at,omitempty"`
	RetryCount    int            `json:"retry_count" gorm:"not null;default:0;check:retry_count >= 0"`
	MaxRetries    int            `json:"max_retries" gorm:"not null;default:3;check:max_retries >= 0"`
	NextRetryAt   *time.Time     `json:"next_retry_at,omitempty" gorm:"index"`
	ErrorMessage  *string        `json:"error_message,omitempty" gorm:"type:text"`
	CreatedAt     time.Time      `json:"created_at" gorm:"index"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `json:"-" gorm:"index"`
}

// EventType constants for common event types
const (
	EventTypeOrderCreated   = "order.created"
	EventTypeOrderUpdated   = "order.updated"
	EventTypeOrderCancelled = "order.cancelled"
	EventTypeOrderCompleted = "order.completed"
	EventTypeOrderFailed    = "order.failed"
)

// AggregateType constants for aggregate types
const (
	AggregateTypeOrder = "order"
)

// BeforeCreate hook to generate UUID if not provided
func (oe *OutboxEvent) BeforeCreate(tx *gorm.DB) error {
	if oe.ID == uuid.Nil {
		oe.ID = uuid.New()
	}
	return nil
}

// MarkAsProcessed marks the event as processed
func (oe *OutboxEvent) MarkAsProcessed(tx *gorm.DB) error {
	now := time.Now()
	oe.Processed = true
	oe.ProcessedAt = &now
	oe.ErrorMessage = nil
	return tx.Save(oe).Error
}

// IncrementRetryCount increments the retry count and sets next retry time
func (oe *OutboxEvent) IncrementRetryCount(tx *gorm.DB, nextRetryAt time.Time, errorMsg string) error {
	oe.RetryCount++
	oe.NextRetryAt = &nextRetryAt
	oe.ErrorMessage = &errorMsg
	return tx.Save(oe).Error
}

// CanRetry checks if the event can be retried
func (oe *OutboxEvent) CanRetry() bool {
	return !oe.Processed && oe.RetryCount < oe.MaxRetries
}

// IsReadyForRetry checks if the event is ready for retry
func (oe *OutboxEvent) IsReadyForRetry() bool {
	if oe.Processed || oe.NextRetryAt == nil {
		return false
	}
	return time.Now().After(*oe.NextRetryAt)
}

// TableName specifies the table name for the OutboxEvent model
func (OutboxEvent) TableName() string {
	return "outbox_events"
}