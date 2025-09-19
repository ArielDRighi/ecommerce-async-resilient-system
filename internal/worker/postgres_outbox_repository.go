package worker

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/username/order-processor/internal/models"
)

// PostgresOutboxEventRepository implements OutboxEventRepository using GORM
type PostgresOutboxEventRepository struct {
	db *gorm.DB
}

// NewPostgresOutboxEventRepository creates a new PostgreSQL outbox event repository
func NewPostgresOutboxEventRepository(db *gorm.DB) OutboxEventRepository {
	return &PostgresOutboxEventRepository{
		db: db,
	}
}

// GetPendingEvents retrieves events that are ready for processing
func (r *PostgresOutboxEventRepository) GetPendingEvents(ctx context.Context, limit int) ([]models.OutboxEvent, error) {
	var events []models.OutboxEvent
	
	err := r.db.WithContext(ctx).
		Where("processed = ? AND (next_retry_at IS NULL OR next_retry_at <= ?)", false, time.Now()).
		Order("created_at ASC").
		Limit(limit).
		Find(&events).Error
	
	if err != nil {
		return nil, err
	}
	
	return events, nil
}

// MarkAsProcessed marks an event as processed
func (r *PostgresOutboxEventRepository) MarkAsProcessed(ctx context.Context, eventID uuid.UUID) error {
	now := time.Now()
	
	result := r.db.WithContext(ctx).
		Model(&models.OutboxEvent{}).
		Where("id = ? AND processed = ?", eventID, false).
		Updates(map[string]interface{}{
			"processed":    true,
			"processed_at": &now,
		})
	
	if result.Error != nil {
		return result.Error
	}
	
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	
	return nil
}

// IncrementRetryCount increments retry count and sets next retry time
func (r *PostgresOutboxEventRepository) IncrementRetryCount(ctx context.Context, eventID uuid.UUID, nextRetryAt time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&models.OutboxEvent{}).
		Where("id = ?", eventID).
		Updates(map[string]interface{}{
			"retry_count":   gorm.Expr("retry_count + 1"),
			"next_retry_at": &nextRetryAt,
		})
	
	if result.Error != nil {
		return result.Error
	}
	
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	
	return nil
}

// MarkAsFailed marks an event as permanently failed
func (r *PostgresOutboxEventRepository) MarkAsFailed(ctx context.Context, eventID uuid.UUID, errorMessage string) error {
	result := r.db.WithContext(ctx).
		Model(&models.OutboxEvent{}).
		Where("id = ?", eventID).
		Update("error_message", &errorMessage)
	
	if result.Error != nil {
		return result.Error
	}
	
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	
	return nil
}

// GetMetrics returns processing metrics
func (r *PostgresOutboxEventRepository) GetMetrics(ctx context.Context) (ProcessorMetrics, error) {
	var metrics ProcessorMetrics
	
	// Count pending events
	var pendingCount int64
	err := r.db.WithContext(ctx).
		Model(&models.OutboxEvent{}).
		Where("processed = ?", false).
		Count(&pendingCount).Error
	if err != nil {
		return metrics, err
	}
	metrics.PendingEvents = pendingCount
	
	// Count processed events
	var processedCount int64
	err = r.db.WithContext(ctx).
		Model(&models.OutboxEvent{}).
		Where("processed = ?", true).
		Count(&processedCount).Error
	if err != nil {
		return metrics, err
	}
	metrics.ProcessedEvents = processedCount
	
	// Count failed events (retry count >= max_retries)
	var failedCount int64
	err = r.db.WithContext(ctx).
		Model(&models.OutboxEvent{}).
		Where("processed = ? AND retry_count >= max_retries", false).
		Count(&failedCount).Error
	if err != nil {
		return metrics, err
	}
	metrics.FailedEvents = failedCount
	
	// Get oldest pending event
	var oldestEvent models.OutboxEvent
	err = r.db.WithContext(ctx).
		Where("processed = ?", false).
		Order("created_at ASC").
		First(&oldestEvent).Error
	
	if err != nil && err != gorm.ErrRecordNotFound {
		return metrics, err
	}
	
	if err != gorm.ErrRecordNotFound {
		metrics.OldestPending = time.Since(oldestEvent.CreatedAt)
	}
	
	return metrics, nil
}