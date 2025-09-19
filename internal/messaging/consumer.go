package messaging

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/config"
)

// DeliveryResult represents the result of message processing
type DeliveryResult int

const (
	ResultAck DeliveryResult = iota
	ResultNack
	ResultReject
	ResultRequeue
)

func (r DeliveryResult) String() string {
	switch r {
	case ResultAck:
		return "ack"
	case ResultNack:
		return "nack"
	case ResultReject:
		return "reject"
	case ResultRequeue:
		return "requeue"
	default:
		return "unknown"
	}
}

// MessageHandler defines the interface for handling consumed messages
type MessageHandler interface {
	Handle(ctx context.Context, delivery *amqp.Delivery) DeliveryResult
}

// MessageHandlerFunc is a function adapter for MessageHandler
type MessageHandlerFunc func(ctx context.Context, delivery *amqp.Delivery) DeliveryResult

// Handle implements MessageHandler interface
func (f MessageHandlerFunc) Handle(ctx context.Context, delivery *amqp.Delivery) DeliveryResult {
	return f(ctx, delivery)
}

// Consumer interface defines the contract for message consumption
type Consumer interface {
	Start(ctx context.Context) error
	Stop() error
	IsRunning() bool
	GetStats() ConsumerStats
}

// consumer implements the Consumer interface
type consumer struct {
	conn    *Connection
	config  *config.RabbitMQConfig
	logger  *zap.Logger
	handler MessageHandler

	// Control
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// State
	running int32
	
	// Configuration
	queue          string
	consumerTag    string
	prefetchCount  int
	prefetchSize   int
	autoAck        bool
	exclusive      bool
	noLocal        bool
	noWait         bool

	// Statistics
	messagesReceived  int64
	messagesProcessed int64
	messagesAcked     int64
	messagesNacked    int64
	messagesRejected  int64
	messagesRequeued  int64
	processingErrors  int64
	lastMessageTime   time.Time
}

// ConsumerConfig holds consumer configuration
type ConsumerConfig struct {
	Queue         string
	ConsumerTag   string
	PrefetchCount int
	PrefetchSize  int
	AutoAck       bool
	Exclusive     bool
	NoLocal       bool
	NoWait        bool
	Handler       MessageHandler
}

// ConsumerStats holds consumer statistics
type ConsumerStats struct {
	Running           bool
	MessagesReceived  int64
	MessagesProcessed int64
	MessagesAcked     int64
	MessagesNacked    int64
	MessagesRejected  int64
	MessagesRequeued  int64
	ProcessingErrors  int64
	LastMessageTime   time.Time
}

// NewConsumer creates a new message consumer
func NewConsumer(conn *Connection, config *config.RabbitMQConfig, consumerConfig ConsumerConfig, logger *zap.Logger) Consumer {
	ctx, cancel := context.WithCancel(context.Background())
	
	if consumerConfig.Queue == "" {
		consumerConfig.Queue = config.Queue
	}
	if consumerConfig.ConsumerTag == "" {
		consumerConfig.ConsumerTag = fmt.Sprintf("consumer-%d", time.Now().Unix())
	}
	if consumerConfig.PrefetchCount == 0 {
		consumerConfig.PrefetchCount = 10
	}

	return &consumer{
		conn:          conn,
		config:        config,
		logger:        logger,
		handler:       consumerConfig.Handler,
		ctx:           ctx,
		cancel:        cancel,
		queue:         consumerConfig.Queue,
		consumerTag:   consumerConfig.ConsumerTag,
		prefetchCount: consumerConfig.PrefetchCount,
		prefetchSize:  consumerConfig.PrefetchSize,
		autoAck:       consumerConfig.AutoAck,
		exclusive:     consumerConfig.Exclusive,
		noLocal:       consumerConfig.NoLocal,
		noWait:        consumerConfig.NoWait,
	}
}

// Start starts consuming messages
func (c *consumer) Start(ctx context.Context) error {
	if atomic.SwapInt32(&c.running, 1) == 1 {
		return fmt.Errorf("consumer is already running")
	}

	c.logger.Info("Starting message consumer",
		zap.String("queue", c.queue),
		zap.String("consumer_tag", c.consumerTag),
		zap.Int("prefetch_count", c.prefetchCount),
	)

	c.wg.Add(1)
	go c.consumeLoop(ctx)

	return nil
}

// Stop stops consuming messages
func (c *consumer) Stop() error {
	if atomic.SwapInt32(&c.running, 0) == 0 {
		return nil
	}

	c.logger.Info("Stopping message consumer")
	c.cancel()
	c.wg.Wait()
	c.logger.Info("Message consumer stopped")

	return nil
}

// IsRunning returns true if the consumer is running
func (c *consumer) IsRunning() bool {
	return atomic.LoadInt32(&c.running) == 1
}

// GetStats returns consumer statistics
func (c *consumer) GetStats() ConsumerStats {
	return ConsumerStats{
		Running:           c.IsRunning(),
		MessagesReceived:  atomic.LoadInt64(&c.messagesReceived),
		MessagesProcessed: atomic.LoadInt64(&c.messagesProcessed),
		MessagesAcked:     atomic.LoadInt64(&c.messagesAcked),
		MessagesNacked:    atomic.LoadInt64(&c.messagesNacked),
		MessagesRejected:  atomic.LoadInt64(&c.messagesRejected),
		MessagesRequeued:  atomic.LoadInt64(&c.messagesRequeued),
		ProcessingErrors:  atomic.LoadInt64(&c.processingErrors),
		LastMessageTime:   c.lastMessageTime,
	}
}

// consumeLoop is the main consumption loop
func (c *consumer) consumeLoop(ctx context.Context) {
	defer c.wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case <-c.ctx.Done():
			return
		default:
			if err := c.consume(ctx); err != nil {
				c.logger.Error("Consumer error, retrying in 5 seconds", zap.Error(err))
				time.Sleep(5 * time.Second)
			}
		}
	}
}

// consume handles the actual message consumption
func (c *consumer) consume(ctx context.Context) error {
	if !c.conn.IsConnected() {
		return fmt.Errorf("not connected to RabbitMQ")
	}

	ch, err := c.conn.GetChannel()
	if err != nil {
		return fmt.Errorf("failed to get channel: %w", err)
	}

	// Set QoS
	if err := ch.Qos(c.prefetchCount, c.prefetchSize, false); err != nil {
		return fmt.Errorf("failed to set QoS: %w", err)
	}

	// Start consuming
	deliveries, err := ch.Consume(
		c.queue,       // queue
		c.consumerTag, // consumer tag
		c.autoAck,     // auto-ack
		c.exclusive,   // exclusive
		c.noLocal,     // no-local
		c.noWait,      // no-wait
		nil,           // args
	)
	if err != nil {
		return fmt.Errorf("failed to start consuming: %w", err)
	}

	c.logger.Info("Started consuming messages",
		zap.String("queue", c.queue),
		zap.String("consumer_tag", c.consumerTag),
	)

	// Process deliveries
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-c.ctx.Done():
			return c.ctx.Err()
		case delivery, ok := <-deliveries:
			if !ok {
				return fmt.Errorf("delivery channel closed")
			}
			c.handleDelivery(ctx, &delivery)
		}
	}
}

// handleDelivery processes a single message delivery
func (c *consumer) handleDelivery(ctx context.Context, delivery *amqp.Delivery) {
	atomic.AddInt64(&c.messagesReceived, 1)
	c.lastMessageTime = time.Now()

	start := time.Now()
	messageID := delivery.MessageId
	if messageID == "" {
		messageID = fmt.Sprintf("delivery-%d", delivery.DeliveryTag)
	}

	c.logger.Debug("Processing message",
		zap.String("message_id", messageID),
		zap.String("routing_key", delivery.RoutingKey),
		zap.Uint64("delivery_tag", delivery.DeliveryTag),
		zap.String("consumer_tag", delivery.ConsumerTag),
	)

	// Skip auto-acked messages
	if c.autoAck {
		c.processMessage(ctx, delivery)
		return
	}

	// Process message and handle result
	result := c.processMessage(ctx, delivery)
	processingTime := time.Since(start)

	c.logger.Debug("Message processing completed",
		zap.String("message_id", messageID),
		zap.String("result", result.String()),
		zap.Duration("processing_time", processingTime),
	)

	// Handle acknowledgment based on result
	if err := c.handleAcknowledgment(delivery, result); err != nil {
		c.logger.Error("Failed to acknowledge message",
			zap.String("message_id", messageID),
			zap.String("result", result.String()),
			zap.Error(err),
		)
		atomic.AddInt64(&c.processingErrors, 1)
	}
}

// processMessage processes the message using the handler
func (c *consumer) processMessage(ctx context.Context, delivery *amqp.Delivery) DeliveryResult {
	defer func() {
		if r := recover(); r != nil {
			c.logger.Error("Panic in message handler",
				zap.String("message_id", delivery.MessageId),
				zap.Any("panic", r),
			)
			atomic.AddInt64(&c.processingErrors, 1)
		}
	}()

	atomic.AddInt64(&c.messagesProcessed, 1)

	if c.handler == nil {
		c.logger.Warn("No message handler configured",
			zap.String("message_id", delivery.MessageId),
		)
		return ResultNack
	}

	// Create timeout context for message processing
	msgCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	result := c.handler.Handle(msgCtx, delivery)
	
	c.logger.Debug("Message handler result",
		zap.String("message_id", delivery.MessageId),
		zap.String("result", result.String()),
	)

	return result
}

// handleAcknowledgment handles message acknowledgment based on processing result
func (c *consumer) handleAcknowledgment(delivery *amqp.Delivery, result DeliveryResult) error {
	switch result {
	case ResultAck:
		atomic.AddInt64(&c.messagesAcked, 1)
		return delivery.Ack(false)
		
	case ResultNack:
		atomic.AddInt64(&c.messagesNacked, 1)
		return delivery.Nack(false, false) // Don't requeue
		
	case ResultReject:
		atomic.AddInt64(&c.messagesRejected, 1)
		return delivery.Reject(false) // Don't requeue
		
	case ResultRequeue:
		atomic.AddInt64(&c.messagesRequeued, 1)
		return delivery.Nack(false, true) // Requeue
		
	default:
		c.logger.Warn("Unknown delivery result, treating as NACK",
			zap.String("message_id", delivery.MessageId),
			zap.String("result", result.String()),
		)
		atomic.AddInt64(&c.messagesNacked, 1)
		return delivery.Nack(false, false)
	}
}

// SimpleMessageHandler creates a simple message handler that parses JSON messages
func SimpleMessageHandler(handler func(ctx context.Context, message *Message) error, logger *zap.Logger) MessageHandler {
	return MessageHandlerFunc(func(ctx context.Context, delivery *amqp.Delivery) DeliveryResult {
		var message Message
		if err := json.Unmarshal(delivery.Body, &message); err != nil {
			logger.Error("Failed to unmarshal message",
				zap.String("message_id", delivery.MessageId),
				zap.Error(err),
			)
			return ResultReject
		}

		if err := handler(ctx, &message); err != nil {
			logger.Error("Message handler error",
				zap.String("message_id", message.ID),
				zap.String("message_type", message.Type),
				zap.Error(err),
			)
			return ResultRequeue
		}

		return ResultAck
	})
}