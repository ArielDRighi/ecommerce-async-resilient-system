package messaging

import (
	"context"
	"fmt"
	"time"

	"go.uber.org/zap"
)

// HealthChecker implements health check for RabbitMQ
type HealthChecker struct {
	conn   *Connection
	logger *zap.Logger
	name   string
}

// NewHealthChecker creates a new RabbitMQ health checker
func NewHealthChecker(conn *Connection, logger *zap.Logger) *HealthChecker {
	return &HealthChecker{
		conn:   conn,
		logger: logger,
		name:   "rabbitmq",
	}
}

// Name returns the name of the health check
func (hc *HealthChecker) Name() string {
	return hc.name
}

// Check performs the health check
func (hc *HealthChecker) Check(ctx context.Context) error {
	// Check if connection exists and is connected
	if hc.conn == nil {
		return fmt.Errorf("RabbitMQ connection is nil")
	}

	if !hc.conn.IsConnected() {
		state := hc.conn.GetState()
		stats := hc.conn.GetStats()
		
		hc.logger.Error("RabbitMQ connection unhealthy",
			zap.String("state", state.String()),
			zap.Int64("connection_attempts", stats.ConnectionAttempts),
			zap.Time("last_connected_at", stats.LastConnectedAt),
			zap.Time("last_disconnected_at", stats.LastDisconnectedAt),
			zap.Bool("is_reconnecting", stats.IsReconnecting),
		)
		
		return fmt.Errorf("RabbitMQ connection is %s", state.String())
	}

	// Try to get a channel to verify connection health
	ch, err := hc.conn.GetChannel()
	if err != nil {
		return fmt.Errorf("failed to get RabbitMQ channel: %w", err)
	}

	// Perform a simple operation to verify channel is working
	// We'll declare a temporary queue and then delete it
	testQueueName := fmt.Sprintf("health-check-%d", time.Now().UnixNano())
	
	// Set a timeout for the health check operations
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Try to declare a test queue
	done := make(chan error, 1)
	go func() {
		_, err := ch.QueueDeclare(
			testQueueName, // name
			false,         // durable
			true,          // delete when unused
			true,          // exclusive
			false,         // no-wait
			nil,           // arguments
		)
		if err != nil {
			done <- err
			return
		}

		// Delete the test queue
		_, err = ch.QueueDelete(testQueueName, false, false, true)
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			return fmt.Errorf("RabbitMQ channel operation failed: %w", err)
		}
	case <-checkCtx.Done():
		return fmt.Errorf("RabbitMQ health check timeout after 5s")
	}

	// Log connection statistics for monitoring
	stats := hc.conn.GetStats()
	hc.logger.Debug("RabbitMQ health check passed",
		zap.String("state", hc.conn.GetState().String()),
		zap.Int64("connection_attempts", stats.ConnectionAttempts),
		zap.Time("last_connected_at", stats.LastConnectedAt),
		zap.Duration("uptime", time.Since(stats.LastConnectedAt)),
	)
	
	return nil
}

// ConsumerHealthChecker implements health check for a specific consumer
type ConsumerHealthChecker struct {
	consumer Consumer
	name     string
	logger   *zap.Logger
}

// NewConsumerHealthChecker creates a health checker for a consumer
func NewConsumerHealthChecker(consumer Consumer, name string, logger *zap.Logger) *ConsumerHealthChecker {
	return &ConsumerHealthChecker{
		consumer: consumer,
		name:     name,
		logger:   logger,
	}
}

// Name returns the name of the consumer health check
func (chc *ConsumerHealthChecker) Name() string {
	return fmt.Sprintf("rabbitmq-consumer-%s", chc.name)
}

// Check performs the consumer health check
func (chc *ConsumerHealthChecker) Check(ctx context.Context) error {
	if chc.consumer == nil {
		return fmt.Errorf("consumer %s is nil", chc.name)
	}

	stats := chc.consumer.GetStats()
	
	// Check if consumer is running
	if !stats.Running {
		chc.logger.Error("Consumer is not running",
			zap.String("consumer", chc.name),
			zap.Int64("messages_received", stats.MessagesReceived),
			zap.Int64("messages_processed", stats.MessagesProcessed),
			zap.Int64("processing_errors", stats.ProcessingErrors),
		)
		return fmt.Errorf("consumer %s is not running", chc.name)
	}

	// Calculate processing error rate
	errorRate := float64(0)
	if stats.MessagesProcessed > 0 {
		errorRate = float64(stats.ProcessingErrors) / float64(stats.MessagesProcessed) * 100
	}

	// If error rate is too high, report as unhealthy
	if errorRate > 20 { // 20% error rate threshold for unhealthy
		chc.logger.Error("Consumer has high error rate",
			zap.String("consumer", chc.name),
			zap.Float64("error_rate_percent", errorRate),
			zap.Int64("processing_errors", stats.ProcessingErrors),
			zap.Int64("messages_processed", stats.MessagesProcessed),
		)
		return fmt.Errorf("consumer %s has high error rate: %.2f%%", chc.name, errorRate)
	}

	// Log consumer statistics for monitoring
	timeSinceLastMessage := time.Since(stats.LastMessageTime)
	chc.logger.Debug("Consumer health check passed",
		zap.String("consumer", chc.name),
		zap.Bool("running", stats.Running),
		zap.Int64("messages_received", stats.MessagesReceived),
		zap.Int64("messages_processed", stats.MessagesProcessed),
		zap.Int64("messages_acked", stats.MessagesAcked),
		zap.Int64("messages_nacked", stats.MessagesNacked),
		zap.Int64("messages_rejected", stats.MessagesRejected),
		zap.Int64("messages_requeued", stats.MessagesRequeued),
		zap.Int64("processing_errors", stats.ProcessingErrors),
		zap.Float64("error_rate_percent", errorRate),
		zap.Time("last_message_time", stats.LastMessageTime),
		zap.Duration("time_since_last_message", timeSinceLastMessage),
	)

	return nil
}