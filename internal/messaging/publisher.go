package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/config"
)

// Message represents a message to be published
type Message struct {
	ID            string                 `json:"id"`
	Type          string                 `json:"type"`
	Data          interface{}            `json:"data"`
	Timestamp     time.Time              `json:"timestamp"`
	CorrelationID string                 `json:"correlation_id,omitempty"`
	Headers       map[string]interface{} `json:"headers,omitempty"`
}

// Publisher interface defines the contract for message publishing
type Publisher interface {
	Publish(ctx context.Context, routingKey string, message *Message) error
	PublishWithConfirmation(ctx context.Context, routingKey string, message *Message) error
	Close() error
}

// publisher implements the Publisher interface
type publisher struct {
	conn   *Connection
	config *config.RabbitMQConfig
	logger *zap.Logger
}

// NewPublisher creates a new message publisher
func NewPublisher(conn *Connection, config *config.RabbitMQConfig, logger *zap.Logger) Publisher {
	return &publisher{
		conn:   conn,
		config: config,
		logger: logger,
	}
}

// Publish publishes a message without confirmation
func (p *publisher) Publish(ctx context.Context, routingKey string, message *Message) error {
	return p.publishMessage(ctx, routingKey, message, false)
}

// PublishWithConfirmation publishes a message with publisher confirmation
func (p *publisher) PublishWithConfirmation(ctx context.Context, routingKey string, message *Message) error {
	return p.publishMessage(ctx, routingKey, message, true)
}

// publishMessage is the internal method for publishing messages
func (p *publisher) publishMessage(ctx context.Context, routingKey string, message *Message, confirm bool) error {
	if !p.conn.IsConnected() {
		return fmt.Errorf("not connected to RabbitMQ")
	}

	ch, err := p.conn.GetChannel()
	if err != nil {
		return fmt.Errorf("failed to get channel: %w", err)
	}

	// Enable publisher confirmations if requested
	if confirm {
		if err := ch.Confirm(false); err != nil {
			return fmt.Errorf("failed to enable publisher confirmations: %w", err)
		}
	}

	// Set message ID if not provided
	if message.ID == "" {
		message.ID = uuid.New().String()
	}

	// Set timestamp if not provided
	if message.Timestamp.IsZero() {
		message.Timestamp = time.Now()
	}

	// Serialize message to JSON
	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Prepare AMQP headers
	headers := amqp.Table{}
	if message.Headers != nil {
		for k, v := range message.Headers {
			headers[k] = v
		}
	}
	headers["message_type"] = message.Type
	headers["published_at"] = message.Timestamp.Format(time.RFC3339)

	// Create publishing context with timeout
	pubCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// Prepare publishing options
	publishing := amqp.Publishing{
		ContentType:   "application/json",
		ContentEncoding: "",
		DeliveryMode:  amqp.Persistent, // Make message persistent
		Priority:      0,
		CorrelationId: message.CorrelationID,
		MessageId:     message.ID,
		Timestamp:     message.Timestamp,
		Type:          message.Type,
		Headers:       headers,
		Body:          body,
	}

	p.logger.Debug("Publishing message",
		zap.String("message_id", message.ID),
		zap.String("message_type", message.Type),
		zap.String("routing_key", routingKey),
		zap.String("exchange", p.config.Exchange),
		zap.String("correlation_id", message.CorrelationID),
		zap.Bool("confirmation", confirm),
	)

	// Publish the message
	if err := ch.PublishWithContext(
		pubCtx,
		p.config.Exchange, // exchange
		routingKey,        // routing key
		false,             // mandatory
		false,             // immediate
		publishing,        // message
	); err != nil {
		p.logger.Error("Failed to publish message",
			zap.String("message_id", message.ID),
			zap.String("routing_key", routingKey),
			zap.Error(err),
		)
		return fmt.Errorf("failed to publish message: %w", err)
	}

	// Wait for confirmation if enabled
	if confirm {
		select {
		case confirmed := <-ch.NotifyPublish(make(chan amqp.Confirmation, 1)):
			if !confirmed.Ack {
				p.logger.Error("Message was not confirmed by broker",
					zap.String("message_id", message.ID),
					zap.Uint64("delivery_tag", confirmed.DeliveryTag),
				)
				return fmt.Errorf("message was not confirmed by broker")
			}
			p.logger.Debug("Message confirmed by broker",
				zap.String("message_id", message.ID),
				zap.Uint64("delivery_tag", confirmed.DeliveryTag),
			)
		case <-time.After(30 * time.Second):
			p.logger.Error("Timeout waiting for message confirmation",
				zap.String("message_id", message.ID),
			)
			return fmt.Errorf("timeout waiting for message confirmation")
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	p.logger.Info("Message published successfully",
		zap.String("message_id", message.ID),
		zap.String("message_type", message.Type),
		zap.String("routing_key", routingKey),
		zap.Bool("confirmed", confirm),
	)

	return nil
}

// Close closes the publisher
func (p *publisher) Close() error {
	p.logger.Info("Closing publisher")
	return nil
}

// PublisherWithRetry wraps a publisher with retry functionality
type PublisherWithRetry struct {
	publisher  Publisher
	maxRetries int
	retryDelay time.Duration
	logger     *zap.Logger
}

// NewPublisherWithRetry creates a publisher with retry capability
func NewPublisherWithRetry(publisher Publisher, maxRetries int, retryDelay time.Duration, logger *zap.Logger) *PublisherWithRetry {
	return &PublisherWithRetry{
		publisher:  publisher,
		maxRetries: maxRetries,
		retryDelay: retryDelay,
		logger:     logger,
	}
}

// Publish publishes a message with retry logic
func (p *PublisherWithRetry) Publish(ctx context.Context, routingKey string, message *Message) error {
	return p.publishWithRetry(ctx, routingKey, message, false)
}

// PublishWithConfirmation publishes a message with confirmation and retry logic
func (p *PublisherWithRetry) PublishWithConfirmation(ctx context.Context, routingKey string, message *Message) error {
	return p.publishWithRetry(ctx, routingKey, message, true)
}

// publishWithRetry implements the retry logic
func (p *PublisherWithRetry) publishWithRetry(ctx context.Context, routingKey string, message *Message, confirm bool) error {
	var lastErr error
	// Use local variable for retry delay to avoid side effects
	currentDelay := p.retryDelay
	
	for attempt := 1; attempt <= p.maxRetries+1; attempt++ {
		var err error
		
		if confirm {
			err = p.publisher.PublishWithConfirmation(ctx, routingKey, message)
		} else {
			err = p.publisher.Publish(ctx, routingKey, message)
		}

		if err == nil {
			if attempt > 1 {
				p.logger.Info("Message published successfully after retries",
					zap.String("message_id", message.ID),
					zap.Int("attempt", attempt),
				)
			}
			return nil
		}

		lastErr = err
		
		if attempt <= p.maxRetries {
			p.logger.Warn("Failed to publish message, retrying",
				zap.String("message_id", message.ID),
				zap.Int("attempt", attempt),
				zap.Int("max_retries", p.maxRetries),
				zap.Duration("retry_delay", currentDelay),
				zap.Error(err),
			)

			// Wait before retrying
			select {
			case <-time.After(currentDelay):
			case <-ctx.Done():
				return ctx.Err()
			}
			
			// Exponential backoff with local variable
			currentDelay *= 2
		}
	}

	p.logger.Error("Failed to publish message after all retries",
		zap.String("message_id", message.ID),
		zap.Int("max_retries", p.maxRetries),
		zap.Error(lastErr),
	)

	return fmt.Errorf("failed to publish message after %d retries: %w", p.maxRetries, lastErr)
}

// Close closes the publisher with retry
func (p *PublisherWithRetry) Close() error {
	return p.publisher.Close()
}