package worker

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/username/order-processor/internal/models"
)

// OutboxEventRepository defines the interface specifically for the outbox processor
type OutboxEventRepository interface {
	// GetPendingEvents retrieves events that are ready for processing
	GetPendingEvents(ctx context.Context, limit int) ([]models.OutboxEvent, error)
	
	// MarkAsProcessed marks an event as processed
	MarkAsProcessed(ctx context.Context, eventID uuid.UUID) error
	
	// IncrementRetryCount increments retry count and sets next retry time
	IncrementRetryCount(ctx context.Context, eventID uuid.UUID, nextRetryAt time.Time) error
	
	// MarkAsFailed marks an event as permanently failed
	MarkAsFailed(ctx context.Context, eventID uuid.UUID, errorMessage string) error
	
	// GetMetrics returns processing metrics
	GetMetrics(ctx context.Context) (ProcessorMetrics, error)
}

// ProcessorMetrics holds metrics for the processor
type ProcessorMetrics struct {
	PendingEvents   int64         `json:"pending_events"`
	ProcessedEvents int64         `json:"processed_events"`
	FailedEvents    int64         `json:"failed_events"`
	OldestPending   time.Duration `json:"oldest_pending"`
}