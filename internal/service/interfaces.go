package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/username/order-processor/internal/domain"
)

// OrderService defines the business logic interface for order operations
type OrderService interface {
	// CreateOrder creates a new order and publishes it for processing
	CreateOrder(ctx context.Context, order *domain.Order) (*domain.Order, error)
	
	// GetOrderByID retrieves an order by its ID
	GetOrderByID(ctx context.Context, orderID uuid.UUID) (*domain.Order, error)
	
	// ListOrders retrieves orders with pagination and filtering
	ListOrders(ctx context.Context, filter domain.OrderFilter, page, limit int) ([]domain.Order, int64, error)
	
	// UpdateOrderStatus updates the status of an order
	UpdateOrderStatus(ctx context.Context, orderID uuid.UUID, status domain.OrderStatus) error
	
	// ProcessOrder handles the complete order processing workflow
	ProcessOrder(ctx context.Context, orderID uuid.UUID) error
}