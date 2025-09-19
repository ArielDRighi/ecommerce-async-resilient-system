package messaging

import (
	"fmt"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/config"
)

// TopologyManager manages RabbitMQ exchanges, queues, and bindings
type TopologyManager struct {
	config *config.RabbitMQConfig
	logger *zap.Logger
}

// NewTopologyManager creates a new topology manager
func NewTopologyManager(config *config.RabbitMQConfig, logger *zap.Logger) *TopologyManager {
	return &TopologyManager{
		config: config,
		logger: logger,
	}
}

// SetupTopology sets up the complete messaging topology
func (tm *TopologyManager) SetupTopology(ch *amqp.Channel) error {
	tm.logger.Info("Setting up RabbitMQ topology")

	// Setup main exchange
	if err := tm.setupExchange(ch); err != nil {
		return fmt.Errorf("failed to setup exchange: %w", err)
	}

	// Setup dead letter exchange
	if err := tm.setupDeadLetterExchange(ch); err != nil {
		return fmt.Errorf("failed to setup dead letter exchange: %w", err)
	}

	// Setup main queue
	if err := tm.setupMainQueue(ch); err != nil {
		return fmt.Errorf("failed to setup main queue: %w", err)
	}

	// Setup dead letter queue
	if err := tm.setupDeadLetterQueue(ch); err != nil {
		return fmt.Errorf("failed to setup dead letter queue: %w", err)
	}

	// Setup bindings
	if err := tm.setupBindings(ch); err != nil {
		return fmt.Errorf("failed to setup bindings: %w", err)
	}

	tm.logger.Info("RabbitMQ topology setup completed successfully")
	return nil
}

// setupExchange creates the main exchange
func (tm *TopologyManager) setupExchange(ch *amqp.Channel) error {
	tm.logger.Info("Creating main exchange",
		zap.String("exchange", tm.config.Exchange),
		zap.String("type", "topic"),
	)

	return ch.ExchangeDeclare(
		tm.config.Exchange, // exchange name
		"topic",            // type
		true,               // durable
		false,              // auto-deleted
		false,              // internal
		false,              // no-wait
		nil,                // arguments
	)
}

// setupDeadLetterExchange creates the dead letter exchange
func (tm *TopologyManager) setupDeadLetterExchange(ch *amqp.Channel) error {
	dlxName := tm.config.Exchange + ".dlx"
	
	tm.logger.Info("Creating dead letter exchange",
		zap.String("exchange", dlxName),
		zap.String("type", "direct"),
	)

	return ch.ExchangeDeclare(
		dlxName, // exchange name
		"direct", // type
		true,     // durable
		false,    // auto-deleted
		false,    // internal
		false,    // no-wait
		nil,      // arguments
	)
}

// setupMainQueue creates the main processing queue with dead letter routing
func (tm *TopologyManager) setupMainQueue(ch *amqp.Channel) error {
	dlxName := tm.config.Exchange + ".dlx"
	
	// Queue arguments for dead letter routing
	args := amqp.Table{
		"x-dead-letter-exchange":    dlxName,
		"x-dead-letter-routing-key": tm.config.DLQ,
		"x-message-ttl":             300000, // 5 minutes TTL
		"x-max-retries":             tm.config.MaxRetries,
	}

	tm.logger.Info("Creating main queue",
		zap.String("queue", tm.config.Queue),
		zap.String("dead_letter_exchange", dlxName),
		zap.String("dead_letter_routing_key", tm.config.DLQ),
	)

	_, err := ch.QueueDeclare(
		tm.config.Queue, // queue name
		true,            // durable
		false,           // delete when unused
		false,           // exclusive
		false,           // no-wait
		args,            // arguments
	)

	return err
}

// setupDeadLetterQueue creates the dead letter queue
func (tm *TopologyManager) setupDeadLetterQueue(ch *amqp.Channel) error {
	tm.logger.Info("Creating dead letter queue",
		zap.String("queue", tm.config.DLQ),
	)

	_, err := ch.QueueDeclare(
		tm.config.DLQ, // queue name
		true,          // durable
		false,         // delete when unused
		false,         // exclusive
		false,         // no-wait
		nil,           // arguments
	)

	return err
}

// setupBindings creates the queue bindings
func (tm *TopologyManager) setupBindings(ch *amqp.Channel) error {
	// Bind main queue to main exchange
	tm.logger.Info("Binding main queue to exchange",
		zap.String("queue", tm.config.Queue),
		zap.String("exchange", tm.config.Exchange),
		zap.String("routing_key", tm.config.RoutingKey),
	)

	if err := ch.QueueBind(
		tm.config.Queue,      // queue name
		tm.config.RoutingKey, // routing key
		tm.config.Exchange,   // exchange
		false,                // no-wait
		nil,                  // arguments
	); err != nil {
		return fmt.Errorf("failed to bind main queue: %w", err)
	}

	// Bind dead letter queue to dead letter exchange
	dlxName := tm.config.Exchange + ".dlx"
	
	tm.logger.Info("Binding dead letter queue to dead letter exchange",
		zap.String("queue", tm.config.DLQ),
		zap.String("exchange", dlxName),
		zap.String("routing_key", tm.config.DLQ),
	)

	if err := ch.QueueBind(
		tm.config.DLQ, // queue name
		tm.config.DLQ, // routing key
		dlxName,       // exchange
		false,         // no-wait
		nil,           // arguments
	); err != nil {
		return fmt.Errorf("failed to bind dead letter queue: %w", err)
	}

	return nil
}

// GetTopologySetupFunc returns a function that can be used with Connection
func (tm *TopologyManager) GetTopologySetupFunc() func(*amqp.Channel) error {
	return tm.SetupTopology
}

// DeleteTopology removes all created exchanges and queues (useful for testing)
func (tm *TopologyManager) DeleteTopology(ch *amqp.Channel) error {
	tm.logger.Info("Deleting RabbitMQ topology")

	// Delete queues
	if _, err := ch.QueueDelete(tm.config.Queue, false, false, false); err != nil {
		tm.logger.Warn("Failed to delete main queue", zap.Error(err))
	}

	if _, err := ch.QueueDelete(tm.config.DLQ, false, false, false); err != nil {
		tm.logger.Warn("Failed to delete DLQ", zap.Error(err))
	}

	// Delete exchanges
	if err := ch.ExchangeDelete(tm.config.Exchange, false, false); err != nil {
		tm.logger.Warn("Failed to delete main exchange", zap.Error(err))
	}

	dlxName := tm.config.Exchange + ".dlx"
	if err := ch.ExchangeDelete(dlxName, false, false); err != nil {
		tm.logger.Warn("Failed to delete DLX", zap.Error(err))
	}

	tm.logger.Info("RabbitMQ topology deletion completed")
	return nil
}