package messaging

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/config"
)

// ConnectionState represents the state of the RabbitMQ connection
type ConnectionState int32

const (
	StateDisconnected ConnectionState = iota
	StateConnecting
	StateConnected
	StateReconnecting
	StateClosed
)

func (s ConnectionState) String() string {
	switch s {
	case StateDisconnected:
		return "disconnected"
	case StateConnecting:
		return "connecting"
	case StateConnected:
		return "connected"
	case StateReconnecting:
		return "reconnecting"
	case StateClosed:
		return "closed"
	default:
		return "unknown"
	}
}

// Connection manages RabbitMQ connection with automatic reconnection
type Connection struct {
	config *config.RabbitMQConfig
	logger *zap.Logger

	// Connection management
	conn    *amqp.Connection
	channel *amqp.Channel
	mu      sync.RWMutex
	state   int32 // ConnectionState

	// Reconnection logic
	done        chan struct{}
	ctx         context.Context
	cancel      context.CancelFunc
	wg          sync.WaitGroup
	isReconnecting int32

	// Metrics
	connectionAttempts int64
	lastConnectedAt    time.Time
	lastDisconnectedAt time.Time

	// Configuration
	maxRetries    int
	retryInterval time.Duration
	
	// Topology setup function
	setupTopology func(*amqp.Channel) error
}

// ConnectionConfig holds connection configuration
type ConnectionConfig struct {
	RabbitMQ      *config.RabbitMQConfig
	Logger        *zap.Logger
	MaxRetries    int
	RetryInterval time.Duration
	SetupTopology func(*amqp.Channel) error
}

// NewConnection creates a new RabbitMQ connection manager
func NewConnection(cfg ConnectionConfig) *Connection {
	ctx, cancel := context.WithCancel(context.Background())
	
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 10
	}
	if cfg.RetryInterval == 0 {
		cfg.RetryInterval = 5 * time.Second
	}

	return &Connection{
		config:        cfg.RabbitMQ,
		logger:        cfg.Logger,
		ctx:           ctx,
		cancel:        cancel,
		done:          make(chan struct{}),
		maxRetries:    cfg.MaxRetries,
		retryInterval: cfg.RetryInterval,
		setupTopology: cfg.SetupTopology,
	}
}

// Connect establishes connection to RabbitMQ
func (c *Connection) Connect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.getState() == StateConnected {
		return nil
	}

	c.setState(StateConnecting)
	c.logger.Info("Connecting to RabbitMQ",
		zap.String("host", c.config.Host),
		zap.Int("port", c.config.Port),
		zap.String("vhost", c.config.VHost),
	)

	url := c.buildConnectionURL()
	conn, err := amqp.Dial(url)
	if err != nil {
		c.setState(StateDisconnected)
		atomic.AddInt64(&c.connectionAttempts, 1)
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		c.setState(StateDisconnected)
		atomic.AddInt64(&c.connectionAttempts, 1)
		return fmt.Errorf("failed to create channel: %w", err)
	}

	// Setup topology if function is provided
	if c.setupTopology != nil {
		if err := c.setupTopology(channel); err != nil {
			channel.Close()
			conn.Close()
			c.setState(StateDisconnected)
			return fmt.Errorf("failed to setup topology: %w", err)
		}
	}

	c.conn = conn
	c.channel = channel
	c.setState(StateConnected)
	c.lastConnectedAt = time.Now()
	atomic.AddInt64(&c.connectionAttempts, 1)

	c.logger.Info("Successfully connected to RabbitMQ",
		zap.String("state", c.getState().String()),
	)

	// Start monitoring connection
	c.wg.Add(1)
	go c.monitorConnection()

	return nil
}

// Disconnect closes the connection gracefully
func (c *Connection) Disconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.getState() == StateClosed || c.getState() == StateDisconnected {
		return nil
	}

	c.logger.Info("Disconnecting from RabbitMQ")
	c.setState(StateClosed)
	c.cancel()

	if c.channel != nil {
		if err := c.channel.Close(); err != nil {
			c.logger.Warn("Error closing channel", zap.Error(err))
		}
		c.channel = nil
	}

	if c.conn != nil {
		if err := c.conn.Close(); err != nil {
			c.logger.Warn("Error closing connection", zap.Error(err))
		}
		c.conn = nil
	}

	// Wait for monitoring goroutine to finish
	c.wg.Wait()
	close(c.done)
	c.lastDisconnectedAt = time.Now()

	c.logger.Info("Disconnected from RabbitMQ")
	return nil
}

// GetChannel returns the current channel
func (c *Connection) GetChannel() (*amqp.Channel, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if c.getState() != StateConnected || c.channel == nil {
		return nil, errors.New("not connected to RabbitMQ")
	}

	return c.channel, nil
}

// IsConnected returns true if connected to RabbitMQ
func (c *Connection) IsConnected() bool {
	return c.getState() == StateConnected
}

// GetState returns the current connection state
func (c *Connection) GetState() ConnectionState {
	return c.getState()
}

// GetStats returns connection statistics
func (c *Connection) GetStats() ConnectionStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return ConnectionStats{
		State:              c.getState(),
		ConnectionAttempts: atomic.LoadInt64(&c.connectionAttempts),
		LastConnectedAt:    c.lastConnectedAt,
		LastDisconnectedAt: c.lastDisconnectedAt,
		IsReconnecting:     atomic.LoadInt32(&c.isReconnecting) == 1,
	}
}

// ConnectionStats holds connection statistics
type ConnectionStats struct {
	State              ConnectionState
	ConnectionAttempts int64
	LastConnectedAt    time.Time
	LastDisconnectedAt time.Time
	IsReconnecting     bool
}

// monitorConnection monitors the connection and handles reconnection
func (c *Connection) monitorConnection() {
	defer c.wg.Done()

	for {
		select {
		case <-c.ctx.Done():
			return
		case <-c.done:
			return
		default:
			if c.conn == nil || c.conn.IsClosed() {
				c.handleDisconnection()
				return
			}
			time.Sleep(1 * time.Second)
		}
	}
}

// handleDisconnection handles connection loss and attempts reconnection
func (c *Connection) handleDisconnection() {
	if atomic.SwapInt32(&c.isReconnecting, 1) == 1 {
		return // Already reconnecting
	}
	defer atomic.StoreInt32(&c.isReconnecting, 0)

	c.setState(StateReconnecting)
	c.lastDisconnectedAt = time.Now()
	
	c.logger.Warn("RabbitMQ connection lost, attempting to reconnect")

	ticker := time.NewTicker(c.retryInterval)
	defer ticker.Stop()

	attempt := 0
	for {
		select {
		case <-c.ctx.Done():
			return
		case <-ticker.C:
			attempt++
			
			c.logger.Info("Attempting to reconnect to RabbitMQ",
				zap.Int("attempt", attempt),
				zap.Int("max_retries", c.maxRetries),
			)

			if err := c.reconnect(); err != nil {
				c.logger.Error("Reconnection attempt failed",
					zap.Error(err),
					zap.Int("attempt", attempt),
				)

				if attempt >= c.maxRetries {
					c.logger.Error("Max reconnection attempts reached, giving up",
						zap.Int("max_retries", c.maxRetries),
					)
					c.setState(StateDisconnected)
					return
				}
				continue
			}

			c.logger.Info("Successfully reconnected to RabbitMQ",
				zap.Int("attempts", attempt),
			)
			
			// Start new monitoring goroutine
			c.wg.Add(1)
			go c.monitorConnection()
			return
		}
	}
}

// reconnect attempts to reconnect to RabbitMQ
func (c *Connection) reconnect() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Clean up existing connection
	if c.channel != nil {
		c.channel.Close()
		c.channel = nil
	}
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}

	// Attempt new connection
	url := c.buildConnectionURL()
	conn, err := amqp.Dial(url)
	if err != nil {
		atomic.AddInt64(&c.connectionAttempts, 1)
		return fmt.Errorf("failed to reconnect: %w", err)
	}

	channel, err := conn.Channel()
	if err != nil {
		conn.Close()
		atomic.AddInt64(&c.connectionAttempts, 1)
		return fmt.Errorf("failed to create channel on reconnect: %w", err)
	}

	// Setup topology
	if c.setupTopology != nil {
		if err := c.setupTopology(channel); err != nil {
			channel.Close()
			conn.Close()
			return fmt.Errorf("failed to setup topology on reconnect: %w", err)
		}
	}

	c.conn = conn
	c.channel = channel
	c.setState(StateConnected)
	c.lastConnectedAt = time.Now()
	atomic.AddInt64(&c.connectionAttempts, 1)

	return nil
}

// buildConnectionURL builds the AMQP connection URL
func (c *Connection) buildConnectionURL() string {
	return fmt.Sprintf("amqp://%s:%s@%s:%d%s",
		c.config.User,
		c.config.Password,
		c.config.Host,
		c.config.Port,
		c.config.VHost,
	)
}

// setState sets the connection state atomically
func (c *Connection) setState(state ConnectionState) {
	atomic.StoreInt32(&c.state, int32(state))
}

// getState gets the connection state atomically
func (c *Connection) getState() ConnectionState {
	return ConnectionState(atomic.LoadInt32(&c.state))
}