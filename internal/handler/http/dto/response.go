package dto

import (
	"time"

	"github.com/google/uuid"
	"github.com/username/order-processor/internal/domain"
)

// OrderResponse represents a complete order in API responses
// @Description Complete order information returned by the API
type OrderResponse struct {
	// Order ID (UUID format)
	// @Description Unique identifier for the order
	// @Example "789e0123-e89b-12d3-a456-426614174002"
	ID uuid.UUID `json:"id" example:"789e0123-e89b-12d3-a456-426614174002"`

	// Customer ID (UUID format)
	// @Description Unique identifier for the customer who placed the order
	// @Example "123e4567-e89b-12d3-a456-426614174000"
	CustomerID uuid.UUID `json:"customer_id" example:"123e4567-e89b-12d3-a456-426614174000"`

	// Customer email address
	// @Description Email address of the customer who placed the order
	// @Example "customer@example.com"
	CustomerEmail string `json:"customer_email" example:"customer@example.com"`

	// Total amount in cents
	// @Description Total order amount in cents (e.g., $49.98 = 4998)
	// @Example 4998
	TotalAmount int64 `json:"total_amount" example:"4998"`

	// Order status
	// @Description Current status of the order processing
	// @Example "pending"
	Status string `json:"status" example:"pending"`

	// Order items
	// @Description List of items included in this order
	Items []OrderItemResponse `json:"items"`

	// Order creation timestamp
	// @Description When the order was created (RFC3339 format)
	// @Example "2024-01-15T10:30:00Z"
	CreatedAt time.Time `json:"created_at" example:"2024-01-15T10:30:00Z"`

	// Order last update timestamp
	// @Description When the order was last updated (RFC3339 format)
	// @Example "2024-01-15T10:35:00Z"
	UpdatedAt time.Time `json:"updated_at" example:"2024-01-15T10:35:00Z"`

	// Order processing completion timestamp
	// @Description When the order processing was completed (if applicable)
	// @Example "2024-01-15T10:45:00Z"
	ProcessedAt *time.Time `json:"processed_at,omitempty" example:"2024-01-15T10:45:00Z"`
}

// OrderItemResponse represents an item within an order response
// @Description Individual item details within an order
type OrderItemResponse struct {
	// Item ID (UUID format)
	// @Description Unique identifier for the order item
	// @Example "abc12345-e89b-12d3-a456-426614174003"
	ID uuid.UUID `json:"id" example:"abc12345-e89b-12d3-a456-426614174003"`

	// Product ID (UUID format)
	// @Description Unique identifier for the product
	// @Example "456e7890-e89b-12d3-a456-426614174001"
	ProductID uuid.UUID `json:"product_id" example:"456e7890-e89b-12d3-a456-426614174001"`

	// Product name
	// @Description Name/description of the product
	// @Example "Wireless Bluetooth Headphones"
	ProductName string `json:"product_name" example:"Wireless Bluetooth Headphones"`

	// Quantity ordered
	// @Description Number of units of this product in the order
	// @Example 2
	Quantity int `json:"quantity" example:"2"`

	// Unit price in cents
	// @Description Price per unit in cents (e.g., $19.99 = 1999)
	// @Example 1999
	UnitPrice int64 `json:"unit_price" example:"1999"`

	// Total price for this item in cents
	// @Description Total price for this item (quantity * unit_price) in cents
	// @Example 3998
	TotalPrice int64 `json:"total_price" example:"3998"`
}

// CreateOrderResponse represents the response after creating an order
// @Description Response returned after successfully creating an order
type CreateOrderResponse struct {
	// Order ID (UUID format)
	// @Description Unique identifier for the newly created order
	// @Example "789e0123-e89b-12d3-a456-426614174002"
	ID uuid.UUID `json:"id" example:"789e0123-e89b-12d3-a456-426614174002"`

	// Message describing the result
	// @Description Human-readable message about the order creation
	// @Example "Order created successfully and queued for processing"
	Message string `json:"message" example:"Order created successfully and queued for processing"`

	// Order status
	// @Description Initial status of the created order
	// @Example "pending"
	Status string `json:"status" example:"pending"`

	// Correlation ID for tracking
	// @Description Correlation ID for tracking this order through the system
	// @Example "req_789e0123-e89b-12d3-a456-426614174002"
	CorrelationID string `json:"correlation_id" example:"req_789e0123-e89b-12d3-a456-426614174002"`
}

// ListOrdersResponse represents a paginated list of orders
// @Description Paginated response containing multiple orders
type ListOrdersResponse struct {
	// List of orders
	// @Description Array of orders matching the query criteria
	Orders []OrderResponse `json:"orders"`

	// Pagination information
	// @Description Pagination metadata for the response
	Pagination PaginationResponse `json:"pagination"`
}

// PaginationResponse represents pagination metadata
// @Description Pagination information for list responses
type PaginationResponse struct {
	// Current page number
	// @Description Current page number (starts from 1)
	// @Example 1
	Page int `json:"page" example:"1"`

	// Items per page
	// @Description Number of items per page
	// @Example 20
	Limit int `json:"limit" example:"20"`

	// Total number of items
	// @Description Total number of items available across all pages
	// @Example 150
	Total int64 `json:"total" example:"150"`

	// Total number of pages
	// @Description Total number of pages available
	// @Example 8
	TotalPages int `json:"total_pages" example:"8"`

	// Whether there is a next page
	// @Description Indicates if there are more pages available
	// @Example true
	HasNext bool `json:"has_next" example:"true"`

	// Whether there is a previous page
	// @Description Indicates if there are previous pages available
	// @Example false
	HasPrev bool `json:"has_prev" example:"false"`
}

// HealthResponse represents the health check response
// @Description System health check information
type HealthResponse struct {
	// Overall system status
	// @Description Overall health status of the system
	// @Example "healthy"
	Status string `json:"status" example:"healthy"`

	// Timestamp of the health check
	// @Description When this health check was performed
	// @Example "2024-01-15T10:30:00Z"
	Timestamp time.Time `json:"timestamp" example:"2024-01-15T10:30:00Z"`

	// Service version
	// @Description Version of the order processing service
	// @Example "1.0.0"
	Version string `json:"version" example:"1.0.0"`

	// Individual component health status
	// @Description Health status of individual system components
	Components HealthComponents `json:"components"`

	// Request duration in milliseconds
	// @Description How long this health check took to complete
	// @Example 25
	Duration int64 `json:"duration_ms" example:"25"`
}

// HealthComponents represents the health status of individual components
// @Description Health status information for each system component
type HealthComponents struct {
	// Database health status
	// @Description PostgreSQL database connection status
	Database HealthComponentStatus `json:"database"`

	// Redis cache health status
	// @Description Redis cache connection status
	Cache HealthComponentStatus `json:"cache"`

	// RabbitMQ message queue health status
	// @Description RabbitMQ message broker connection status
	MessageQueue HealthComponentStatus `json:"message_queue"`
}

// HealthComponentStatus represents the health status of a single component
// @Description Health status information for a system component
type HealthComponentStatus struct {
	// Component status
	// @Description Status of this component (healthy, degraded, unhealthy)
	// @Example "healthy"
	Status string `json:"status" example:"healthy"`

	// Response time in milliseconds
	// @Description How long it took to check this component
	// @Example 5
	ResponseTime int64 `json:"response_time_ms" example:"5"`

	// Error message if unhealthy
	// @Description Error details if the component is not healthy
	// @Example ""
	Error string `json:"error,omitempty" example:""`

	// Additional component details
	// @Description Additional information about the component
	Details map[string]interface{} `json:"details,omitempty"`
}

// FromDomainOrder converts a domain Order to OrderResponse
func FromDomainOrder(order *domain.Order) OrderResponse {
	items := make([]OrderItemResponse, 0, len(order.Items()))
	for _, item := range order.Items() {
		items = append(items, FromDomainOrderItem(item))
	}

	return OrderResponse{
		ID:            order.ID(),
		CustomerID:    order.CustomerID(),
		CustomerEmail: order.CustomerEmail().String(),
		TotalAmount:   order.TotalAmount().AmountInCents(),
		Status:        string(order.Status()),
		Items:         items,
		CreatedAt:     order.CreatedAt(),
		UpdatedAt:     order.UpdatedAt(),
		ProcessedAt:   order.ProcessedAt(),
	}
}

// FromDomainOrderItem converts a domain OrderItem to OrderItemResponse
func FromDomainOrderItem(item *domain.OrderItem) OrderItemResponse {
	return OrderItemResponse{
		ID:          item.ID(),
		ProductID:   item.ProductID(),
		ProductName: item.ProductName(),
		Quantity:    item.Quantity(),
		UnitPrice:   item.UnitPrice().AmountInCents(),
		TotalPrice:  item.TotalPrice().AmountInCents(),
	}
}