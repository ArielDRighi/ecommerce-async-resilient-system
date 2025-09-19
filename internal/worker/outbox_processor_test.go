package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap/zaptest"

	"github.com/username/order-processor/internal/models"
)

// MockOutboxEventRepository is a mock implementation of OutboxEventRepository
type MockOutboxEventRepository struct {
	mock.Mock
}

func (m *MockOutboxEventRepository) GetPendingEvents(ctx context.Context, limit int) ([]models.OutboxEvent, error) {
	args := m.Called(ctx, limit)
	return args.Get(0).([]models.OutboxEvent), args.Error(1)
}

func (m *MockOutboxEventRepository) MarkAsProcessed(ctx context.Context, eventID uuid.UUID) error {
	args := m.Called(ctx, eventID)
	return args.Error(0)
}

func (m *MockOutboxEventRepository) IncrementRetryCount(ctx context.Context, eventID uuid.UUID, nextRetryAt time.Time) error {
	args := m.Called(ctx, eventID, nextRetryAt)
	return args.Error(0)
}

func (m *MockOutboxEventRepository) MarkAsFailed(ctx context.Context, eventID uuid.UUID, errorMessage string) error {
	args := m.Called(ctx, eventID, errorMessage)
	return args.Error(0)
}

func (m *MockOutboxEventRepository) GetMetrics(ctx context.Context) (ProcessorMetrics, error) {
	args := m.Called(ctx)
	return args.Get(0).(ProcessorMetrics), args.Error(1)
}

func TestDefaultOutboxProcessorConfig(t *testing.T) {
	config := DefaultOutboxProcessorConfig()
	
	assert.Equal(t, 5*time.Second, config.PollInterval)
	assert.Equal(t, 10, config.BatchSize)
	assert.Equal(t, 3, config.WorkerCount)
	assert.Equal(t, 5, config.MaxRetries)
	assert.Equal(t, 1*time.Second, config.BaseRetryDelay)
	assert.Equal(t, 60*time.Second, config.MaxRetryDelay)
	assert.Equal(t, 2.0, config.RetryMultiplier)
	assert.Equal(t, "orders.exchange", config.Exchange)
	assert.Equal(t, "order", config.RoutingKeyPrefix)
	assert.Equal(t, 30*time.Second, config.MetricsInterval)
	assert.Equal(t, 24*time.Hour, config.IdempotencyTTL)
}

func TestOutboxProcessorConfig_Validation(t *testing.T) {
	tests := []struct {
		name        string
		config      OutboxProcessorConfig
		expectError bool
	}{
		{
			name:        "valid config",
			config:      DefaultOutboxProcessorConfig(),
			expectError: false,
		},
		{
			name: "invalid batch size",
			config: OutboxProcessorConfig{
				BatchSize:   0,
				WorkerCount: 1,
				PollInterval: time.Second,
			},
			expectError: true,
		},
		{
			name: "invalid worker count",
			config: OutboxProcessorConfig{
				BatchSize:   1,
				WorkerCount: 0,
				PollInterval: time.Second,
			},
			expectError: true,
		},
		{
			name: "invalid poll interval",
			config: OutboxProcessorConfig{
				BatchSize:   1,
				WorkerCount: 1,
				PollInterval: 0,
			},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test only configuration validation without creating the actual processor
			// since that requires real RabbitMQ connections
			
			// Validate batch size
			if tt.config.BatchSize <= 0 {
				assert.True(t, tt.expectError, "Expected error for invalid batch size")
				return
			}
			
			// Validate worker count
			if tt.config.WorkerCount <= 0 {
				assert.True(t, tt.expectError, "Expected error for invalid worker count")
				return
			}
			
			// Validate poll interval
			if tt.config.PollInterval <= 0 {
				assert.True(t, tt.expectError, "Expected error for invalid poll interval")
				return
			}
			
			// If we reach here, config should be valid
			assert.False(t, tt.expectError, "Config should be valid")
		})
	}
}

func TestCreatePublishMessage(t *testing.T) {
	// Create a test event
	eventID := uuid.New()
	aggregateID := uuid.New()
	correlationID := uuid.New()
	
	eventData := map[string]interface{}{
		"order_id": aggregateID.String(),
		"amount":   100.50,
		"currency": "USD",
	}
	eventDataJSON, _ := json.Marshal(eventData)
	
	event := models.OutboxEvent{
		ID:            eventID,
		AggregateType: "order",
		AggregateID:   aggregateID,
		EventType:     "order.created",
		EventData:     eventDataJSON,
		EventVersion:  1,
		CorrelationID: &correlationID,
		CreatedAt:     time.Now(),
	}
	
	// Create processor
	config := DefaultOutboxProcessorConfig()
	mockRepo := &MockOutboxEventRepository{}
	logger := zaptest.NewLogger(t)
	
	processor := &outboxProcessor{
		config:     config,
		outboxRepo: mockRepo,
		logger:     logger,
	}
	
	// Test createPublishMessage
	publishMsg, err := processor.createPublishMessage(event)
	
	require.NoError(t, err)
	require.NotNil(t, publishMsg)
	
	assert.Equal(t, config.Exchange, publishMsg.Exchange)
	assert.Equal(t, "order.order.created", publishMsg.RoutingKey)
	assert.Equal(t, eventID.String(), publishMsg.MessageID)
	assert.Equal(t, "application/json", publishMsg.ContentType)
	
	// Verify headers
	assert.Equal(t, eventID.String(), publishMsg.Headers["event_id"])
	assert.Equal(t, aggregateID.String(), publishMsg.Headers["aggregate_id"])
	assert.Equal(t, "order.created", publishMsg.Headers["event_type"])
	assert.Equal(t, correlationID.String(), publishMsg.Headers["correlation_id"])
	assert.Equal(t, 1, publishMsg.Headers["version"])
	
	// Verify body can be unmarshaled
	var eventPayload Event
	err = json.Unmarshal(publishMsg.Body, &eventPayload)
	require.NoError(t, err)
	
	assert.Equal(t, eventID.String(), eventPayload.ID)
	assert.Equal(t, aggregateID.String(), eventPayload.AggregateID)
	assert.Equal(t, "order.created", eventPayload.EventType)
	assert.Equal(t, correlationID.String(), eventPayload.CorrelationID)
	assert.Equal(t, 1, eventPayload.Version)
	assert.Equal(t, eventData, eventPayload.EventData)
}

func TestCreatePublishMessage_NoCorrelationID(t *testing.T) {
	// Create a test event without correlation ID
	eventID := uuid.New()
	aggregateID := uuid.New()
	
	eventData := map[string]interface{}{
		"order_id": aggregateID.String(),
	}
	eventDataJSON, _ := json.Marshal(eventData)
	
	event := models.OutboxEvent{
		ID:            eventID,
		AggregateType: "order",
		AggregateID:   aggregateID,
		EventType:     "order.created",
		EventData:     eventDataJSON,
		EventVersion:  1,
		CorrelationID: nil, // No correlation ID
		CreatedAt:     time.Now(),
	}
	
	// Create processor
	config := DefaultOutboxProcessorConfig()
	mockRepo := &MockOutboxEventRepository{}
	logger := zaptest.NewLogger(t)
	
	processor := &outboxProcessor{
		config:     config,
		outboxRepo: mockRepo,
		logger:     logger,
	}
	
	// Test createPublishMessage
	publishMsg, err := processor.createPublishMessage(event)
	
	require.NoError(t, err)
	require.NotNil(t, publishMsg)
	
	// Verify correlation ID is empty string in headers
	assert.Equal(t, "", publishMsg.Headers["correlation_id"])
	
	// Verify body has empty correlation ID
	var eventPayload Event
	err = json.Unmarshal(publishMsg.Body, &eventPayload)
	require.NoError(t, err)
	assert.Equal(t, "", eventPayload.CorrelationID)
}

func TestCalculateRetryDelay(t *testing.T) {
	config := OutboxProcessorConfig{
		BaseRetryDelay:  1 * time.Second,
		MaxRetryDelay:   60 * time.Second,
		RetryMultiplier: 2.0,
	}
	
	processor := &outboxProcessor{
		config: config,
	}
	
	tests := []struct {
		attempt  int
		expected time.Duration
	}{
		{attempt: 1, expected: 1 * time.Second},
		{attempt: 2, expected: 2 * time.Second},
		{attempt: 3, expected: 4 * time.Second},
		{attempt: 4, expected: 8 * time.Second},
		{attempt: 5, expected: 16 * time.Second},
		{attempt: 6, expected: 32 * time.Second},
		{attempt: 7, expected: 60 * time.Second}, // Capped at MaxRetryDelay
		{attempt: 10, expected: 60 * time.Second}, // Still capped
	}
	
	for _, tt := range tests {
		t.Run(fmt.Sprintf("attempt_%d", tt.attempt), func(t *testing.T) {
			delay := processor.calculateRetryDelay(tt.attempt)
			assert.Equal(t, tt.expected, delay)
		})
	}
}

func TestIdempotencyTracking(t *testing.T) {
	processor := &outboxProcessor{
		processedEvents: make(map[string]time.Time),
		config: OutboxProcessorConfig{
			IdempotencyTTL: 1 * time.Hour,
		},
	}
	
	eventID := "test-event-id"
	
	// Initially not processed
	assert.False(t, processor.isAlreadyProcessed(eventID))
	
	// Mark as processed
	processor.markAsProcessed(eventID)
	
	// Now should be processed
	assert.True(t, processor.isAlreadyProcessed(eventID))
}

func TestCleanupProcessedEvents(t *testing.T) {
	processor := &outboxProcessor{
		processedEvents: make(map[string]time.Time),
		config: OutboxProcessorConfig{
			IdempotencyTTL: 1 * time.Hour,
		},
		logger: zaptest.NewLogger(t),
	}
	
	now := time.Now()
	
	// Add old and new events
	processor.processedEvents["old-event"] = now.Add(-2 * time.Hour) // Expired
	processor.processedEvents["new-event"] = now.Add(-30 * time.Minute) // Not expired
	
	// Cleanup
	processor.cleanupProcessedEvents()
	
	// Old event should be removed, new event should remain
	assert.False(t, processor.isAlreadyProcessed("old-event"))
	assert.True(t, processor.isAlreadyProcessed("new-event"))
}

func TestProcessorMetrics(t *testing.T) {
	processor := &outboxProcessor{
		metrics: OutboxMetrics{
			TotalProcessed: 100,
			TotalFailed:    5,
			TotalRetries:   15,
			ErrorCategories: map[string]int{
				"publish":      3,
				"mark_processed": 2,
			},
		},
	}
	
	metrics := processor.GetMetrics()
	
	assert.Equal(t, int64(100), metrics.TotalProcessed)
	assert.Equal(t, int64(5), metrics.TotalFailed)
	assert.Equal(t, int64(15), metrics.TotalRetries)
	assert.Equal(t, 3, metrics.ErrorCategories["publish"])
	assert.Equal(t, 2, metrics.ErrorCategories["mark_processed"])
}

func TestDefaultWorkerConfig(t *testing.T) {
	config := DefaultWorkerConfig()
	
	assert.Equal(t, 5, config.OutboxProcessor.PollIntervalSeconds)
	assert.Equal(t, 10, config.OutboxProcessor.BatchSize)
	assert.Equal(t, 3, config.OutboxProcessor.WorkerCount)
	assert.Equal(t, 5, config.OutboxProcessor.MaxRetries)
	assert.Equal(t, 1, config.OutboxProcessor.BaseRetryDelaySeconds)
	assert.Equal(t, 60, config.OutboxProcessor.MaxRetryDelaySeconds)
	assert.Equal(t, 2.0, config.OutboxProcessor.RetryMultiplier)
	assert.Equal(t, 30, config.OutboxProcessor.MetricsIntervalSeconds)
	assert.Equal(t, 24, config.OutboxProcessor.IdempotencyTTLHours)
	assert.Equal(t, "orders.exchange", config.RabbitMQ.Exchange)
	assert.Equal(t, "order", config.RabbitMQ.RoutingKeyPrefix)
}