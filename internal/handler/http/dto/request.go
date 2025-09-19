package dto

import (
	"time"

	"github.com/google/uuid"
)

// CreateOrderRequest represents the request to create a new order
// @Description Request payload for creating a new order
type CreateOrderRequest struct {
	// Customer ID (UUID format)
	// @Description Unique identifier for the customer placing the order
	// @Example "123e4567-e89b-12d3-a456-426614174000"
	CustomerID uuid.UUID `json:"customer_id" binding:"required" validate:"required" example:"123e4567-e89b-12d3-a456-426614174000"`

	// Customer email address
	// @Description Valid email address of the customer
	// @Example "customer@example.com"
	CustomerEmail string `json:"customer_email" binding:"required,email" validate:"required,email" example:"customer@example.com"`

	// List of items in the order
	// @Description Array of items to be included in the order
	Items []CreateOrderItemRequest `json:"items" binding:"required,min=1,dive" validate:"required,min=1,dive"`

	// Idempotency key for preventing duplicate orders
	// @Description Optional idempotency key to prevent duplicate order creation
	// @Example "order-2024-001"
	IdempotencyKey string `json:"idempotency_key,omitempty" validate:"omitempty,max=255" example:"order-2024-001"`
}

// CreateOrderItemRequest represents an item in the order creation request
// @Description Individual item details for order creation
type CreateOrderItemRequest struct {
	// Product ID (UUID format)
	// @Description Unique identifier for the product
	// @Example "456e7890-e89b-12d3-a456-426614174001"
	ProductID uuid.UUID `json:"product_id" binding:"required" validate:"required" example:"456e7890-e89b-12d3-a456-426614174001"`

	// Product name
	// @Description Name/description of the product
	// @Example "Wireless Bluetooth Headphones"
	ProductName string `json:"product_name" binding:"required,min=1,max=255" validate:"required,min=1,max=255" example:"Wireless Bluetooth Headphones"`

	// Quantity of the product
	// @Description Number of units of this product in the order
	// @Example 2
	Quantity int `json:"quantity" binding:"required,min=1" validate:"required,min=1" example:"2"`

	// Unit price of the product in cents
	// @Description Price per unit in cents (e.g., $19.99 = 1999)
	// @Example 1999
	UnitPrice int64 `json:"unit_price" binding:"required,min=1" validate:"required,min=1" example:"1999"`
}

// ListOrdersRequest represents query parameters for listing orders
// @Description Query parameters for filtering and paginating order list
type ListOrdersRequest struct {
	// Page number for pagination (starts from 1)
	// @Description Page number for pagination, starting from 1
	// @Example 1
	Page int `form:"page" binding:"omitempty,min=1" validate:"omitempty,min=1" example:"1"`

	// Number of items per page
	// @Description Number of orders to return per page (max 100)
	// @Example 20
	Limit int `form:"limit" binding:"omitempty,min=1,max=100" validate:"omitempty,min=1,max=100" example:"20"`

	// Filter by customer ID
	// @Description Filter orders by customer ID (UUID format)
	// @Example "123e4567-e89b-12d3-a456-426614174000"
	CustomerID string `form:"customer_id" binding:"omitempty,uuid" validate:"omitempty,uuid" example:"123e4567-e89b-12d3-a456-426614174000"`

	// Filter by order status
	// @Description Filter orders by their current status
	// @Example "pending"
	Status string `form:"status" binding:"omitempty,oneof=pending stock_verified payment_processing payment_completed confirmed failed cancelled" validate:"omitempty,oneof=pending stock_verified payment_processing payment_completed confirmed failed cancelled" example:"pending"`

	// Filter orders created after this date
	// @Description Filter orders created after this date (RFC3339 format)
	// @Example "2024-01-01T00:00:00Z"
	CreatedAfter *time.Time `form:"created_after" binding:"omitempty" validate:"omitempty" time_format:"2006-01-02T15:04:05Z07:00" example:"2024-01-01T00:00:00Z"`

	// Filter orders created before this date
	// @Description Filter orders created before this date (RFC3339 format)
	// @Example "2024-12-31T23:59:59Z"
	CreatedBefore *time.Time `form:"created_before" binding:"omitempty" validate:"omitempty" time_format:"2006-01-02T15:04:05Z07:00" example:"2024-12-31T23:59:59Z"`
}

// Validate sets default values for pagination if not provided
func (r *ListOrdersRequest) Validate() {
	if r.Page <= 0 {
		r.Page = 1
	}
	if r.Limit <= 0 {
		r.Limit = 20
	}
}