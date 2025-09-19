package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/models"
)

// OutboxProcessorConfig holds configuration for the outbox processor
type OutboxProcessorConfig struct {
	// Polling configuration
	PollInterval    time.Duration `mapstructure:"poll_interval" json:"poll_interval"`
	BatchSize       int           `mapstructure:"batch_size" json:"batch_size"`
	WorkerCount     int           `mapstructure:"worker_count" json:"worker_count"`
	
	// Retry configuration
	MaxRetries        int           `mapstructure:"max_retries" json:"max_retries"`
	BaseRetryDelay    time.Duration `mapstructure:"base_retry_delay" json:"base_retry_delay"`
	MaxRetryDelay     time.Duration `mapstructure:"max_retry_delay" json:"max_retry_delay"`
	RetryMultiplier   float64       `mapstructure:"retry_multiplier" json:"retry_multiplier"`
	
	// Circuit breaker configuration
	CircuitBreakerThreshold     int           `mapstructure:"circuit_breaker_threshold" json:"circuit_breaker_threshold"`
	CircuitBreakerTimeout       time.Duration `mapstructure:"circuit_breaker_timeout" json:"circuit_breaker_timeout"`
	CircuitBreakerResetTimeout  time.Duration `mapstructure:"circuit_breaker_reset_timeout" json:"circuit_breaker_reset_timeout"`
	
	// RabbitMQ configuration
	Exchange         string `mapstructure:"exchange" json:"exchange"`
	RoutingKeyPrefix string `mapstructure:"routing_key_prefix" json:"routing_key_prefix"`
	
	// Dead Letter Queue configuration
	DLQExchange      string `mapstructure:"dlq_exchange" json:"dlq_exchange"`
	DLQRoutingKey    string `mapstructure:"dlq_routing_key" json:"dlq_routing_key"`
	EnableDLQ        bool   `mapstructure:"enable_dlq" json:"enable_dlq"`
	
	// Monitoring configuration
	MetricsInterval time.Duration `mapstructure:"metrics_interval" json:"metrics_interval"`
	
	// Message ordering configuration
	EnableOrdering       bool   `mapstructure:"enable_ordering" json:"enable_ordering"`
	OrderingKey          string `mapstructure:"ordering_key" json:"ordering_key"` // "aggregate_id" or "partition_key"
	MaxConcurrentGroups  int    `mapstructure:"max_concurrent_groups" json:"max_concurrent_groups"`
	
	// Idempotency configuration
	IdempotencyTTL time.Duration `mapstructure:"idempotency_ttl" json:"idempotency_ttl"`
}

// DefaultOutboxProcessorConfig returns default configuration
func DefaultOutboxProcessorConfig() OutboxProcessorConfig {
	return OutboxProcessorConfig{
		PollInterval:                5 * time.Second,
		BatchSize:                   10,
		WorkerCount:                 3,
		MaxRetries:                  5,
		BaseRetryDelay:              1 * time.Second,
		MaxRetryDelay:               60 * time.Second,
		RetryMultiplier:             2.0,
		CircuitBreakerThreshold:     10,
		CircuitBreakerTimeout:       30 * time.Second,
		CircuitBreakerResetTimeout:  5 * time.Minute,
		Exchange:                    "orders.exchange",
		RoutingKeyPrefix:            "order",
		DLQExchange:                 "orders.dlq.exchange",
		DLQRoutingKey:               "dlq.events",
		EnableDLQ:                   true,
		MetricsInterval:             30 * time.Second,
		EnableOrdering:              true,
		OrderingKey:                 "aggregate_id",
		MaxConcurrentGroups:         10,
		IdempotencyTTL:              24 * time.Hour,
	}
}

// OutboxProcessor handles polling outbox events and publishing them to RabbitMQ
type OutboxProcessor interface {
	// Start begins the outbox processing with comprehensive logging
	Start(ctx context.Context) error
	
	// Stop gracefully shuts down the processor with audit logs
	Stop(ctx context.Context) error
	
	// GetMetrics returns current processing metrics
	GetMetrics() OutboxMetrics
	
	// GetStatus returns current processor status
	GetStatus() ProcessorStatus
}

// ProcessorStatus represents the current status of the processor
type ProcessorStatus string

const (
	StatusStopped    ProcessorStatus = "stopped"
	StatusStarting   ProcessorStatus = "starting"
	StatusRunning    ProcessorStatus = "running"
	StatusStopping   ProcessorStatus = "stopping"
	StatusErrored    ProcessorStatus = "errored"
	StatusDegraded   ProcessorStatus = "degraded"
)

// OutboxMetrics holds metrics for monitoring outbox processing
type OutboxMetrics struct {
	// Processing metrics
	TotalProcessed       int64     `json:"total_processed"`
	TotalFailed          int64     `json:"total_failed"`
	TotalRetries         int64     `json:"total_retries"`
	CurrentBatchSize     int       `json:"current_batch_size"`
	LastProcessedAt      time.Time `json:"last_processed_at"`
	
	// Performance metrics
	AverageProcessingTime time.Duration `json:"average_processing_time"`
	LastProcessingTime    time.Duration `json:"last_processing_time"`
	
	// Error metrics
	ConsecutiveFailures   int                    `json:"consecutive_failures"`
	ErrorCategories       map[string]int         `json:"error_categories"`
	LastError             string                 `json:"last_error"`
	LastErrorAt           time.Time              `json:"last_error_at"`
	
	// Queue metrics
	PendingEvents         int64                  `json:"pending_events"`
	OldestPendingEvent    time.Time              `json:"oldest_pending_event"`
	
	// Idempotency metrics
	DuplicatesDetected    int64                  `json:"duplicates_detected"`
	IdempotencyHitRate    float64                `json:"idempotency_hit_rate"`
	
	// Dead Letter Queue metrics
	DLQMessagesSent       int64                  `json:"dlq_messages_sent"`
	DLQErrors             int64                  `json:"dlq_errors"`
	LastDLQSentAt         time.Time              `json:"last_dlq_sent_at"`
	
	// Message ordering metrics
	OrderingGroupsActive  int                    `json:"ordering_groups_active"`
	MaxOrderingGroups     int                    `json:"max_ordering_groups"`
	OrderingViolations    int64                  `json:"ordering_violations"`
	AverageGroupSize      float64                `json:"average_group_size"`
}

// GroupProcessingResult contains the result of processing an event group
type GroupProcessingResult struct {
	OrderingKey string
	Processed   int
	Failed      int
	Error       error
}

// CircuitBreakerState represents the state of the circuit breaker
type CircuitBreakerState string

const (
	CircuitClosed   CircuitBreakerState = "closed"
	CircuitOpen     CircuitBreakerState = "open"
	CircuitHalfOpen CircuitBreakerState = "half_open"
)

// CircuitBreaker implements the circuit breaker pattern for handling failures
type CircuitBreaker struct {
	mu               sync.RWMutex
	state            CircuitBreakerState
	failureCount     int
	failureThreshold int
	timeout          time.Duration
	resetTimeout     time.Duration
	nextAttempt      time.Time
	logger           *zap.Logger
}

// NewCircuitBreaker creates a new circuit breaker
func NewCircuitBreaker(threshold int, timeout, resetTimeout time.Duration, logger *zap.Logger) *CircuitBreaker {
	return &CircuitBreaker{
		state:            CircuitClosed,
		failureThreshold: threshold,
		timeout:          timeout,
		resetTimeout:     resetTimeout,
		logger:           logger,
	}
}

// CanExecute checks if the circuit breaker allows execution
func (cb *CircuitBreaker) CanExecute() bool {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	
	switch cb.state {
	case CircuitClosed:
		return true
	case CircuitOpen:
		return time.Now().After(cb.nextAttempt)
	case CircuitHalfOpen:
		return true
	default:
		return false
	}
}

// RecordSuccess records a successful operation
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	cb.failureCount = 0
	if cb.state == CircuitHalfOpen {
		cb.state = CircuitClosed
		cb.logger.Info("Circuit breaker closed after successful execution",
			zap.String("event", "circuit_breaker_closed"),
			zap.String("previous_state", "half_open"),
		)
	}
}

// RecordFailure records a failed operation
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	cb.failureCount++
	
	if cb.state == CircuitClosed && cb.failureCount >= cb.failureThreshold {
		cb.state = CircuitOpen
		cb.nextAttempt = time.Now().Add(cb.resetTimeout)
		cb.logger.Warn("Circuit breaker opened due to failures",
			zap.String("event", "circuit_breaker_opened"),
			zap.Int("failure_count", cb.failureCount),
			zap.Int("threshold", cb.failureThreshold),
			zap.Time("next_attempt", cb.nextAttempt),
		)
	} else if cb.state == CircuitHalfOpen {
		cb.state = CircuitOpen
		cb.nextAttempt = time.Now().Add(cb.resetTimeout)
		cb.logger.Warn("Circuit breaker reopened after half-open failure",
			zap.String("event", "circuit_breaker_reopened"),
			zap.Time("next_attempt", cb.nextAttempt),
		)
	}
}

// GetState returns the current state of the circuit breaker
func (cb *CircuitBreaker) GetState() CircuitBreakerState {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}

// TryHalfOpen attempts to transition from open to half-open state
func (cb *CircuitBreaker) TryHalfOpen() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	
	if cb.state == CircuitOpen && time.Now().After(cb.nextAttempt) {
		cb.state = CircuitHalfOpen
		cb.logger.Info("Circuit breaker transitioned to half-open",
			zap.String("event", "circuit_breaker_half_open"),
		)
		return true
	}
	return false
}

// outboxProcessor implements OutboxProcessor interface
type outboxProcessor struct {
	config       OutboxProcessorConfig
	outboxRepo   OutboxEventRepository
	rabbitConn   *amqp091.Connection
	rabbitCh     *amqp091.Channel
	redisClient  *redis.Client
	logger       *zap.Logger
	
	// State management
	status       ProcessorStatus
	statusMu     sync.RWMutex
	metrics      OutboxMetrics
	metricsMu    sync.RWMutex
	
	// Control channels
	stopCh       chan struct{}
	doneCh       chan struct{}
	
	// Idempotency tracking
	processedEvents map[string]time.Time
	processedMu     sync.RWMutex
	
	// Workers
	workerPool   chan struct{}
	wg           sync.WaitGroup
	
	// Circuit breaker state
	circuitBreaker *CircuitBreaker
	
	// Message ordering state
	activeGroups    map[string]chan struct{} // Track active ordering groups
	activeGroupsMu  sync.RWMutex
	groupSemaphore  chan struct{} // Limit concurrent groups
}

// NewOutboxProcessor creates a new outbox processor with comprehensive logging setup
func NewOutboxProcessor(
	config OutboxProcessorConfig,
	outboxRepo OutboxEventRepository,
	rabbitConn *amqp091.Connection,
	redisClient *redis.Client,
	logger *zap.Logger,
) (OutboxProcessor, error) {
	
	// Validate configuration
	if config.BatchSize <= 0 {
		return nil, fmt.Errorf("batch_size must be positive, got %d", config.BatchSize)
	}
	if config.WorkerCount <= 0 {
		return nil, fmt.Errorf("worker_count must be positive, got %d", config.WorkerCount)
	}
	if config.PollInterval <= 0 {
		return nil, fmt.Errorf("poll_interval must be positive, got %v", config.PollInterval)
	}
	
	logger.Info("Creating outbox processor",
		zap.String("event", "outbox_processor_created"),
		zap.Duration("poll_interval", config.PollInterval),
		zap.Int("batch_size", config.BatchSize),
		zap.Int("worker_count", config.WorkerCount),
		zap.Int("max_retries", config.MaxRetries),
		zap.String("exchange", config.Exchange),
	)
	
	// Create RabbitMQ channel
	rabbitCh, err := rabbitConn.Channel()
	if err != nil {
		logger.Error("Failed to create RabbitMQ channel",
			zap.String("event", "rabbitmq_channel_creation_failed"),
			zap.Error(err),
		)
		return nil, fmt.Errorf("failed to create RabbitMQ channel: %w", err)
	}
	
	// Enable publisher confirms for reliability
	if err := rabbitCh.Confirm(false); err != nil {
		logger.Error("Failed to enable publisher confirms",
			zap.String("event", "publisher_confirms_failed"),
			zap.Error(err),
		)
		rabbitCh.Close()
		return nil, fmt.Errorf("failed to enable publisher confirms: %w", err)
	}
	
	processor := &outboxProcessor{
		config:          config,
		outboxRepo:      outboxRepo,
		rabbitConn:      rabbitConn,
		rabbitCh:        rabbitCh,
		redisClient:     redisClient,
		logger:          logger,
		status:          StatusStopped,
		stopCh:          make(chan struct{}),
		doneCh:          make(chan struct{}),
		processedEvents: make(map[string]time.Time),
		workerPool:      make(chan struct{}, config.WorkerCount),
		metrics: OutboxMetrics{
			ErrorCategories: make(map[string]int),
		},
		circuitBreaker: NewCircuitBreaker(
			config.CircuitBreakerThreshold,
			config.CircuitBreakerTimeout,
			config.CircuitBreakerResetTimeout,
			logger.With(zap.String("component", "circuit_breaker")),
		),
		activeGroups:   make(map[string]chan struct{}),
		groupSemaphore: make(chan struct{}, config.MaxConcurrentGroups),
	}
	
	logger.Info("Outbox processor created successfully",
		zap.String("event", "outbox_processor_ready"),
		zap.String("status", string(processor.status)),
	)
	
	return processor, nil
}

// Start begins the outbox processing with comprehensive logging
func (p *outboxProcessor) Start(ctx context.Context) error {
	p.statusMu.Lock()
	if p.status != StatusStopped {
		p.statusMu.Unlock()
		return fmt.Errorf("processor is already running, current status: %s", p.status)
	}
	p.status = StatusStarting
	p.statusMu.Unlock()
	
	p.logger.Info("Starting outbox processor",
		zap.String("event", "outbox_processor_starting"),
		zap.Duration("poll_interval", p.config.PollInterval),
		zap.Int("batch_size", p.config.BatchSize),
		zap.Int("worker_count", p.config.WorkerCount),
	)
	
	// Initialize worker pool
	for i := 0; i < p.config.WorkerCount; i++ {
		p.workerPool <- struct{}{}
	}
	
	// Start metrics reporting goroutine
	p.wg.Add(1)
	go p.metricsReporter(ctx)
	
	// Start main processing loop
	p.wg.Add(1)
	go p.processingLoop(ctx)
	
	// Start cleanup goroutine for idempotency cache
	p.wg.Add(1)
	go p.cleanupIdempotencyCache(ctx)
	
	p.statusMu.Lock()
	p.status = StatusRunning
	p.statusMu.Unlock()
	
	p.logger.Info("Outbox processor started successfully",
		zap.String("event", "outbox_processor_started"),
		zap.String("status", string(p.status)),
	)
	
	return nil
}

// Stop gracefully shuts down the processor with audit logs
func (p *outboxProcessor) Stop(ctx context.Context) error {
	p.statusMu.Lock()
	if p.status == StatusStopped || p.status == StatusStopping {
		p.statusMu.Unlock()
		return nil
	}
	p.status = StatusStopping
	p.statusMu.Unlock()
	
	p.logger.Info("Stopping outbox processor",
		zap.String("event", "outbox_processor_stopping"),
		zap.Int64("total_processed", p.metrics.TotalProcessed),
		zap.Int64("total_failed", p.metrics.TotalFailed),
	)
	
	// Signal all goroutines to stop
	close(p.stopCh)
	
	// Wait for all goroutines to finish
	done := make(chan struct{})
	go func() {
		p.wg.Wait()
		close(done)
	}()
	
	// Wait for graceful shutdown or timeout
	select {
	case <-done:
		p.logger.Info("All workers stopped gracefully",
			zap.String("event", "workers_stopped_gracefully"),
		)
	case <-ctx.Done():
		p.logger.Warn("Shutdown timeout reached, forcing stop",
			zap.String("event", "shutdown_timeout"),
			zap.Error(ctx.Err()),
		)
	}
	
	// Close RabbitMQ channel
	if p.rabbitCh != nil {
		if err := p.rabbitCh.Close(); err != nil {
			p.logger.Error("Failed to close RabbitMQ channel",
				zap.String("event", "rabbitmq_channel_close_failed"),
				zap.Error(err),
			)
		}
	}
	
	p.statusMu.Lock()
	p.status = StatusStopped
	p.statusMu.Unlock()
	
	finalMetrics := p.GetMetrics()
	p.logger.Info("Outbox processor stopped",
		zap.String("event", "outbox_processor_stopped"),
		zap.String("status", string(p.status)),
		zap.Int64("final_total_processed", finalMetrics.TotalProcessed),
		zap.Int64("final_total_failed", finalMetrics.TotalFailed),
		zap.Int64("final_total_retries", finalMetrics.TotalRetries),
		zap.Int64("final_duplicates_detected", finalMetrics.DuplicatesDetected),
	)
	
	close(p.doneCh)
	return nil
}

// GetMetrics returns current processing metrics
func (p *outboxProcessor) GetMetrics() OutboxMetrics {
	p.metricsMu.RLock()
	defer p.metricsMu.RUnlock()
	
	// Create a copy to avoid race conditions
	metrics := p.metrics
	metrics.ErrorCategories = make(map[string]int)
	for k, v := range p.metrics.ErrorCategories {
		metrics.ErrorCategories[k] = v
	}
	
	return metrics
}

// GetStatus returns current processor status
func (p *outboxProcessor) GetStatus() ProcessorStatus {
	p.statusMu.RLock()
	defer p.statusMu.RUnlock()
	return p.status
}

// Event represents the structure of an outbox event for publishing
type Event struct {
	ID           string                 `json:"id"`
	AggregateID  string                 `json:"aggregate_id"`
	EventType    string                 `json:"event_type"`
	EventData    map[string]interface{} `json:"event_data"`
	CorrelationID string                `json:"correlation_id"`
	CreatedAt    time.Time              `json:"created_at"`
	Version      int                    `json:"version"`
}

// PublishMessage represents a message to be published to RabbitMQ
type PublishMessage struct {
	Exchange    string
	RoutingKey  string
	Body        []byte
	Headers     map[string]interface{}
	MessageID   string
	Timestamp   time.Time
	ContentType string
}

// processingLoop is the main loop that polls for outbox events and processes them
func (p *outboxProcessor) processingLoop(ctx context.Context) {
	defer p.wg.Done()
	
	ticker := time.NewTicker(p.config.PollInterval)
	defer ticker.Stop()
	
	p.logger.Info("Processing loop started",
		zap.String("event", "processing_loop_started"),
		zap.Duration("poll_interval", p.config.PollInterval),
	)
	
	for {
		select {
		case <-ctx.Done():
			p.logger.Info("Processing loop stopped due to context cancellation",
				zap.String("event", "processing_loop_context_cancelled"),
			)
			return
		case <-p.stopCh:
			p.logger.Info("Processing loop stopped due to stop signal",
				zap.String("event", "processing_loop_stopped"),
			)
			return
		case <-ticker.C:
			p.pollAndProcess(ctx)
		}
	}
}

// pollAndProcess polls for pending events and processes them in optimized batches
func (p *outboxProcessor) pollAndProcess(ctx context.Context) {
	start := time.Now()
	
	// Get pending events
	events, err := p.outboxRepo.GetPendingEvents(ctx, p.config.BatchSize)
	if err != nil {
		p.logger.Error("Failed to get pending events",
			zap.String("event", "get_pending_events_failed"),
			zap.Error(err),
		)
		p.incrementErrorMetric("get_pending_events")
		return
	}
	
	if len(events) == 0 {
		p.logger.Debug("No pending events found",
			zap.String("event", "no_pending_events"),
		)
		return
	}
	
	p.logger.Info("Retrieved pending events for processing",
		zap.String("event", "events_retrieved"),
		zap.Int("count", len(events)),
		zap.Duration("fetch_time", time.Since(start)),
	)
	
	// Update metrics
	p.updateMetrics(func(m *OutboxMetrics) {
		m.CurrentBatchSize = len(events)
		m.PendingEvents = int64(len(events))
	})
	
	// Process events in sub-batches for better throughput and control
	batchStart := time.Now()
	processed := 0
	failed := 0
	
	if p.config.EnableOrdering {
		// Group events by ordering key (aggregate ID or custom partition)
		eventGroups := p.groupEventsByOrderingKey(events)
		
		// Update ordering metrics
		p.updateMetrics(func(m *OutboxMetrics) {
			m.OrderingGroupsActive = len(eventGroups)
			if len(eventGroups) > m.MaxOrderingGroups {
				m.MaxOrderingGroups = len(eventGroups)
			}
			if len(eventGroups) > 0 {
				totalEvents := len(events)
				m.AverageGroupSize = float64(totalEvents) / float64(len(eventGroups))
			}
		})
		
		// Process each group maintaining ordering within the group
		groupResults := make(chan GroupProcessingResult, len(eventGroups))
		
		for orderingKey, groupEvents := range eventGroups {
			// Check if we can process this group (limited concurrent groups)
			select {
			case <-p.groupSemaphore:
				go p.processOrderedEventGroup(ctx, orderingKey, groupEvents, groupResults)
			case <-ctx.Done():
				return
			case <-p.stopCh:
				return
			default:
				// Group semaphore full, process synchronously to maintain ordering
				p.logger.Warn("Group semaphore full, processing synchronously",
					zap.String("event", "group_semaphore_full"),
					zap.String("ordering_key", orderingKey),
					zap.Int("group_size", len(groupEvents)),
				)
				result := p.processEventGroupSync(ctx, orderingKey, groupEvents)
				groupResults <- result
			}
		}
		
		// Collect results from all groups
		for i := 0; i < len(eventGroups); i++ {
			select {
			case result := <-groupResults:
				processed += result.Processed
				failed += result.Failed
				if result.Error != nil {
					p.logger.Error("Group processing error",
						zap.String("event", "group_processing_error"),
						zap.String("ordering_key", result.OrderingKey),
						zap.Error(result.Error),
					)
				}
			case <-ctx.Done():
				return
			case <-p.stopCh:
				return
			}
		}
	} else {
		// Process events without ordering guarantees (concurrent processing)
		for _, event := range events {
			select {
			case <-ctx.Done():
				return
			case <-p.stopCh:
				return
			case <-p.workerPool:
				p.wg.Add(1)
				go func(e models.OutboxEvent) {
					defer func() {
						p.workerPool <- struct{}{}
						p.wg.Done()
					}()
					if err := p.processEventSync(ctx, e, 0, 0); err != nil {
						p.logger.Error("Failed to process event",
							zap.String("event", "event_processing_failed_concurrent"),
							zap.String("event_id", e.ID.String()),
							zap.Error(err),
						)
						failed++
					} else {
						processed++
					}
				}(event)
			}
		}
	}
	
	batchDuration := time.Since(batchStart)
	
	// Log batch processing results
	p.logger.Info("Batch processing completed",
		zap.String("event", "batch_processing_completed"),
		zap.Int("total_events", len(events)),
		zap.Int("processed", processed),
		zap.Int("failed", failed),
		zap.Duration("batch_duration", batchDuration),
		zap.Float64("events_per_second", float64(processed)/batchDuration.Seconds()),
		zap.Bool("ordering_enabled", p.config.EnableOrdering),
	)
	
	// Update final metrics
	p.updateMetrics(func(m *OutboxMetrics) {
		m.TotalProcessed += int64(processed)
		m.TotalFailed += int64(failed)
		m.LastProcessedAt = time.Now()
		if failed == 0 {
			m.ConsecutiveFailures = 0
		} else {
			m.ConsecutiveFailures++
		}
	})
}

// groupEventsByOrderingKey groups events by the configured ordering key to maintain ordering guarantees
func (p *outboxProcessor) groupEventsByOrderingKey(events []models.OutboxEvent) map[string][]models.OutboxEvent {
	groups := make(map[string][]models.OutboxEvent)
	
	for _, event := range events {
		var orderingKey string
		switch p.config.OrderingKey {
		case "aggregate_id":
			orderingKey = event.AggregateID.String()
		case "aggregate_type":
			orderingKey = event.AggregateType
		case "event_type":
			orderingKey = event.EventType
		default:
			// Default to aggregate_id for ordering
			orderingKey = event.AggregateID.String()
		}
		
		groups[orderingKey] = append(groups[orderingKey], event)
	}
	
	// Sort events within each group by created_at to maintain temporal ordering
	for _, group := range groups {
		sort.Slice(group, func(i, j int) bool {
			return group[i].CreatedAt.Before(group[j].CreatedAt)
		})
	}
	
	return groups
}

// groupEventsByAggregate groups events by aggregate ID to maintain ordering guarantees
func (p *outboxProcessor) groupEventsByAggregate(events []models.OutboxEvent) map[string][]models.OutboxEvent {
	groups := make(map[string][]models.OutboxEvent)
	
	for _, event := range events {
		aggregateKey := event.AggregateID.String()
		groups[aggregateKey] = append(groups[aggregateKey], event)
	}
	
	// Sort events within each group by created_at to maintain temporal ordering
	for _, group := range groups {
		sort.Slice(group, func(i, j int) bool {
			return group[i].CreatedAt.Before(group[j].CreatedAt)
		})
	}
	
	return groups
}

// processEventGroup processes a group of events from the same aggregate sequentially
// to maintain ordering guarantees within the aggregate
func (p *outboxProcessor) processEventGroup(ctx context.Context, aggregateID string, events []models.OutboxEvent) error {
	groupLogger := p.logger.With(
		zap.String("aggregate_id", aggregateID),
		zap.Int("group_size", len(events)),
	)
	
	groupLogger.Debug("Processing event group",
		zap.String("event", "event_group_processing_started"),
	)
	
	// Process events sequentially to maintain ordering
	for i, event := range events {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-p.stopCh:
			return fmt.Errorf("processor stopped")
		default:
			// Get a worker from the pool
			select {
			case <-p.workerPool:
				// Process the event
				if err := p.processEventSync(ctx, event, i+1, len(events)); err != nil {
					// Return worker to pool
					p.workerPool <- struct{}{}
					
					groupLogger.Error("Failed to process event in group",
						zap.String("event", "event_group_processing_failed"),
						zap.String("event_id", event.ID.String()),
						zap.String("event_type", event.EventType),
						zap.Int("event_index", i+1),
						zap.Error(err),
					)
					return fmt.Errorf("failed to process event %s: %w", event.ID.String(), err)
				}
				
				// Return worker to pool
				p.workerPool <- struct{}{}
			case <-ctx.Done():
				return ctx.Err()
			case <-p.stopCh:
				return fmt.Errorf("processor stopped")
			}
		}
	}
	
	groupLogger.Debug("Event group processing completed",
		zap.String("event", "event_group_processing_completed"),
	)
	
	return nil
}

// processEventSync processes a single event synchronously (blocking)
func (p *outboxProcessor) processEventSync(ctx context.Context, event models.OutboxEvent, eventIndex, totalInGroup int) error {
	start := time.Now()
	correlationID := ""
	if event.CorrelationID != nil {
		correlationID = event.CorrelationID.String()
	} else {
		correlationID = uuid.New().String()
	}
	
	logger := p.logger.With(
		zap.String("event_id", event.ID.String()),
		zap.String("correlation_id", correlationID),
		zap.String("aggregate_id", event.AggregateID.String()),
		zap.String("event_type", event.EventType),
		zap.Int("event_index", eventIndex),
		zap.Int("total_in_group", totalInGroup),
	)
	
	logger.Info("Processing outbox event synchronously",
		zap.String("event", "event_sync_processing_started"),
		zap.Time("created_at", event.CreatedAt),
	)
	
	// Check for idempotency
	if p.isEventProcessed(event.ID.String()) {
		logger.Info("Event already processed, skipping",
			zap.String("event", "event_already_processed"),
		)
		return nil
	}
	
	// Attempt to publish the event with retries
	if err := p.publishEventWithRetry(ctx, event, logger); err != nil {
		logger.Error("Failed to publish event after retries",
			zap.String("event", "event_publishing_failed"),
			zap.Error(err),
		)
		
		// Update failure metrics
		p.updateMetrics(func(m *OutboxMetrics) {
			m.TotalFailed++
			m.ConsecutiveFailures++
			m.LastError = err.Error()
			m.LastErrorAt = time.Now()
		})
		
		return err
	}
	
	// Mark event as processed
	if err := p.outboxRepo.MarkAsProcessed(ctx, event.ID); err != nil {
		logger.Error("Failed to mark event as processed",
			zap.String("event", "mark_processed_failed"),
			zap.Error(err),
		)
		return fmt.Errorf("failed to mark event as processed: %w", err)
	}
	
	// Track processed event for idempotency
	p.markEventProcessed(event.ID.String())
	
	// Update success metrics
	processingDuration := time.Since(start)
	p.updateMetrics(func(m *OutboxMetrics) {
		m.TotalProcessed++
		m.ConsecutiveFailures = 0
		m.LastProcessedAt = time.Now()
		m.AverageProcessingTime = time.Duration((int64(m.AverageProcessingTime)*m.TotalProcessed + int64(processingDuration)) / (m.TotalProcessed + 1))
	})
	
	logger.Info("Event processed successfully",
		zap.String("event", "event_sync_processing_completed"),
		zap.Duration("processing_time", processingDuration),
	)
	
	return nil
}

// processOrderedEventGroup processes a group of events asynchronously with ordering guarantees
func (p *outboxProcessor) processOrderedEventGroup(ctx context.Context, orderingKey string, events []models.OutboxEvent, results chan<- GroupProcessingResult) {
	defer func() {
		// Return semaphore token
		<-p.groupSemaphore
	}()
	
	result := p.processEventGroupSync(ctx, orderingKey, events)
	results <- result
}

// processEventGroupSync processes a group of events synchronously and returns the result
func (p *outboxProcessor) processEventGroupSync(ctx context.Context, orderingKey string, events []models.OutboxEvent) GroupProcessingResult {
	result := GroupProcessingResult{
		OrderingKey: orderingKey,
		Processed:   0,
		Failed:      0,
	}
	
	groupLogger := p.logger.With(
		zap.String("ordering_key", orderingKey),
		zap.Int("group_size", len(events)),
	)
	
	groupLogger.Debug("Processing ordered event group",
		zap.String("event", "ordered_group_processing_started"),
	)
	
	// Track this group as active
	p.activeGroupsMu.Lock()
	groupChan := make(chan struct{})
	p.activeGroups[orderingKey] = groupChan
	p.activeGroupsMu.Unlock()
	
	defer func() {
		// Remove from active groups
		p.activeGroupsMu.Lock()
		delete(p.activeGroups, orderingKey)
		close(groupChan)
		p.activeGroupsMu.Unlock()
	}()
	
	// Process events sequentially to maintain ordering
	for i, event := range events {
		select {
		case <-ctx.Done():
			result.Error = ctx.Err()
			return result
		case <-p.stopCh:
			result.Error = fmt.Errorf("processor stopped")
			return result
		default:
			// Get a worker from the pool
			select {
			case <-p.workerPool:
				// Process the event
				if err := p.processEventSync(ctx, event, i+1, len(events)); err != nil {
					// Return worker to pool
					p.workerPool <- struct{}{}
					
					groupLogger.Error("Failed to process event in ordered group",
						zap.String("event", "ordered_group_event_failed"),
						zap.String("event_id", event.ID.String()),
						zap.String("event_type", event.EventType),
						zap.Int("event_index", i+1),
						zap.Error(err),
					)
					result.Failed++
					
					// For ordered processing, we might want to stop on first error
					// to maintain strict ordering, but here we continue for resilience
					continue
				}
				
				// Return worker to pool
				p.workerPool <- struct{}{}
				result.Processed++
				
			case <-ctx.Done():
				result.Error = ctx.Err()
				return result
			case <-p.stopCh:
				result.Error = fmt.Errorf("processor stopped")
				return result
			}
		}
	}
	
	groupLogger.Debug("Ordered event group processing completed",
		zap.String("event", "ordered_group_processing_completed"),
		zap.Int("processed", result.Processed),
		zap.Int("failed", result.Failed),
	)
	
	return result
}

// processEvent processes a single outbox event
func (p *outboxProcessor) processEvent(ctx context.Context, event models.OutboxEvent) {
	defer func() {
		p.workerPool <- struct{}{}
		p.wg.Done()
	}()
	
	start := time.Now()
	correlationID := ""
	if event.CorrelationID != nil {
		correlationID = event.CorrelationID.String()
	} else {
		correlationID = uuid.New().String()
	}
	
	logger := p.logger.With(
		zap.String("event_id", event.ID.String()),
		zap.String("correlation_id", correlationID),
		zap.String("aggregate_id", event.AggregateID.String()),
		zap.String("event_type", event.EventType),
	)
	
	logger.Info("Processing outbox event",
		zap.String("event", "event_processing_started"),
		zap.Time("created_at", event.CreatedAt),
		zap.Int("retry_count", event.RetryCount),
	)
	
	// Check idempotency
	if p.isAlreadyProcessed(event.ID.String()) {
		logger.Info("Event already processed, skipping",
			zap.String("event", "event_duplicate_detected"),
		)
		p.incrementMetric("duplicates_detected")
		return
	}
	
	// Create publish message
	publishMsg, err := p.createPublishMessage(event)
	if err != nil {
		logger.Error("Failed to create publish message",
			zap.String("event", "create_publish_message_failed"),
			zap.Error(err),
		)
		p.handleEventError(ctx, event, err, "create_message")
		return
	}
	
	// Publish to RabbitMQ with retries
	if err := p.publishWithRetry(ctx, publishMsg, event.RetryCount); err != nil {
		logger.Error("Failed to publish event after retries",
			zap.String("event", "publish_failed_final"),
			zap.Error(err),
			zap.Int("retry_count", event.RetryCount),
		)
		p.handleEventError(ctx, event, err, "publish")
		return
	}
	
	// Mark as processed
	if err := p.outboxRepo.MarkAsProcessed(ctx, event.ID); err != nil {
		logger.Error("Failed to mark event as processed",
			zap.String("event", "mark_processed_failed"),
			zap.Error(err),
		)
		// This is critical - the event was published but not marked as processed
		// Log for manual intervention
		p.incrementErrorMetric("mark_processed")
		return
	}
	
	// Track as processed in local cache
	p.markAsProcessed(event.ID.String())
	
	processingTime := time.Since(start)
	
	logger.Info("Event processed successfully",
		zap.String("event", "event_processed_successfully"),
		zap.Duration("processing_time", processingTime),
	)
	
	// Update metrics
	p.updateMetrics(func(m *OutboxMetrics) {
		m.TotalProcessed++
		m.LastProcessedAt = time.Now()
		m.LastProcessingTime = processingTime
		
		// Update average processing time
		if m.TotalProcessed == 1 {
			m.AverageProcessingTime = processingTime
		} else {
			m.AverageProcessingTime = time.Duration(
				(int64(m.AverageProcessingTime)*m.TotalProcessed + int64(processingTime)) / (m.TotalProcessed + 1),
			)
		}
		
		// Reset consecutive failures on success
		m.ConsecutiveFailures = 0
	})
}

// createPublishMessage creates a RabbitMQ publish message from an outbox event
func (p *outboxProcessor) createPublishMessage(event models.OutboxEvent) (*PublishMessage, error) {
	// Parse event data
	var eventData map[string]interface{}
	if err := json.Unmarshal([]byte(event.EventData), &eventData); err != nil {
		return nil, fmt.Errorf("failed to unmarshal event data: %w", err)
	}
	
	// Create correlation ID string
	correlationID := ""
	if event.CorrelationID != nil {
		correlationID = event.CorrelationID.String()
	}
	
	// Create event structure
	eventPayload := Event{
		ID:            event.ID.String(),
		AggregateID:   event.AggregateID.String(),
		EventType:     event.EventType,
		EventData:     eventData,
		CorrelationID: correlationID,
		CreatedAt:     event.CreatedAt,
		Version:       event.EventVersion,
	}
	
	// Marshal to JSON
	body, err := json.Marshal(eventPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal event payload: %w", err)
	}
	
	// Create routing key
	routingKey := fmt.Sprintf("%s.%s", p.config.RoutingKeyPrefix, event.EventType)
	
	// Create headers
	headers := map[string]interface{}{
		"event_id":       event.ID.String(),
		"aggregate_id":   event.AggregateID.String(),
		"event_type":     event.EventType,
		"correlation_id": correlationID,
		"retry_count":    event.RetryCount,
		"created_at":     event.CreatedAt.Unix(),
		"version":        event.EventVersion,
	}
	
	return &PublishMessage{
		Exchange:    p.config.Exchange,
		RoutingKey:  routingKey,
		Body:        body,
		Headers:     headers,
		MessageID:   event.ID.String(),
		Timestamp:   time.Now(),
		ContentType: "application/json",
	}, nil
}

// publishWithRetry publishes a message to RabbitMQ with exponential backoff retry
func (p *outboxProcessor) publishWithRetry(ctx context.Context, msg *PublishMessage, currentRetry int) error {
	for attempt := 0; attempt <= p.config.MaxRetries; attempt++ {
		if attempt > 0 {
			// Calculate exponential backoff delay
			delay := p.calculateRetryDelay(attempt)
			
			p.logger.Info("Retrying publish after delay",
				zap.String("event", "publish_retry_attempt"),
				zap.String("message_id", msg.MessageID),
				zap.Int("attempt", attempt),
				zap.Duration("delay", delay),
			)
			
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-p.stopCh:
				return fmt.Errorf("processor stopping")
			case <-time.After(delay):
			}
		}
		
		err := p.publishMessage(ctx, msg)
		if err == nil {
			if attempt > 0 {
				p.logger.Info("Publish succeeded after retry",
					zap.String("event", "publish_retry_success"),
					zap.String("message_id", msg.MessageID),
					zap.Int("attempt", attempt),
				)
				p.incrementMetric("total_retries")
			}
			return nil
		}
		
		p.logger.Warn("Publish attempt failed",
			zap.String("event", "publish_attempt_failed"),
			zap.String("message_id", msg.MessageID),
			zap.Int("attempt", attempt),
			zap.Error(err),
		)
		
		// Don't retry on certain errors
		if isNonRetryableError(err) {
			p.logger.Error("Non-retryable error encountered",
				zap.String("event", "non_retryable_error"),
				zap.String("message_id", msg.MessageID),
				zap.Error(err),
			)
			return err
		}
	}
	
	return fmt.Errorf("publish failed after %d attempts", p.config.MaxRetries+1)
}

// publishMessage publishes a single message to RabbitMQ
func (p *outboxProcessor) publishMessage(ctx context.Context, msg *PublishMessage) error {
	// Create publishing context with timeout
	publishCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	
	// Publish with publisher confirms
	err := p.rabbitCh.PublishWithContext(
		publishCtx,
		msg.Exchange,
		msg.RoutingKey,
		false, // mandatory
		false, // immediate
		amqp091.Publishing{
			MessageId:   msg.MessageID,
			Timestamp:   msg.Timestamp,
			ContentType: msg.ContentType,
			Headers:     msg.Headers,
			Body:        msg.Body,
		},
	)
	
	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}
	
	// Wait for publisher confirm
	confirmed := p.rabbitCh.NotifyPublish(make(chan amqp091.Confirmation, 1))
	select {
	case confirm := <-confirmed:
		if !confirm.Ack {
			return fmt.Errorf("message not acknowledged by broker")
		}
	case <-publishCtx.Done():
		return fmt.Errorf("publish confirmation timeout: %w", publishCtx.Err())
	}
	
	return nil
}

// calculateRetryDelay calculates exponential backoff delay
func (p *outboxProcessor) calculateRetryDelay(attempt int) time.Duration {
	delay := float64(p.config.BaseRetryDelay) * math.Pow(p.config.RetryMultiplier, float64(attempt-1))
	
	if delay > float64(p.config.MaxRetryDelay) {
		delay = float64(p.config.MaxRetryDelay)
	}
	
	return time.Duration(delay)
}

// isNonRetryableError determines if an error should not be retried
func isNonRetryableError(err error) bool {
	// Add logic to identify non-retryable errors
	// For example: invalid exchange, routing key issues, etc.
	return false
}

// handleEventError handles errors during event processing
func (p *outboxProcessor) handleEventError(ctx context.Context, event models.OutboxEvent, err error, errorType string) {
	logger := p.logger.With(
		zap.String("event_id", event.ID.String()),
		zap.String("error_type", errorType),
		zap.Error(err),
	)
	
	// Check if we should retry
	if event.RetryCount < event.MaxRetries {
		nextRetryAt := time.Now().Add(p.calculateRetryDelay(event.RetryCount + 1))
		
		if updateErr := p.outboxRepo.IncrementRetryCount(ctx, event.ID, nextRetryAt); updateErr != nil {
			logger.Error("Failed to increment retry count",
				zap.String("event", "increment_retry_failed"),
				zap.Error(updateErr),
			)
		} else {
			logger.Info("Event scheduled for retry",
				zap.String("event", "event_retry_scheduled"),
				zap.Int("retry_count", event.RetryCount+1),
				zap.Time("next_retry_at", nextRetryAt),
			)
		}
	} else {
		// Max retries exceeded, mark as failed
		if failErr := p.outboxRepo.MarkAsFailed(ctx, event.ID, err.Error()); failErr != nil {
			logger.Error("Failed to mark event as failed",
				zap.String("event", "mark_failed_error"),
				zap.Error(failErr),
			)
		} else {
			logger.Error("Event marked as failed after max retries",
				zap.String("event", "event_failed_max_retries"),
				zap.Int("max_retries", event.MaxRetries),
			)
		}
	}
	
	// Update error metrics
	p.incrementErrorMetric(errorType)
	p.updateMetrics(func(m *OutboxMetrics) {
		m.TotalFailed++
		m.ConsecutiveFailures++
		m.LastError = err.Error()
		m.LastErrorAt = time.Now()
	})
}

// metricsReporter periodically reports metrics
func (p *outboxProcessor) metricsReporter(ctx context.Context) {
	defer p.wg.Done()
	
	ticker := time.NewTicker(p.config.MetricsInterval)
	defer ticker.Stop()
	
	// Performance insights ticker (less frequent)
	insightsTicker := time.NewTicker(p.config.MetricsInterval * 3) // 3x less frequent
	defer insightsTicker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.reportMetrics()
		case <-insightsTicker.C:
			p.logPerformanceInsights()
		}
	}
}

// reportMetrics logs comprehensive current metrics with detailed breakdown
func (p *outboxProcessor) reportMetrics() {
	metrics := p.GetMetrics()
	status := p.GetStatus()
	
	// Calculate derived metrics
	successRate := float64(0)
	if metrics.TotalProcessed+metrics.TotalFailed > 0 {
		successRate = float64(metrics.TotalProcessed) / float64(metrics.TotalProcessed+metrics.TotalFailed) * 100
	}
	
	retryRate := float64(0)
	if metrics.TotalProcessed > 0 {
		retryRate = float64(metrics.TotalRetries) / float64(metrics.TotalProcessed)
	}
	
	// Get circuit breaker state
	circuitState := string(p.circuitBreaker.GetState())
	
	// Count active ordering groups
	p.activeGroupsMu.RLock()
	activeGroupsCount := len(p.activeGroups)
	p.activeGroupsMu.RUnlock()
	
	// Core metrics
	p.logger.Info("Outbox processor comprehensive metrics",
		zap.String("event", "comprehensive_metrics_report"),
		
		// Processor status
		zap.String("processor_status", string(status)),
		zap.String("circuit_breaker_state", circuitState),
		
		// Processing metrics
		zap.Int64("total_processed", metrics.TotalProcessed),
		zap.Int64("total_failed", metrics.TotalFailed),
		zap.Int64("total_retries", metrics.TotalRetries),
		zap.Float64("success_rate_percent", successRate),
		zap.Float64("retry_rate", retryRate),
		
		// Performance metrics
		zap.Int("current_batch_size", metrics.CurrentBatchSize),
		zap.Duration("average_processing_time", metrics.AverageProcessingTime),
		zap.Duration("last_processing_time", metrics.LastProcessingTime),
		
		// Queue metrics
		zap.Int64("pending_events", metrics.PendingEvents),
		zap.Time("oldest_pending_event", metrics.OldestPendingEvent),
		
		// Error tracking
		zap.Int("consecutive_failures", metrics.ConsecutiveFailures),
		zap.String("last_error", metrics.LastError),
		zap.Time("last_error_at", metrics.LastErrorAt),
		
		// Idempotency metrics
		zap.Int64("duplicates_detected", metrics.DuplicatesDetected),
		zap.Float64("idempotency_hit_rate", metrics.IdempotencyHitRate),
		
		// Dead Letter Queue metrics
		zap.Int64("dlq_messages_sent", metrics.DLQMessagesSent),
		zap.Int64("dlq_errors", metrics.DLQErrors),
		zap.Time("last_dlq_sent_at", metrics.LastDLQSentAt),
		
		// Message ordering metrics
		zap.Int("ordering_groups_active", activeGroupsCount),
		zap.Int("max_ordering_groups", metrics.MaxOrderingGroups),
		zap.Int64("ordering_violations", metrics.OrderingViolations),
		zap.Float64("average_group_size", metrics.AverageGroupSize),
		zap.Bool("ordering_enabled", p.config.EnableOrdering),
	)
	
	// Log error categories breakdown if there are errors
	if len(metrics.ErrorCategories) > 0 {
		errorFields := make([]zap.Field, 0, len(metrics.ErrorCategories)+1)
		errorFields = append(errorFields, zap.String("event", "error_categories_breakdown"))
		
		for category, count := range metrics.ErrorCategories {
			errorFields = append(errorFields, zap.Int(fmt.Sprintf("error_%s", category), count))
		}
		
		p.logger.Info("Error categories breakdown", errorFields...)
	}
	
	// Log performance insights
	if metrics.TotalProcessed > 0 {
		avgEventsPerSecond := float64(metrics.TotalProcessed) / time.Since(metrics.LastProcessedAt).Seconds()
		
		p.logger.Info("Performance insights",
			zap.String("event", "performance_insights"),
			zap.Float64("avg_events_per_second", avgEventsPerSecond),
			zap.Duration("uptime", time.Since(metrics.LastProcessedAt)),
			zap.Int64("total_throughput", metrics.TotalProcessed),
		)
	}
	
	// Log warnings for concerning metrics
	if metrics.ConsecutiveFailures > 3 {
		p.logger.Warn("High consecutive failures detected",
			zap.String("event", "high_consecutive_failures_warning"),
			zap.Int("consecutive_failures", metrics.ConsecutiveFailures),
			zap.String("last_error", metrics.LastError),
		)
	}
	
	if metrics.PendingEvents > int64(p.config.BatchSize*5) {
		p.logger.Warn("High number of pending events",
			zap.String("event", "high_pending_events_warning"),
			zap.Int64("pending_events", metrics.PendingEvents),
			zap.Int("batch_size", p.config.BatchSize),
		)
	}
	
	if successRate < 90.0 && metrics.TotalProcessed+metrics.TotalFailed > 10 {
		p.logger.Warn("Low success rate detected",
			zap.String("event", "low_success_rate_warning"),
			zap.Float64("success_rate_percent", successRate),
			zap.Int64("total_processed", metrics.TotalProcessed),
			zap.Int64("total_failed", metrics.TotalFailed),
		)
	}
}

// calculatePerformanceMetrics calculates detailed performance metrics
func (p *outboxProcessor) calculatePerformanceMetrics() map[string]interface{} {
	metrics := p.GetMetrics()
	
	performanceMetrics := make(map[string]interface{})
	
	// Calculate rates and ratios
	if metrics.TotalProcessed+metrics.TotalFailed > 0 {
		performanceMetrics["success_rate"] = float64(metrics.TotalProcessed) / float64(metrics.TotalProcessed+metrics.TotalFailed)
		performanceMetrics["failure_rate"] = float64(metrics.TotalFailed) / float64(metrics.TotalProcessed+metrics.TotalFailed)
	}
	
	if metrics.TotalProcessed > 0 {
		performanceMetrics["retry_ratio"] = float64(metrics.TotalRetries) / float64(metrics.TotalProcessed)
	}
	
	if metrics.DuplicatesDetected > 0 && metrics.TotalProcessed > 0 {
		performanceMetrics["duplicate_ratio"] = float64(metrics.DuplicatesDetected) / float64(metrics.TotalProcessed)
	}
	
	// Calculate processing efficiency
	if metrics.AverageProcessingTime > 0 {
		performanceMetrics["processing_efficiency"] = 1.0 / metrics.AverageProcessingTime.Seconds()
	}
	
	// Circuit breaker health
	performanceMetrics["circuit_breaker_state"] = string(p.circuitBreaker.GetState())
	
	// Queue health
	if p.config.BatchSize > 0 {
		performanceMetrics["queue_utilization"] = float64(metrics.PendingEvents) / float64(p.config.BatchSize)
	}
	
	// Ordering efficiency
	if p.config.EnableOrdering {
		p.activeGroupsMu.RLock()
		activeGroups := len(p.activeGroups)
		p.activeGroupsMu.RUnlock()
		
		performanceMetrics["ordering_concurrency"] = float64(activeGroups) / float64(p.config.MaxConcurrentGroups)
		if metrics.TotalProcessed > 0 {
			performanceMetrics["ordering_violation_rate"] = float64(metrics.OrderingViolations) / float64(metrics.TotalProcessed)
		}
	}
	
	// DLQ health
	if p.config.EnableDLQ && metrics.TotalFailed > 0 {
		performanceMetrics["dlq_delivery_rate"] = float64(metrics.DLQMessagesSent) / float64(metrics.TotalFailed)
	}
	
	return performanceMetrics
}

// logPerformanceInsights logs detailed performance insights and recommendations
func (p *outboxProcessor) logPerformanceInsights() {
	perfMetrics := p.calculatePerformanceMetrics()
	
	insights := []string{}
	
	// Check success rate
	if successRate, ok := perfMetrics["success_rate"].(float64); ok {
		if successRate < 0.9 {
			insights = append(insights, fmt.Sprintf("Low success rate: %.2f%%. Consider reviewing error patterns.", successRate*100))
		}
	}
	
	// Check retry ratio
	if retryRatio, ok := perfMetrics["retry_ratio"].(float64); ok {
		if retryRatio > 2.0 {
			insights = append(insights, fmt.Sprintf("High retry ratio: %.2f. Consider investigating underlying issues.", retryRatio))
		}
	}
	
	// Check queue utilization
	if queueUtil, ok := perfMetrics["queue_utilization"].(float64); ok {
		if queueUtil > 5.0 {
			insights = append(insights, fmt.Sprintf("High queue utilization: %.2fx batch size. Consider increasing worker count or batch size.", queueUtil))
		}
	}
	
	// Check ordering efficiency
	if orderingConc, ok := perfMetrics["ordering_concurrency"].(float64); ok {
		if orderingConc > 0.8 {
			insights = append(insights, fmt.Sprintf("High ordering concurrency: %.2f%%. Consider increasing max concurrent groups.", orderingConc*100))
		}
	}
	
	if len(insights) > 0 {
		p.logger.Info("Performance insights and recommendations",
			zap.String("event", "performance_insights"),
			zap.Strings("recommendations", insights),
			zap.Any("performance_metrics", perfMetrics),
		)
	}
}

// cleanupIdempotencyCache periodically cleans up old entries from idempotency cache
func (p *outboxProcessor) cleanupIdempotencyCache(ctx context.Context) {
	defer p.wg.Done()
	
	ticker := time.NewTicker(time.Hour) // Cleanup every hour
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return
		case <-p.stopCh:
			return
		case <-ticker.C:
			p.cleanupProcessedEvents()
		}
	}
}

// cleanupProcessedEvents removes old entries from the processed events cache
func (p *outboxProcessor) cleanupProcessedEvents() {
	p.processedMu.Lock()
	defer p.processedMu.Unlock()
	
	cutoff := time.Now().Add(-p.config.IdempotencyTTL)
	cleaned := 0
	
	for eventID, processedAt := range p.processedEvents {
		if processedAt.Before(cutoff) {
			delete(p.processedEvents, eventID)
			cleaned++
		}
	}
	
	if cleaned > 0 {
		p.logger.Info("Cleaned up idempotency cache",
			zap.String("event", "idempotency_cache_cleanup"),
			zap.Int("cleaned_entries", cleaned),
			zap.Int("remaining_entries", len(p.processedEvents)),
		)
	}
}

// isAlreadyProcessed checks if an event has already been processed
func (p *outboxProcessor) isAlreadyProcessed(eventID string) bool {
	p.processedMu.RLock()
	defer p.processedMu.RUnlock()
	
	_, exists := p.processedEvents[eventID]
	return exists
}

// markAsProcessed marks an event as processed in the local cache
func (p *outboxProcessor) markAsProcessed(eventID string) {
	p.processedMu.Lock()
	defer p.processedMu.Unlock()
	
	p.processedEvents[eventID] = time.Now()
}

// incrementMetric safely increments a metric counter
func (p *outboxProcessor) incrementMetric(metric string) {
	p.updateMetrics(func(m *OutboxMetrics) {
		switch metric {
		case "duplicates_detected":
			m.DuplicatesDetected++
		case "total_retries":
			m.TotalRetries++
		case "dlq_messages_sent":
			m.DLQMessagesSent++
		case "dlq_errors":
			m.DLQErrors++
		case "ordering_violations":
			m.OrderingViolations++
		}
	})
}

// incrementErrorMetric safely increments an error metric
func (p *outboxProcessor) incrementErrorMetric(errorType string) {
	p.updateMetrics(func(m *OutboxMetrics) {
		if m.ErrorCategories == nil {
			m.ErrorCategories = make(map[string]int)
		}
		m.ErrorCategories[errorType]++
	})
}

// updateMetrics safely updates metrics using a callback function
func (p *outboxProcessor) updateMetrics(updateFunc func(*OutboxMetrics)) {
	p.metricsMu.Lock()
	defer p.metricsMu.Unlock()
	updateFunc(&p.metrics)
}

// isEventProcessed checks if an event has already been processed (idempotency check)
func (p *outboxProcessor) isEventProcessed(eventID string) bool {
	p.processedMu.RLock()
	defer p.processedMu.RUnlock()
	
	_, exists := p.processedEvents[eventID]
	return exists
}

// markEventProcessed marks an event as processed for idempotency tracking
func (p *outboxProcessor) markEventProcessed(eventID string) {
	p.processedMu.Lock()
	defer p.processedMu.Unlock()
	
	p.processedEvents[eventID] = time.Now()
}

// publishEventWithRetry publishes an event to RabbitMQ with retry logic, exponential backoff, and circuit breaker
func (p *outboxProcessor) publishEventWithRetry(ctx context.Context, event models.OutboxEvent, logger *zap.Logger) error {
	// Check circuit breaker before attempting
	if !p.circuitBreaker.CanExecute() {
		// Try to transition to half-open if it's time
		if p.circuitBreaker.TryHalfOpen() {
			logger.Info("Circuit breaker transitioned to half-open, attempting execution",
				zap.String("event", "circuit_breaker_half_open_attempt"),
			)
		} else {
			logger.Warn("Circuit breaker is open, skipping publish attempt",
				zap.String("event", "circuit_breaker_blocked_execution"),
				zap.String("circuit_state", string(p.circuitBreaker.GetState())),
			)
			return fmt.Errorf("circuit breaker is open, cannot execute")
		}
	}
	
	var lastErr error
	
	for attempt := 0; attempt <= p.config.MaxRetries; attempt++ {
		if attempt > 0 {
			// Calculate exponential backoff with jitter
			backoffDuration := p.calculateBackoffWithJitter(attempt)
			logger.Info("Retrying event publication",
				zap.String("event", "event_publication_retry"),
				zap.Int("attempt", attempt),
				zap.Int("max_retries", p.config.MaxRetries),
				zap.Duration("backoff", backoffDuration),
				zap.String("circuit_state", string(p.circuitBreaker.GetState())),
			)
			
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoffDuration):
				// Continue with retry
			}
		}
		
		// Attempt to publish the event
		if err := p.publishEvent(ctx, event, logger); err != nil {
			lastErr = err
			logger.Warn("Event publication attempt failed",
				zap.String("event", "event_publication_attempt_failed"),
				zap.Int("attempt", attempt),
				zap.Error(err),
			)
			
			// Record failure in circuit breaker
			p.circuitBreaker.RecordFailure()
			
			// Update retry metrics
			p.incrementMetric("total_retries")
			continue
		}
		
		// Success - record in circuit breaker
		p.circuitBreaker.RecordSuccess()
		
		if attempt > 0 {
			logger.Info("Event published successfully after retries",
				zap.String("event", "event_published_after_retries"),
				zap.Int("attempts", attempt+1),
				zap.String("circuit_state", string(p.circuitBreaker.GetState())),
			)
		}
		return nil
	}
	
	// All retries exhausted - record final failure
	p.circuitBreaker.RecordFailure()
	
	logger.Error("All retry attempts exhausted, sending to DLQ",
		zap.String("event", "all_retries_exhausted"),
		zap.Int("max_retries", p.config.MaxRetries),
		zap.String("circuit_state", string(p.circuitBreaker.GetState())),
		zap.Error(lastErr),
	)
	
	// Attempt to send to DLQ
	if dlqErr := p.sendToDLQ(ctx, event, lastErr, logger); dlqErr != nil {
		logger.Error("Failed to send event to DLQ",
			zap.String("event", "dlq_send_failed"),
			zap.Error(dlqErr),
		)
		// Return original error, not DLQ error
		return fmt.Errorf("failed to publish event after %d attempts and failed to send to DLQ: %w (DLQ error: %v)", p.config.MaxRetries, lastErr, dlqErr)
	}
	
	// Event was sent to DLQ successfully, consider this a handled failure
	logger.Info("Event sent to DLQ successfully after exhausting retries",
		zap.String("event", "dlq_delivery_successful"),
		zap.String("event_id", event.ID.String()),
	)
	
	return fmt.Errorf("failed to publish event after %d attempts (sent to DLQ): %w", p.config.MaxRetries, lastErr)
}

// publishEvent publishes a single event to RabbitMQ
func (p *outboxProcessor) publishEvent(ctx context.Context, event models.OutboxEvent, logger *zap.Logger) error {
	// Create message body
	message := amqp091.Publishing{
		ContentType:   "application/json",
		DeliveryMode:  amqp091.Persistent, // Make message persistent
		MessageId:     event.ID.String(),
		Timestamp:     time.Now(),
		Body:          []byte(event.EventData),
	}
	
	// Add correlation ID if available
	if event.CorrelationID != nil {
		message.CorrelationId = event.CorrelationID.String()
	}
	
	// Add headers with metadata
	message.Headers = amqp091.Table{
		"event_type":    event.EventType,
		"aggregate_id":  event.AggregateID.String(),
		"created_at":    event.CreatedAt.Format(time.RFC3339),
		"retry_count":   event.RetryCount,
		"event_version": event.EventVersion,
	}
	
	// Determine routing key
	routingKey := p.getRoutingKey(event)
	
	logger.Debug("Publishing event to RabbitMQ",
		zap.String("event", "rabbitmq_publish_attempt"),
		zap.String("exchange", p.config.Exchange),
		zap.String("routing_key", routingKey),
		zap.Int("payload_size", len(event.EventData)),
	)
	
	// Publish with confirmation
	if err := p.rabbitCh.PublishWithContext(
		ctx,
		p.config.Exchange, // exchange
		routingKey,        // routing key
		false,             // mandatory
		false,             // immediate
		message,           // message
	); err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}
	
	logger.Info("Event published to RabbitMQ successfully",
		zap.String("event", "rabbitmq_publish_success"),
		zap.String("exchange", p.config.Exchange),
		zap.String("routing_key", routingKey),
	)
	
	return nil
}

// calculateBackoffWithJitter calculates exponential backoff duration with jitter
func (p *outboxProcessor) calculateBackoffWithJitter(attempt int) time.Duration {
	// Exponential backoff: base * multiplier^attempt with jitter
	baseDelay := float64(p.config.BaseRetryDelay)
	exponentialDelay := baseDelay * math.Pow(p.config.RetryMultiplier, float64(attempt-1))
	
	// Add jitter (±25% randomization) to prevent thundering herd
	jitter := 0.25
	jitterRange := exponentialDelay * jitter
	// Simple pseudo-random jitter based on time
	jitterOffset := (float64(time.Now().UnixNano()%1000)/1000.0*2.0-1.0) * jitterRange
	
	finalDelay := exponentialDelay + jitterOffset
	
	// Cap the maximum delay
	maxDelay := float64(p.config.MaxRetryDelay)
	if finalDelay > maxDelay {
		finalDelay = maxDelay
	}
	
	// Ensure minimum delay
	if finalDelay < baseDelay {
		finalDelay = baseDelay
	}
	
	return time.Duration(finalDelay)
}

// getRoutingKey determines the routing key for an event
func (p *outboxProcessor) getRoutingKey(event models.OutboxEvent) string {
	// Use event type as routing key for flexible routing
	// This allows subscribers to filter by event types
	return fmt.Sprintf("events.%s", event.EventType)
}

// sendToDLQ sends a failed event to the Dead Letter Queue with comprehensive logging
func (p *outboxProcessor) sendToDLQ(ctx context.Context, event models.OutboxEvent, originalError error, logger *zap.Logger) error {
	if !p.config.EnableDLQ {
		logger.Info("DLQ is disabled, skipping DLQ delivery",
			zap.String("event", "dlq_disabled"),
			zap.String("event_id", event.ID.String()),
		)
		return nil
	}
	
	dlqLogger := logger.With(
		zap.String("dlq_exchange", p.config.DLQExchange),
		zap.String("dlq_routing_key", p.config.DLQRoutingKey),
		zap.String("component", "dlq"),
	)
	
	dlqLogger.Info("Sending event to Dead Letter Queue",
		zap.String("event", "dlq_send_started"),
		zap.String("event_id", event.ID.String()),
		zap.String("event_type", event.EventType),
		zap.Int("retry_count", event.RetryCount),
		zap.String("original_error", originalError.Error()),
	)
	
	// Create DLQ message with metadata about the failure
	dlqMessage := map[string]interface{}{
		"original_event": map[string]interface{}{
			"id":            event.ID.String(),
			"aggregate_type": event.AggregateType,
			"aggregate_id":  event.AggregateID.String(),
			"event_type":    event.EventType,
			"event_data":    json.RawMessage(event.EventData),
			"event_version": event.EventVersion,
			"correlation_id": nil,
			"causation_id":  nil,
			"created_at":    event.CreatedAt.Format(time.RFC3339),
			"retry_count":   event.RetryCount,
			"max_retries":   event.MaxRetries,
		},
		"failure_info": map[string]interface{}{
			"original_error":    originalError.Error(),
			"failed_at":         time.Now().Format(time.RFC3339),
			"processor_version": "1.0",
			"max_retries_reached": true,
		},
		"dlq_metadata": map[string]interface{}{
			"sent_at":           time.Now().Format(time.RFC3339),
			"dlq_routing_key":   p.config.DLQRoutingKey,
			"original_exchange": p.config.Exchange,
			"circuit_breaker_state": string(p.circuitBreaker.GetState()),
		},
	}
	
	// Add correlation and causation IDs if available
	if event.CorrelationID != nil {
		dlqMessage["original_event"].(map[string]interface{})["correlation_id"] = event.CorrelationID.String()
	}
	if event.CausationID != nil {
		dlqMessage["original_event"].(map[string]interface{})["causation_id"] = event.CausationID.String()
	}
	
	// Marshal DLQ message
	dlqPayload, err := json.Marshal(dlqMessage)
	if err != nil {
		dlqLogger.Error("Failed to marshal DLQ message",
			zap.String("event", "dlq_marshal_failed"),
			zap.Error(err),
		)
		p.updateMetrics(func(m *OutboxMetrics) {
			m.DLQErrors++
		})
		return fmt.Errorf("failed to marshal DLQ message: %w", err)
	}
	
	// Create AMQP message for DLQ
	dlqAMQPMessage := amqp091.Publishing{
		ContentType:   "application/json",
		DeliveryMode:  amqp091.Persistent,
		MessageId:     uuid.New().String(),
		Timestamp:     time.Now(),
		Body:          dlqPayload,
		Headers: amqp091.Table{
			"original_event_id":   event.ID.String(),
			"original_event_type": event.EventType,
			"failure_reason":      originalError.Error(),
			"failed_at":           time.Now().Format(time.RFC3339),
			"retry_count":         event.RetryCount,
			"max_retries":         event.MaxRetries,
			"dlq_version":         "1.0",
		},
	}
	
	// Add correlation ID to message if available
	if event.CorrelationID != nil {
		dlqAMQPMessage.CorrelationId = event.CorrelationID.String()
	}
	
	// Publish to DLQ with timeout
	publishCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	
	if err := p.rabbitCh.PublishWithContext(
		publishCtx,
		p.config.DLQExchange,
		p.config.DLQRoutingKey,
		false, // mandatory
		false, // immediate
		dlqAMQPMessage,
	); err != nil {
		dlqLogger.Error("Failed to publish message to DLQ",
			zap.String("event", "dlq_publish_failed"),
			zap.Error(err),
		)
		p.updateMetrics(func(m *OutboxMetrics) {
			m.DLQErrors++
		})
		return fmt.Errorf("failed to publish to DLQ: %w", err)
	}
	
	// Update DLQ metrics
	p.updateMetrics(func(m *OutboxMetrics) {
		m.DLQMessagesSent++
		m.LastDLQSentAt = time.Now()
	})
	
	dlqLogger.Info("Event successfully sent to Dead Letter Queue",
		zap.String("event", "dlq_send_completed"),
		zap.String("dlq_message_id", dlqAMQPMessage.MessageId),
		zap.Int("dlq_payload_size", len(dlqPayload)),
	)
	
	return nil
}