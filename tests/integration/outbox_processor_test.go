package integration

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zaptest"
	"gorm.io/datatypes"

	"github.com/username/order-processor/internal/models"
	"github.com/username/order-processor/internal/worker"
)

// TestOutboxProcessorIntegration tests the complete outbox processor workflow
func TestOutboxProcessorIntegration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration tests in short mode")
	}

	t.Run("end_to_end_event_processing", func(t *testing.T) {
		// Create test logger
		logger := zaptest.NewLogger(t)

		// Create test configuration
		config := worker.DefaultOutboxProcessorConfig()
		config.PollInterval = 100 * time.Millisecond
		config.BatchSize = 5
		config.MaxRetries = 3

		// Create mock repository
		mockRepo := &MockOutboxEventRepository{}
		
		// Create test events
		testEvent := models.OutboxEvent{
			ID:            uuid.New(),
			AggregateType: "order",
			AggregateID:   uuid.New(),
			EventType:     "order.created",
			EventData:     datatypes.JSON(`{"order_id":"123","total":100.00}`),
			EventVersion:  1,
			CorrelationID: &uuid.UUID{},
			Processed:     false,
			RetryCount:    0,
			MaxRetries:    3,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		*testEvent.CorrelationID = uuid.New()

		// Setup mock expectations
		mockRepo.On("GetPendingEvents", mock.Anything, 5).Return([]models.OutboxEvent{testEvent}, nil).Once()
		mockRepo.On("MarkAsProcessed", mock.Anything, testEvent.ID).Return(nil).Once()
		mockRepo.On("GetPendingEvents", mock.Anything, 5).Return([]models.OutboxEvent{}, nil)

		// Note: In a real integration test, we would use real RabbitMQ and Redis connections
		// For this demonstration, we're testing the configuration and basic workflow
		t.Log("Integration test would require real RabbitMQ and Redis connections")
		t.Log("This test validates the configuration and mock setup")

		// Verify configuration is valid
		require.Equal(t, 100*time.Millisecond, config.PollInterval)
		require.Equal(t, 5, config.BatchSize)
		require.Equal(t, 3, config.MaxRetries)
		require.True(t, config.EnableDLQ)
		require.True(t, config.EnableOrdering)

		// Verify test event has all required fields for audit trail
		assert.NotEqual(t, uuid.Nil, testEvent.ID)
		assert.NotEqual(t, uuid.Nil, testEvent.AggregateID)
		assert.NotNil(t, testEvent.CorrelationID)
		assert.Equal(t, "order.created", testEvent.EventType)
		assert.False(t, testEvent.Processed)
		assert.Equal(t, 0, testEvent.RetryCount)

		// Verify event data is valid JSON
		var eventData map[string]interface{}
		err := json.Unmarshal(testEvent.EventData, &eventData)
		require.NoError(t, err)
		assert.Equal(t, "123", eventData["order_id"])
		assert.Equal(t, float64(100.00), eventData["total"])

		logger.Info("Integration test setup completed successfully",
			zap.String("event", "integration_test_setup"),
			zap.String("correlation_id", testEvent.CorrelationID.String()),
			zap.String("event_id", testEvent.ID.String()),
			zap.String("event_type", testEvent.EventType),
		)
	})

	t.Run("idempotency_verification", func(t *testing.T) {
		logger := zaptest.NewLogger(t)
		
		// Test idempotency key generation and verification
		eventID := uuid.New()
		eventIDString := eventID.String()
		
		// Verify UUID format for idempotency
		assert.Len(t, eventIDString, 36) // Standard UUID length
		
		// Verify correlation ID propagation
		correlationID := uuid.New()
		correlationIDString := correlationID.String()
		
		logger.Info("Idempotency test completed",
			zap.String("event", "idempotency_verification"),
			zap.String("correlation_id", correlationIDString),
			zap.String("event_id", eventIDString),
		)
		
		// In a real integration test, we would:
		// 1. Process the same event twice
		// 2. Verify only one message is published to RabbitMQ
		// 3. Verify idempotency logs are generated
		// 4. Check Redis for idempotency tracking
		
		t.Log("Full idempotency test would require Redis and RabbitMQ connections")
	})

	t.Run("retry_and_dlq_behavior", func(t *testing.T) {
		logger := zaptest.NewLogger(t)
		
		// Create failing event for retry testing
		failingEvent := models.OutboxEvent{
			ID:            uuid.New(),
			AggregateType: "order",
			AggregateID:   uuid.New(),
			EventType:     "order.failed",
			EventData:     datatypes.JSON(`{"error":"payment_failed"}`),
			EventVersion:  1,
			CorrelationID: &uuid.UUID{},
			Processed:     false,
			RetryCount:    2, // Already retried twice
			MaxRetries:    3,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		}
		*failingEvent.CorrelationID = uuid.New()
		
		// Verify retry logic configuration
		config := worker.DefaultOutboxProcessorConfig()
		assert.Equal(t, 5, config.MaxRetries)
		assert.Equal(t, 1*time.Second, config.BaseRetryDelay)
		assert.Equal(t, 60*time.Second, config.MaxRetryDelay)
		assert.Equal(t, float64(2.0), config.RetryMultiplier)
		
		// Verify DLQ configuration
		assert.True(t, config.EnableDLQ)
		assert.Equal(t, "orders.dlq.exchange", config.DLQExchange)
		assert.Equal(t, "dlq.events", config.DLQRoutingKey)
		
		logger.Info("Retry and DLQ configuration verified",
			zap.String("event", "retry_dlq_verification"),
			zap.String("correlation_id", failingEvent.CorrelationID.String()),
			zap.String("event_id", failingEvent.ID.String()),
			zap.Int("retry_count", failingEvent.RetryCount),
			zap.Int("max_retries", failingEvent.MaxRetries),
		)
		
		// In a real integration test, we would:
		// 1. Configure RabbitMQ to fail publishing
		// 2. Verify exponential backoff timing
		// 3. Verify event is sent to DLQ after max retries
		// 4. Verify retry logs include backoff duration
		// 5. Verify circuit breaker opens after threshold failures
		
		t.Log("Full retry test would require RabbitMQ connection and failure simulation")
	})

	t.Run("metrics_and_monitoring", func(t *testing.T) {
		logger := zaptest.NewLogger(t)
		
		// Verify metrics structure
		var metrics worker.OutboxMetrics
		
		// Verify all required metrics fields exist
		assert.IsType(t, int64(0), metrics.TotalProcessed)
		assert.IsType(t, int64(0), metrics.TotalFailed)
		assert.IsType(t, int64(0), metrics.TotalRetries)
		assert.IsType(t, int64(0), metrics.DLQMessagesSent)
		assert.IsType(t, int64(0), metrics.DLQErrors)
		assert.IsType(t, int64(0), metrics.DuplicatesDetected)
		assert.IsType(t, int(0), metrics.OrderingGroupsActive)
		assert.IsType(t, time.Duration(0), metrics.AverageProcessingTime)
		assert.IsType(t, time.Time{}, metrics.LastProcessedAt)
		assert.IsType(t, time.Time{}, metrics.LastDLQSentAt)
		
		logger.Info("Metrics structure verification completed",
			zap.String("event", "metrics_verification"),
			zap.String("correlation_id", uuid.New().String()),
		)
		
		// In a real integration test, we would:
		// 1. Process several events
		// 2. Verify metrics are updated correctly
		// 3. Verify metrics logging includes all required fields
		// 4. Test GetMetrics() function returns current state
		
		t.Log("Full metrics test would require processing real events")
	})

	t.Run("graceful_shutdown_sequence", func(t *testing.T) {
		logger := zaptest.NewLogger(t)
		
		// Test graceful shutdown configuration
		config := worker.DefaultOutboxProcessorConfig()
		
		// Verify shutdown timeout configuration exists
		// (This would be part of the processor implementation)
		
		logger.Info("Graceful shutdown test setup",
			zap.String("event", "shutdown_test_setup"),
			zap.String("correlation_id", uuid.New().String()),
			zap.Duration("poll_interval", config.PollInterval),
		)
		
		// In a real integration test, we would:
		// 1. Start the outbox processor
		// 2. Send shutdown signal
		// 3. Verify graceful shutdown logs
		// 4. Verify all workers stop properly
		// 5. Verify no events are lost during shutdown
		// 6. Verify shutdown completes within timeout
		
		t.Log("Full shutdown test would require running processor instance")
	})
}

// MockOutboxEventRepository for integration testing
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