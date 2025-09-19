package database

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/username/order-processor/internal/models"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Seeder provides database seeding functionality
type Seeder struct {
	db     *DB
	logger *zap.Logger
}

// NewSeeder creates a new database seeder
func NewSeeder(db *DB, logger *zap.Logger) *Seeder {
	return &Seeder{
		db:     db,
		logger: logger,
	}
}

// SeedAll runs all seed functions
func (s *Seeder) SeedAll() error {
	s.logger.Info("Starting database seeding")

	if err := s.SeedOrders(); err != nil {
		return fmt.Errorf("failed to seed orders: %w", err)
	}

	if err := s.SeedOutboxEvents(); err != nil {
		return fmt.Errorf("failed to seed outbox events: %w", err)
	}

	if err := s.SeedIdempotencyKeys(); err != nil {
		return fmt.Errorf("failed to seed idempotency keys: %w", err)
	}

	s.logger.Info("Database seeding completed successfully")
	return nil
}

// SeedOrders creates sample orders with items
func (s *Seeder) SeedOrders() error {
	s.logger.Info("Seeding orders")

	// Check if orders already exist
	var count int64
	if err := s.db.Model(&models.Order{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count existing orders: %w", err)
	}

	if count > 0 {
		s.logger.Info("Orders already exist, skipping seed", zap.Int64("count", count))
		return nil
	}

	// Sample customer IDs
	customerIDs := []uuid.UUID{
		uuid.MustParse("550e8400-e29b-41d4-a716-446655440001"),
		uuid.MustParse("550e8400-e29b-41d4-a716-446655440002"),
		uuid.MustParse("550e8400-e29b-41d4-a716-446655440003"),
	}

	// Sample product data
	products := []struct {
		ID    uuid.UUID
		Name  string
		Price float64
	}{
		{uuid.MustParse("550e8400-e29b-41d4-a716-446655440010"), "Wireless Headphones", 99.99},
		{uuid.MustParse("550e8400-e29b-41d4-a716-446655440011"), "Bluetooth Speaker", 79.99},
		{uuid.MustParse("550e8400-e29b-41d4-a716-446655440012"), "Smart Watch", 199.99},
		{uuid.MustParse("550e8400-e29b-41d4-a716-446655440013"), "USB-C Cable", 19.99},
		{uuid.MustParse("550e8400-e29b-41d4-a716-446655440014"), "Phone Case", 24.99},
	}

	orders := []models.Order{
		{
			ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440020"),
			CustomerID:  customerIDs[0],
			Status:      models.OrderStatusPending,
			TotalAmount: 199.98,
			Currency:    "USD",
			Metadata: datatypes.JSON(`{
				"customer_email": "john.doe@example.com",
				"shipping_address": {
					"street": "123 Main St",
					"city": "San Francisco",
					"state": "CA",
					"zip": "94105",
					"country": "US"
				},
				"billing_address": {
					"street": "123 Main St",
					"city": "San Francisco", 
					"state": "CA",
					"zip": "94105",
					"country": "US"
				}
			}`),
			Items: []models.OrderItem{
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440030"),
					ProductID:   products[0].ID,
					ProductName: products[0].Name,
					Quantity:    2,
					UnitPrice:   products[0].Price,
					Metadata: datatypes.JSON(`{
						"sku": "WH001",
						"category": "Electronics",
						"warranty": "1 year"
					}`),
				},
			},
		},
		{
			ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440021"),
			CustomerID:  customerIDs[1],
			Status:      models.OrderStatusProcessing,
			TotalAmount: 304.97,
			Currency:    "USD",
			Metadata: datatypes.JSON(`{
				"customer_email": "jane.smith@example.com",
				"shipping_address": {
					"street": "456 Oak Ave",
					"city": "New York",
					"state": "NY",
					"zip": "10001",
					"country": "US"
				},
				"priority": "express",
				"notes": "Handle with care"
			}`),
			Items: []models.OrderItem{
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440031"),
					ProductID:   products[1].ID,
					ProductName: products[1].Name,
					Quantity:    1,
					UnitPrice:   products[1].Price,
					Metadata: datatypes.JSON(`{
						"sku": "BS001",
						"category": "Electronics"
					}`),
				},
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440032"),
					ProductID:   products[2].ID,
					ProductName: products[2].Name,
					Quantity:    1,
					UnitPrice:   products[2].Price,
					Metadata: datatypes.JSON(`{
						"sku": "SW001",
						"category": "Electronics",
						"warranty": "2 years"
					}`),
				},
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440033"),
					ProductID:   products[3].ID,
					ProductName: products[3].Name,
					Quantity:    1,
					UnitPrice:   products[3].Price,
					Metadata: datatypes.JSON(`{
						"sku": "UC001",
						"category": "Accessories"
					}`),
				},
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440034"),
					ProductID:   products[4].ID,
					ProductName: products[4].Name,
					Quantity:    1,
					UnitPrice:   products[4].Price,
					Metadata: datatypes.JSON(`{
						"sku": "PC001",
						"category": "Accessories"
					}`),
				},
			},
		},
		{
			ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440022"),
			CustomerID:  customerIDs[2],
			Status:      models.OrderStatusDelivered,
			TotalAmount: 119.98,
			Currency:    "USD",
			Metadata: datatypes.JSON(`{
				"customer_email": "mike.johnson@example.com",
				"shipping_address": {
					"street": "789 Pine Rd",
					"city": "Austin",
					"state": "TX",
					"zip": "73301",
					"country": "US"
				},
				"delivered_at": "2023-09-18T15:30:00Z",
				"tracking_number": "1Z999AA1234567890"
			}`),
			Items: []models.OrderItem{
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440035"),
					ProductID:   products[0].ID,
					ProductName: products[0].Name,
					Quantity:    1,
					UnitPrice:   products[0].Price,
					Metadata: datatypes.JSON(`{
						"sku": "WH001",
						"category": "Electronics"
					}`),
				},
				{
					ID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440036"),
					ProductID:   products[3].ID,
					ProductName: products[3].Name,
					Quantity:    1,
					UnitPrice:   products[3].Price,
					Metadata: datatypes.JSON(`{
						"sku": "UC001", 
						"category": "Accessories"
					}`),
				},
			},
		},
	}

	// Create orders with items in a transaction
	err := s.db.WithTransaction(context.Background(), func(tx *gorm.DB) error {
		for _, order := range orders {
			if err := tx.Create(&order).Error; err != nil {
				return fmt.Errorf("failed to create order %s: %w", order.ID, err)
			}
		}
		return nil
	})

	if err != nil {
		return fmt.Errorf("failed to seed orders: %w", err)
	}

	s.logger.Info("Successfully seeded orders", zap.Int("count", len(orders)))
	return nil
}

// SeedOutboxEvents creates sample outbox events
func (s *Seeder) SeedOutboxEvents() error {
	s.logger.Info("Seeding outbox events")

	// Check if outbox events already exist
	var count int64
	if err := s.db.Model(&models.OutboxEvent{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count existing outbox events: %w", err)
	}

	if count > 0 {
		s.logger.Info("Outbox events already exist, skipping seed", zap.Int64("count", count))
		return nil
	}

	correlationID := uuid.MustParse("550e8400-e29b-41d4-a716-446655440100")
	
	events := []models.OutboxEvent{
		{
			ID:            uuid.MustParse("550e8400-e29b-41d4-a716-446655440040"),
			AggregateType: models.AggregateTypeOrder,
			AggregateID:   uuid.MustParse("550e8400-e29b-41d4-a716-446655440020"),
			EventType:     models.EventTypeOrderCreated,
			EventData: datatypes.JSON(`{
				"order_id": "550e8400-e29b-41d4-a716-446655440020",
				"customer_id": "550e8400-e29b-41d4-a716-446655440001",
				"total_amount": 199.98,
				"currency": "USD",
				"status": "pending",
				"items_count": 1
			}`),
			EventVersion:  1,
			CorrelationID: &correlationID,
			Processed:     true,
			ProcessedAt:   &time.Time{},
		},
		{
			ID:            uuid.MustParse("550e8400-e29b-41d4-a716-446655440041"),
			AggregateType: models.AggregateTypeOrder,
			AggregateID:   uuid.MustParse("550e8400-e29b-41d4-a716-446655440021"),
			EventType:     models.EventTypeOrderCreated,
			EventData: datatypes.JSON(`{
				"order_id": "550e8400-e29b-41d4-a716-446655440021",
				"customer_id": "550e8400-e29b-41d4-a716-446655440002",
				"total_amount": 304.97,
				"currency": "USD",
				"status": "pending",
				"items_count": 4
			}`),
			EventVersion:  1,
			CorrelationID: &correlationID,
			Processed:     false,
			RetryCount:    1,
			NextRetryAt:   &time.Time{},
		},
		{
			ID:            uuid.MustParse("550e8400-e29b-41d4-a716-446655440042"),
			AggregateType: models.AggregateTypeOrder,
			AggregateID:   uuid.MustParse("550e8400-e29b-41d4-a716-446655440022"),
			EventType:     models.EventTypeOrderCompleted,
			EventData: datatypes.JSON(`{
				"order_id": "550e8400-e29b-41d4-a716-446655440022",
				"customer_id": "550e8400-e29b-41d4-a716-446655440003",
				"total_amount": 119.98,
				"currency": "USD",
				"status": "delivered",
				"delivery_date": "2023-09-18T15:30:00Z"
			}`),
			EventVersion:  2,
			CorrelationID: &correlationID,
			Processed:     true,
			ProcessedAt:   &time.Time{},
		},
	}

	// Set processed times for processed events
	now := time.Now()
	for i := range events {
		if events[i].Processed {
			events[i].ProcessedAt = &now
		} else if events[i].NextRetryAt != nil {
			retryTime := now.Add(5 * time.Minute)
			events[i].NextRetryAt = &retryTime
		}
	}

	if err := s.db.Create(&events).Error; err != nil {
		return fmt.Errorf("failed to seed outbox events: %w", err)
	}

	s.logger.Info("Successfully seeded outbox events", zap.Int("count", len(events)))
	return nil
}

// SeedIdempotencyKeys creates sample idempotency keys
func (s *Seeder) SeedIdempotencyKeys() error {
	s.logger.Info("Seeding idempotency keys")

	// Check if idempotency keys already exist
	var count int64
	if err := s.db.Model(&models.IdempotencyKey{}).Count(&count).Error; err != nil {
		return fmt.Errorf("failed to count existing idempotency keys: %w", err)
	}

	if count > 0 {
		s.logger.Info("Idempotency keys already exist, skipping seed", zap.Int64("count", count))
		return nil
	}

	resourceID := uuid.MustParse("550e8400-e29b-41d4-a716-446655440020")
	statusCode := 201
	
	keys := []models.IdempotencyKey{
		{
			ID:                 uuid.MustParse("550e8400-e29b-41d4-a716-446655440050"),
			IdempotencyKey:     "order-create-550e8400-e29b-41d4-a716-446655440020",
			RequestHash:        "sha256:abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
			ResponseStatusCode: &statusCode,
			ResponseBody: datatypes.JSON(`{
				"id": "550e8400-e29b-41d4-a716-446655440020",
				"status": "accepted",
				"message": "Order created successfully"
			}`),
			ResourceType: models.ResourceTypeOrder,
			ResourceID:   &resourceID,
			ExpiresAt:    time.Now().Add(24 * time.Hour),
		},
		{
			ID:             uuid.MustParse("550e8400-e29b-41d4-a716-446655440051"),
			IdempotencyKey: "payment-process-550e8400-e29b-41d4-a716-446655440021",
			RequestHash:    "sha256:def456ghi789jkl012mno345pqr678stu901vwx234yz567890abc123",
			ResourceType:   models.ResourceTypePayment,
			ExpiresAt:      time.Now().Add(12 * time.Hour),
		},
		{
			ID:             uuid.MustParse("550e8400-e29b-41d4-a716-446655440052"),
			IdempotencyKey: "order-cancel-expired-key",
			RequestHash:    "sha256:expired123456789abcdef012345678901234567890abcdef",
			ResourceType:   models.ResourceTypeOrder,
			ExpiresAt:      time.Now().Add(-1 * time.Hour), // Expired key
		},
	}

	if err := s.db.Create(&keys).Error; err != nil {
		return fmt.Errorf("failed to seed idempotency keys: %w", err)
	}

	s.logger.Info("Successfully seeded idempotency keys", zap.Int("count", len(keys)))
	return nil
}