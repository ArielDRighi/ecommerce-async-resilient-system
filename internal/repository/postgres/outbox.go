package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/username/order-processor/internal/domain"
	"github.com/username/order-processor/internal/repository"
	"github.com/username/order-processor/internal/repository/models"
)

// OutboxRepository implements the OutboxRepository interface using GORM and PostgreSQL
type OutboxRepository struct {
	db           *gorm.DB
	orderRepo    *OrderRepository
	errorHandler *repository.ErrorHandler
}

// NewOutboxRepository creates a new PostgreSQL outbox repository
func NewOutboxRepository(db *gorm.DB, orderRepo *OrderRepository) *OutboxRepository {
	return &OutboxRepository{
		db:           db,
		orderRepo:    orderRepo,
		errorHandler: repository.NewErrorHandler(nil),
	}
}

// Create saves a new outbox event
func (r *OutboxRepository) Create(ctx context.Context, event *domain.Event) error {
	eventModel, err := r.domainToModel(event)
	if err != nil {
		return fmt.Errorf("failed to convert event to model: %w", err)
	}

	if err := r.db.WithContext(ctx).Create(&eventModel).Error; err != nil {
		return r.errorHandler.Handle("create", "event", err)
	}

	return nil
}

// CreateWithOrder saves an order and its outbox events in a single transaction
func (r *OutboxRepository) CreateWithOrder(ctx context.Context, order *domain.Order, events []*domain.Event) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Create the order first
		orderModel := r.orderRepo.domainToModel(order)
		if err := tx.Create(&orderModel).Error; err != nil {
			return r.errorHandler.Handle("create_with_order", "order", err)
		}

		// Create all events
		for _, event := range events {
			eventModel, err := r.domainToModel(event)
			if err != nil {
				return fmt.Errorf("failed to convert event to model: %w", err)
			}

			if err := tx.Create(&eventModel).Error; err != nil {
				return r.errorHandler.Handle("create_with_order", "event", err)
			}
		}

		return nil
	})
}

// FindUnprocessedEvents retrieves events that haven't been processed
func (r *OutboxRepository) FindUnprocessedEvents(ctx context.Context, limit int) ([]*domain.Event, error) {
	var eventModels []models.OutboxEventModel

	err := r.db.WithContext(ctx).
		Where("processed_at IS NULL").
		Order("created_at ASC").
		Limit(limit).
		Find(&eventModels).Error

	if err != nil {
		return nil, r.errorHandler.Handle("find_unprocessed", "event", err)
	}

	events := make([]*domain.Event, len(eventModels))
	for i, model := range eventModels {
		event, err := r.modelToDomain(&model)
		if err != nil {
			return nil, fmt.Errorf("failed to convert event model to domain: %w", err)
		}
		events[i] = event
	}

	return events, nil
}

// FindUnprocessedEventsByType retrieves unprocessed events of a specific type
func (r *OutboxRepository) FindUnprocessedEventsByType(ctx context.Context, eventType string, limit int) ([]*domain.Event, error) {
	var eventModels []models.OutboxEventModel

	err := r.db.WithContext(ctx).
		Where("processed_at IS NULL AND event_type = ?", eventType).
		Order("created_at ASC").
		Limit(limit).
		Find(&eventModels).Error

	if err != nil {
		return nil, r.errorHandler.Handle("find_unprocessed_by_type", "event", err)
	}

	events := make([]*domain.Event, len(eventModels))
	for i, model := range eventModels {
		event, err := r.modelToDomain(&model)
		if err != nil {
			return nil, fmt.Errorf("failed to convert event model to domain: %w", err)
		}
		events[i] = event
	}

	return events, nil
}

// MarkAsProcessed marks an event as processed
func (r *OutboxRepository) MarkAsProcessed(ctx context.Context, eventID uuid.UUID) error {
	now := time.Now()
	result := r.db.WithContext(ctx).
		Model(&models.OutboxEventModel{}).
		Where("id = ? AND processed_at IS NULL", eventID).
		Update("processed_at", now)

	if result.Error != nil {
		return r.errorHandler.Handle("mark_processed", "event", result.Error)
	}

	if result.RowsAffected == 0 {
		return repository.NewEventNotFoundError(eventID.String())
	}

	return nil
}

// MarkMultipleAsProcessed marks multiple events as processed in a transaction
func (r *OutboxRepository) MarkMultipleAsProcessed(ctx context.Context, eventIDs []uuid.UUID) error {
	if len(eventIDs) == 0 {
		return nil
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		result := tx.Model(&models.OutboxEventModel{}).
			Where("id IN ? AND processed_at IS NULL", eventIDs).
			Update("processed_at", now)

		if result.Error != nil {
			return r.errorHandler.Handle("mark_multiple_processed", "event", result.Error)
		}

		// Check if all events were found and updated
		if result.RowsAffected != int64(len(eventIDs)) {
			return fmt.Errorf("expected to update %d events, but updated %d", len(eventIDs), result.RowsAffected)
		}

		return nil
	})
}

// FindByID retrieves an event by its ID
func (r *OutboxRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Event, error) {
	var eventModel models.OutboxEventModel

	err := r.db.WithContext(ctx).
		Where("id = ?", id).
		First(&eventModel).Error

	if err != nil {
		return nil, r.errorHandler.Handle("find_by_id", "event", err)
	}

	return r.modelToDomain(&eventModel)
}

// FindByAggregateID retrieves events for a specific aggregate
func (r *OutboxRepository) FindByAggregateID(ctx context.Context, aggregateID uuid.UUID) ([]*domain.Event, error) {
	var eventModels []models.OutboxEventModel

	err := r.db.WithContext(ctx).
		Where("aggregate_id = ?", aggregateID).
		Order("created_at ASC").
		Find(&eventModels).Error

	if err != nil {
		return nil, r.errorHandler.Handle("find_by_aggregate", "event", err)
	}

	events := make([]*domain.Event, len(eventModels))
	for i, model := range eventModels {
		event, err := r.modelToDomain(&model)
		if err != nil {
			return nil, fmt.Errorf("failed to convert event model to domain: %w", err)
		}
		events[i] = event
	}

	return events, nil
}

// DeleteProcessedEvents removes processed events older than the specified time
func (r *OutboxRepository) DeleteProcessedEvents(ctx context.Context, olderThan time.Time) (int64, error) {
	result := r.db.WithContext(ctx).
		Where("processed_at IS NOT NULL AND processed_at < ?", olderThan).
		Delete(&models.OutboxEventModel{})

	if result.Error != nil {
		return 0, r.errorHandler.Handle("delete_processed", "event", result.Error)
	}

	return result.RowsAffected, nil
}

// Count returns the total number of events matching the criteria
func (r *OutboxRepository) Count(ctx context.Context, processed *bool, eventType string) (int64, error) {
	query := r.db.WithContext(ctx).Model(&models.OutboxEventModel{})

	if processed != nil {
		if *processed {
			query = query.Where("processed_at IS NOT NULL")
		} else {
			query = query.Where("processed_at IS NULL")
		}
	}

	if eventType != "" {
		query = query.Where("event_type = ?", eventType)
	}

	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, r.errorHandler.Handle("count", "event", err)
	}

	return count, nil
}

// FindEventsCreatedBetween retrieves events created within a time range
func (r *OutboxRepository) FindEventsCreatedBetween(ctx context.Context, start, end time.Time, processed *bool) ([]*domain.Event, error) {
	query := r.db.WithContext(ctx).
		Where("created_at >= ? AND created_at <= ?", start, end).
		Order("created_at ASC")

	if processed != nil {
		if *processed {
			query = query.Where("processed_at IS NOT NULL")
		} else {
			query = query.Where("processed_at IS NULL")
		}
	}

	var eventModels []models.OutboxEventModel
	if err := query.Find(&eventModels).Error; err != nil {
		return nil, r.errorHandler.Handle("find_between", "event", err)
	}

	events := make([]*domain.Event, len(eventModels))
	for i, model := range eventModels {
		event, err := r.modelToDomain(&model)
		if err != nil {
			return nil, fmt.Errorf("failed to convert event model to domain: %w", err)
		}
		events[i] = event
	}

	return events, nil
}

// CreateBatch creates multiple events in a single transaction
func (r *OutboxRepository) CreateBatch(ctx context.Context, events []*domain.Event) error {
	if len(events) == 0 {
		return nil
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, event := range events {
			eventModel, err := r.domainToModel(event)
			if err != nil {
				return fmt.Errorf("failed to convert event to model: %w", err)
			}

			if err := tx.Create(&eventModel).Error; err != nil {
				return r.errorHandler.Handle("create_batch", "event", err)
			}
		}
		return nil
	})
}

// IncrementRetryCount increments the retry count for an event and optionally sets an error message
func (r *OutboxRepository) IncrementRetryCount(ctx context.Context, eventID uuid.UUID, errorMessage string) error {
	updates := map[string]interface{}{
		"retry_count": gorm.Expr("retry_count + 1"),
	}

	if errorMessage != "" {
		updates["last_error"] = errorMessage
	}

	result := r.db.WithContext(ctx).
		Model(&models.OutboxEventModel{}).
		Where("id = ?", eventID).
		Updates(updates)

	if result.Error != nil {
		return r.errorHandler.Handle("increment_retry", "event", result.Error)
	}

	if result.RowsAffected == 0 {
		return repository.NewEventNotFoundError(eventID.String())
	}

	return nil
}

// FindFailedEvents retrieves events that have exceeded the maximum retry count
func (r *OutboxRepository) FindFailedEvents(ctx context.Context, maxRetryCount int, limit int) ([]*domain.Event, error) {
	var eventModels []models.OutboxEventModel

	err := r.db.WithContext(ctx).
		Where("processed_at IS NULL AND retry_count >= ?", maxRetryCount).
		Order("created_at ASC").
		Limit(limit).
		Find(&eventModels).Error

	if err != nil {
		return nil, r.errorHandler.Handle("find_failed", "event", err)
	}

	events := make([]*domain.Event, len(eventModels))
	for i, model := range eventModels {
		event, err := r.modelToDomain(&model)
		if err != nil {
			return nil, fmt.Errorf("failed to convert event model to domain: %w", err)
		}
		events[i] = event
	}

	return events, nil
}

// domainToModel converts a domain Event to a GORM OutboxEventModel
func (r *OutboxRepository) domainToModel(event *domain.Event) (models.OutboxEventModel, error) {
	eventData, err := json.Marshal(event.Data())
	if err != nil {
		return models.OutboxEventModel{}, fmt.Errorf("failed to marshal event data: %w", err)
	}

	return models.OutboxEventModel{
		ID:          event.ID(),
		AggregateID: event.AggregateID(),
		EventType:   event.Type(),
		EventData:   eventData,
		CreatedAt:   event.OccurredAt(),
		ProcessedAt: event.ProcessedAt(),
		RetryCount:  0, // Reset retry count for new events
		LastError:   nil,
	}, nil
}

// modelToDomain converts a GORM OutboxEventModel to a domain Event
func (r *OutboxRepository) modelToDomain(eventModel *models.OutboxEventModel) (*domain.Event, error) {
	var eventData map[string]interface{}
	if err := json.Unmarshal(eventModel.EventData, &eventData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal event data: %w", err)
	}

	event, err := domain.NewEvent(eventModel.EventType, eventModel.AggregateID, eventData)
	if err != nil {
		return nil, fmt.Errorf("failed to create domain event: %w", err)
	}

	// Set processed timestamp if the event has been processed
	if eventModel.ProcessedAt != nil {
		event.MarkAsProcessed()
	}

	return event, nil
}

// GetDB returns the underlying GORM database connection
func (r *OutboxRepository) GetDB() *gorm.DB {
	return r.db
}

// WithTransaction executes a function within a database transaction
func (r *OutboxRepository) WithTransaction(ctx context.Context, fn func(*gorm.DB) error) error {
	return r.db.WithContext(ctx).Transaction(fn)
}

// GetMetrics returns outbox metrics for monitoring
func (r *OutboxRepository) GetMetrics(ctx context.Context) (OutboxMetrics, error) {
	var metrics OutboxMetrics

	// Count unprocessed events
	unprocessedCount, err := r.Count(ctx, boolPtr(false), "")
	if err != nil {
		return metrics, fmt.Errorf("failed to count unprocessed events: %w", err)
	}
	metrics.UnprocessedEvents = unprocessedCount

	// Count processed events
	processedCount, err := r.Count(ctx, boolPtr(true), "")
	if err != nil {
		return metrics, fmt.Errorf("failed to count processed events: %w", err)
	}
	metrics.ProcessedEvents = processedCount

	// Count failed events (retry count >= 3)
	failedEvents, err := r.FindFailedEvents(ctx, 3, 1000)
	if err != nil {
		return metrics, fmt.Errorf("failed to count failed events: %w", err)
	}
	metrics.FailedEvents = int64(len(failedEvents))

	// Get oldest unprocessed event age
	var oldestEvent models.OutboxEventModel
	err = r.db.WithContext(ctx).
		Where("processed_at IS NULL").
		Order("created_at ASC").
		First(&oldestEvent).Error

	if err != nil && err != gorm.ErrRecordNotFound {
		return metrics, fmt.Errorf("failed to find oldest unprocessed event: %w", err)
	}

	if err != gorm.ErrRecordNotFound {
		metrics.OldestUnprocessedAge = time.Since(oldestEvent.CreatedAt)
	}

	return metrics, nil
}

// OutboxMetrics contains metrics about the outbox
type OutboxMetrics struct {
	UnprocessedEvents    int64         `json:"unprocessed_events"`
	ProcessedEvents      int64         `json:"processed_events"`
	FailedEvents         int64         `json:"failed_events"`
	OldestUnprocessedAge time.Duration `json:"oldest_unprocessed_age"`
}

// boolPtr returns a pointer to a boolean value
func boolPtr(b bool) *bool {
	return &b
}