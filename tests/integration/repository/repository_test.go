package repository

import (
	"context"
	"fmt"
	"log"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/username/order-processor/internal/domain"
	"github.com/username/order-processor/internal/repository"
	"github.com/username/order-processor/internal/repository/models"
	repoPostgres "github.com/username/order-processor/internal/repository/postgres"
)

// RepositoryTestSuite contains integration tests for repository implementations
type RepositoryTestSuite struct {
	suite.Suite
	db              *gorm.DB
	orderRepo       repository.OrderRepository
	outboxRepo      repository.OutboxRepository
	txManager       repository.TransactionManager
	testContainerID string
}

// SetupSuite sets up the test database and repositories
func (suite *RepositoryTestSuite) SetupSuite() {
	// Try to connect to a test database
	// In a real setup, you might use testcontainers or a dedicated test database
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=postgres dbname=order_processor_test port=5432 sslmode=disable"
	}

	var err error
	suite.db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.New(
			log.New(os.Stdout, "\r\n", log.LstdFlags),
			logger.Config{
				SlowThreshold: time.Second,
				LogLevel:      logger.Info,
				Colorful:      true,
			},
		),
	})
	
	if err != nil {
		suite.T().Skip("Database not available for integration tests")
		return
	}

	// Auto-migrate the schema
	err = suite.db.AutoMigrate(
		&models.OrderModel{},
		&models.OrderItemModel{},
		&models.OutboxEventModel{},
		&models.IdempotencyKeyModel{},
	)
	require.NoError(suite.T(), err, "Failed to migrate database schema")

	// Initialize repositories
	suite.txManager = repoPostgres.NewTransactionManager(suite.db)
	
	orderRepoImpl := repoPostgres.NewOrderRepository(suite.db)
	suite.orderRepo = orderRepoImpl
	
	suite.outboxRepo = repoPostgres.NewOutboxRepository(suite.db, orderRepoImpl)
}

// TearDownSuite cleans up after all tests
func (suite *RepositoryTestSuite) TearDownSuite() {
	if suite.db != nil {
		// Clean up test data using helper function
		if err := QuickCleanTestDatabase(suite.db); err != nil {
			suite.T().Logf("Warning: Failed to clean test database: %v", err)
		}
		
		// Close database connection
		sqlDB, _ := suite.db.DB()
		if sqlDB != nil {
			sqlDB.Close()
		}
	}
}

// SetupTest prepares for each test
func (suite *RepositoryTestSuite) SetupTest() {
	// Clean tables before each test using helper function
	if err := QuickCleanTestDatabase(suite.db); err != nil {
		suite.T().Fatalf("Failed to clean test database: %v", err)
	}
}

// TestOrderRepository_Create tests order creation
func (suite *RepositoryTestSuite) TestOrderRepository_Create() {
	ctx := context.Background()
	
	// Create test order
	order := suite.createTestOrder()
	
	// Test creation
	err := suite.orderRepo.Create(ctx, order)
	require.NoError(suite.T(), err)
	
	// Verify the order was created
	retrieved, err := suite.orderRepo.FindByID(ctx, order.ID())
	require.NoError(suite.T(), err)
	
	assert.Equal(suite.T(), order.ID(), retrieved.ID())
	assert.Equal(suite.T(), order.CustomerID(), retrieved.CustomerID())
	assert.Equal(suite.T(), order.CustomerEmail().Value(), retrieved.CustomerEmail().Value())
	assert.Equal(suite.T(), len(order.Items()), len(retrieved.Items()))
	assert.True(suite.T(), order.TotalAmount().Equals(*retrieved.TotalAmount()))
}

// TestOrderRepository_FindByID tests finding orders by ID
func (suite *RepositoryTestSuite) TestOrderRepository_FindByID() {
	ctx := context.Background()
	
	// Test finding non-existent order
	_, err := suite.orderRepo.FindByID(ctx, uuid.New())
	assert.Error(suite.T(), err)
	assert.True(suite.T(), repository.IsNotFoundError(err))
	
	// Create and test finding existing order
	order := suite.createTestOrder()
	err = suite.orderRepo.Create(ctx, order)
	require.NoError(suite.T(), err)
	
	retrieved, err := suite.orderRepo.FindByID(ctx, order.ID())
	require.NoError(suite.T(), err)
	assert.Equal(suite.T(), order.ID(), retrieved.ID())
}

// TestOrderRepository_FindAll tests finding orders with pagination and filtering
func (suite *RepositoryTestSuite) TestOrderRepository_FindAll() {
	ctx := context.Background()
	
	// Create multiple test orders
	orders := make([]*domain.Order, 3)
	for i := 0; i < 3; i++ {
		orders[i] = suite.createTestOrder()
		err := suite.orderRepo.Create(ctx, orders[i])
		require.NoError(suite.T(), err)
	}
	
	// Test finding all orders
	filter := repository.NewOrderFilter()
	filter.PageSize = 10
	
	found, pagination, err := suite.orderRepo.FindAll(ctx, filter)
	require.NoError(suite.T(), err)
	
	assert.Len(suite.T(), found, 3)
	assert.Equal(suite.T(), int64(3), pagination.TotalItems)
	assert.Equal(suite.T(), 1, pagination.TotalPages)
	
	// Test pagination
	filter.PageSize = 2
	found, pagination, err = suite.orderRepo.FindAll(ctx, filter)
	require.NoError(suite.T(), err)
	
	assert.Len(suite.T(), found, 2)
	assert.Equal(suite.T(), int64(3), pagination.TotalItems)
	assert.Equal(suite.T(), 2, pagination.TotalPages)
	assert.True(suite.T(), pagination.HasNext)
	
	// Test filtering by customer ID
	filter = repository.NewOrderFilter()
	customerID := orders[0].CustomerID()
	filter.CustomerID = &customerID
	
	found, _, err = suite.orderRepo.FindAll(ctx, filter)
	require.NoError(suite.T(), err)
	assert.Len(suite.T(), found, 1)
	assert.Equal(suite.T(), customerID, found[0].CustomerID())
}

// TestOrderRepository_Update tests order updates
func (suite *RepositoryTestSuite) TestOrderRepository_Update() {
	ctx := context.Background()
	
	// Create test order
	order := suite.createTestOrder()
	err := suite.orderRepo.Create(ctx, order)
	require.NoError(suite.T(), err)
	
	// Update order status
	err = order.TransitionTo(domain.OrderStatusStockVerified)
	require.NoError(suite.T(), err)
	
	// Update in repository
	err = suite.orderRepo.Update(ctx, order)
	require.NoError(suite.T(), err)
	
	// Verify update
	retrieved, err := suite.orderRepo.FindByID(ctx, order.ID())
	require.NoError(suite.T(), err)
	assert.Equal(suite.T(), domain.OrderStatusStockVerified, retrieved.Status())
}

// TestOrderRepository_UpdateStatus tests status-only updates
func (suite *RepositoryTestSuite) TestOrderRepository_UpdateStatus() {
	ctx := context.Background()
	
	// Create test order
	order := suite.createTestOrder()
	err := suite.orderRepo.Create(ctx, order)
	require.NoError(suite.T(), err)
	
	// Update status only
	err = suite.orderRepo.UpdateStatus(ctx, order.ID(), domain.OrderStatusStockVerified)
	require.NoError(suite.T(), err)
	
	// Verify update
	retrieved, err := suite.orderRepo.FindByID(ctx, order.ID())
	require.NoError(suite.T(), err)
	assert.Equal(suite.T(), domain.OrderStatusStockVerified, retrieved.Status())
}

// TestOrderRepository_Delete tests order deletion
func (suite *RepositoryTestSuite) TestOrderRepository_Delete() {
	ctx := context.Background()
	
	// Create test order
	order := suite.createTestOrder()
	err := suite.orderRepo.Create(ctx, order)
	require.NoError(suite.T(), err)
	
	// Delete order
	err = suite.orderRepo.Delete(ctx, order.ID())
	require.NoError(suite.T(), err)
	
	// Verify deletion (should return not found)
	_, err = suite.orderRepo.FindByID(ctx, order.ID())
	assert.Error(suite.T(), err)
	assert.True(suite.T(), repository.IsNotFoundError(err))
}

// TestOutboxRepository_Create tests outbox event creation
func (suite *RepositoryTestSuite) TestOutboxRepository_Create() {
	ctx := context.Background()
	
	// Create test event
	event := suite.createTestEvent()
	
	// Create event
	err := suite.outboxRepo.Create(ctx, event)
	require.NoError(suite.T(), err)
	
	// Verify creation
	retrieved, err := suite.outboxRepo.FindByID(ctx, event.ID())
	require.NoError(suite.T(), err)
	
	assert.Equal(suite.T(), event.ID(), retrieved.ID())
	assert.Equal(suite.T(), event.Type(), retrieved.Type())
	assert.Equal(suite.T(), event.AggregateID(), retrieved.AggregateID())
}

// TestOutboxRepository_CreateWithOrder tests atomic order and event creation
func (suite *RepositoryTestSuite) TestOutboxRepository_CreateWithOrder() {
	ctx := context.Background()
	
	// Create test order and events
	order := suite.createTestOrder()
	events := []*domain.Event{suite.createTestEvent()}
	
	// Create order with events atomically
	err := suite.outboxRepo.CreateWithOrder(ctx, order, events)
	require.NoError(suite.T(), err)
	
	// Verify both order and event were created
	retrievedOrder, err := suite.orderRepo.FindByID(ctx, order.ID())
	require.NoError(suite.T(), err)
	assert.Equal(suite.T(), order.ID(), retrievedOrder.ID())
	
	retrievedEvent, err := suite.outboxRepo.FindByID(ctx, events[0].ID())
	require.NoError(suite.T(), err)
	assert.Equal(suite.T(), events[0].ID(), retrievedEvent.ID())
}

// TestOutboxRepository_FindUnprocessedEvents tests finding unprocessed events
func (suite *RepositoryTestSuite) TestOutboxRepository_FindUnprocessedEvents() {
	ctx := context.Background()
	
	// Create multiple events
	events := make([]*domain.Event, 3)
	for i := 0; i < 3; i++ {
		events[i] = suite.createTestEvent()
		err := suite.outboxRepo.Create(ctx, events[i])
		require.NoError(suite.T(), err)
	}
	
	// Mark one as processed
	err := suite.outboxRepo.MarkAsProcessed(ctx, events[0].ID())
	require.NoError(suite.T(), err)
	
	// Find unprocessed events
	unprocessed, err := suite.outboxRepo.FindUnprocessedEvents(ctx, 10)
	require.NoError(suite.T(), err)
	
	assert.Len(suite.T(), unprocessed, 2)
	
	// Verify the processed event is not in the list
	for _, event := range unprocessed {
		assert.NotEqual(suite.T(), events[0].ID(), event.ID())
	}
}

// TestOutboxRepository_MarkAsProcessed tests marking events as processed
func (suite *RepositoryTestSuite) TestOutboxRepository_MarkAsProcessed() {
	ctx := context.Background()
	
	// Create test event
	event := suite.createTestEvent()
	err := suite.outboxRepo.Create(ctx, event)
	require.NoError(suite.T(), err)
	
	// Mark as processed
	err = suite.outboxRepo.MarkAsProcessed(ctx, event.ID())
	require.NoError(suite.T(), err)
	
	// Verify it's marked as processed
	unprocessed, err := suite.outboxRepo.FindUnprocessedEvents(ctx, 10)
	require.NoError(suite.T(), err)
	assert.Len(suite.T(), unprocessed, 0)
}

// TestTransactionManager_WithTransaction tests transaction handling
func (suite *RepositoryTestSuite) TestTransactionManager_WithTransaction() {
	ctx := context.Background()
	
	order := suite.createTestOrder()
	
	// Test successful transaction
	err := suite.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		return suite.orderRepo.Create(txCtx, order)
	})
	require.NoError(suite.T(), err)
	
	// Verify order was created
	_, err = suite.orderRepo.FindByID(ctx, order.ID())
	require.NoError(suite.T(), err)
	
	// Test failed transaction (rollback)
	anotherOrder := suite.createTestOrder()
	err = suite.txManager.WithTransaction(ctx, func(txCtx context.Context) error {
		if err := suite.orderRepo.Create(txCtx, anotherOrder); err != nil {
			return err
		}
		return fmt.Errorf("simulated error")
	})
	assert.Error(suite.T(), err)
	
	// Verify order was not created due to rollback
	_, err = suite.orderRepo.FindByID(ctx, anotherOrder.ID())
	assert.Error(suite.T(), err)
	assert.True(suite.T(), repository.IsNotFoundError(err))
}

// TestTransactionManager_ManualTransactions tests manual transaction control
func (suite *RepositoryTestSuite) TestTransactionManager_ManualTransactions() {
	ctx := context.Background()
	
	// Begin transaction
	txCtx, err := suite.txManager.BeginTransaction(ctx)
	require.NoError(suite.T(), err)
	
	// Create order in transaction
	order := suite.createTestOrder()
	err = suite.orderRepo.Create(txCtx, order)
	require.NoError(suite.T(), err)
	
	// Rollback transaction
	err = suite.txManager.RollbackTransaction(txCtx)
	require.NoError(suite.T(), err)
	
	// Verify order was not persisted
	_, err = suite.orderRepo.FindByID(ctx, order.ID())
	assert.Error(suite.T(), err)
	assert.True(suite.T(), repository.IsNotFoundError(err))
	
	// Test commit
	txCtx, err = suite.txManager.BeginTransaction(ctx)
	require.NoError(suite.T(), err)
	
	anotherOrder := suite.createTestOrder()
	err = suite.orderRepo.Create(txCtx, anotherOrder)
	require.NoError(suite.T(), err)
	
	// Commit transaction
	err = suite.txManager.CommitTransaction(txCtx)
	require.NoError(suite.T(), err)
	
	// Verify order was persisted
	_, err = suite.orderRepo.FindByID(ctx, anotherOrder.ID())
	require.NoError(suite.T(), err)
}

// Helper methods

// createTestOrder creates a test order for testing
func (suite *RepositoryTestSuite) createTestOrder() *domain.Order {
	customerID := uuid.New()
	customerEmail, _ := domain.NewEmail("test@example.com")
	
	unitPrice, _ := domain.NewMoney(10.50, domain.USD)
	item, _ := domain.NewOrderItem(
		uuid.Nil, // Order ID will be set by the order
		uuid.New(),
		"Test Product",
		2,
		unitPrice,
	)
	
	order, _ := domain.NewOrder(customerID, customerEmail, []*domain.OrderItem{item})
	return order
}

// createTestEvent creates a test event for testing
func (suite *RepositoryTestSuite) createTestEvent() *domain.Event {
	payload := map[string]interface{}{
		"order_id":    uuid.New(),
		"customer_id": uuid.New(),
		"amount":      100.50,
		"currency":    "USD",
	}
	
	event, _ := domain.NewEvent("order.created", uuid.New(), payload)
	return event
}

// TestRepositoryIntegration runs the repository integration test suite
func TestRepositoryIntegration(t *testing.T) {
	suite.Run(t, new(RepositoryTestSuite))
}