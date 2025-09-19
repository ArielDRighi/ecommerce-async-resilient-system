package http

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/domain"
	"github.com/username/order-processor/internal/handler/http/dto"
	"github.com/username/order-processor/internal/handler/http/middleware"
	"github.com/username/order-processor/internal/service"
)

// OrderHandler handles HTTP requests for order operations
type OrderHandler struct {
	orderService service.OrderService
	logger       *zap.Logger
}

// NewOrderHandler creates a new order handler
func NewOrderHandler(orderService service.OrderService, logger *zap.Logger) *OrderHandler {
	return &OrderHandler{
		orderService: orderService,
		logger:       logger,
	}
}

// CreateOrder creates a new order
// @Summary Create a new order
// @Description Create a new order with the provided items. Returns 202 Accepted as the order will be processed asynchronously.
// @Tags orders
// @Accept json
// @Produce json
// @Param X-Idempotency-Key header string false "Idempotency key to prevent duplicate orders"
// @Param order body dto.CreateOrderRequest true "Order creation request"
// @Success 202 {object} dto.CreateOrderResponse "Order created successfully"
// @Failure 400 {object} dto.ErrorResponse "Validation error"
// @Failure 409 {object} dto.ErrorResponse "Conflict (e.g., duplicate idempotency key)"
// @Failure 422 {object} dto.ErrorResponse "Business logic error"
// @Failure 500 {object} dto.ErrorResponse "Internal server error"
// @Router /api/v1/orders [post]
func (h *OrderHandler) CreateOrder(c *gin.Context) {
	logger := middleware.GetLogger(c)
	correlationID := middleware.GetCorrelationID(c)
	
	logger.Info("Creating order",
		zap.String("event", "order_creation_started"),
	)
	
	// Validate request body
	var req dto.CreateOrderRequest
	if !middleware.ValidateJSON(c, &req) {
		return
	}
	
	// Log business metrics
	logger.Info("Order creation request",
		zap.String("event", "order_creation_request"),
		zap.String("customer_id", req.CustomerID.String()),
		zap.String("customer_email", req.CustomerEmail),
		zap.Int("item_count", len(req.Items)),
		zap.String("idempotency_key", req.IdempotencyKey),
	)
	
	// Convert DTO to domain entities
	order, err := h.convertCreateRequestToDomain(req)
	if err != nil {
		logger.Error("Failed to convert request to domain",
			zap.String("event", "domain_conversion_error"),
			zap.Error(err),
		)
		
		middleware.AbortWithError(c, http.StatusBadRequest, dto.ErrorCodeValidation, 
			"Invalid order data", map[string]interface{}{"conversion_error": err.Error()})
		return
	}
	
	// Add correlation ID to context
	ctx := middleware.AddCorrelationIDToContext(c.Request.Context(), correlationID)
	
	// Create order using service
	createdOrder, err := h.orderService.CreateOrder(ctx, order)
	if err != nil {
		h.handleServiceError(c, err, "Failed to create order")
		return
	}
	
	// Log successful creation
	logger.Info("Order created successfully",
		zap.String("event", "order_created"),
		zap.String("order_id", createdOrder.ID().String()),
		zap.String("customer_id", createdOrder.CustomerID().String()),
		zap.Int64("total_amount", createdOrder.TotalAmount().AmountInCents()),
		zap.String("status", string(createdOrder.Status())),
	)
	
	// Handle idempotency caching if key was provided
	h.handleIdempotencyResponse(c, req.IdempotencyKey)
	
	// Return response
	response := dto.CreateOrderResponse{
		ID:            createdOrder.ID(),
		Message:       "Order created successfully and queued for processing",
		Status:        string(createdOrder.Status()),
		CorrelationID: correlationID,
	}
	
	c.JSON(http.StatusAccepted, response)
}

// GetOrder retrieves an order by ID
// @Summary Get order by ID
// @Description Retrieve detailed information about a specific order
// @Tags orders
// @Accept json
// @Produce json
// @Param id path string true "Order ID (UUID format)" format(uuid)
// @Success 200 {object} dto.OrderResponse "Order details"
// @Failure 400 {object} dto.ErrorResponse "Invalid order ID format"
// @Failure 404 {object} dto.ErrorResponse "Order not found"
// @Failure 500 {object} dto.ErrorResponse "Internal server error"
// @Router /api/v1/orders/{id} [get]
func (h *OrderHandler) GetOrder(c *gin.Context) {
	logger := middleware.GetLogger(c)
	correlationID := middleware.GetCorrelationID(c)
	
	// Validate UUID parameter
	if !middleware.ValidateUUID(c, "id") {
		return
	}
	
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		middleware.AbortWithError(c, http.StatusBadRequest, dto.ErrorCodeInvalidFormat,
			"Invalid order ID format", nil)
		return
	}
	
	logger.Info("Retrieving order",
		zap.String("event", "order_retrieval_started"),
		zap.String("order_id", orderID.String()),
	)
	
	// Add correlation ID to context
	ctx := middleware.AddCorrelationIDToContext(c.Request.Context(), correlationID)
	
	// Get order from service
	order, err := h.orderService.GetOrderByID(ctx, orderID)
	if err != nil {
		h.handleServiceError(c, err, "Failed to retrieve order")
		return
	}
	
	// Convert domain to response DTO
	response := h.convertDomainToResponse(order)
	
	logger.Info("Order retrieved successfully",
		zap.String("event", "order_retrieved"),
		zap.String("order_id", order.ID().String()),
		zap.String("status", string(order.Status())),
		zap.Int64("total_amount", order.TotalAmount().AmountInCents()),
	)
	
	c.JSON(http.StatusOK, response)
}

// ListOrders retrieves a paginated list of orders
// @Summary List orders with pagination
// @Description Retrieve a paginated list of orders with optional filtering
// @Tags orders
// @Accept json
// @Produce json
// @Param page query int false "Page number (starts from 1)" default(1) minimum(1)
// @Param limit query int false "Number of items per page" default(20) minimum(1) maximum(100)
// @Param customer_id query string false "Filter by customer ID (UUID format)" format(uuid)
// @Param status query string false "Filter by order status" Enums(pending, stock_verified, payment_processing, payment_completed, confirmed, failed, cancelled)
// @Param created_after query string false "Filter orders created after this date (RFC3339 format)" format(date-time)
// @Param created_before query string false "Filter orders created before this date (RFC3339 format)" format(date-time)
// @Success 200 {object} dto.ListOrdersResponse "Paginated list of orders"
// @Failure 400 {object} dto.ErrorResponse "Invalid query parameters"
// @Failure 500 {object} dto.ErrorResponse "Internal server error"
// @Router /api/v1/orders [get]
func (h *OrderHandler) ListOrders(c *gin.Context) {
	logger := middleware.GetLogger(c)
	correlationID := middleware.GetCorrelationID(c)
	
	// Validate query parameters
	var req dto.ListOrdersRequest
	if !middleware.ValidateQuery(c, &req) {
		return
	}
	
	// Set defaults
	req.Validate()
	
	logger.Info("Listing orders",
		zap.String("event", "order_listing_started"),
		zap.Int("page", req.Page),
		zap.Int("limit", req.Limit),
		zap.String("customer_id", req.CustomerID),
		zap.String("status", req.Status),
	)
	
	// Add correlation ID to context
	ctx := middleware.AddCorrelationIDToContext(c.Request.Context(), correlationID)
	
	// Create filter from query parameters
	filter := h.convertListRequestToFilter(req)
	
	// Get orders from service
	orders, total, err := h.orderService.ListOrders(ctx, filter, req.Page, req.Limit)
	if err != nil {
		h.handleServiceError(c, err, "Failed to list orders")
		return
	}
	
	// Convert to response DTOs
	orderResponses := make([]dto.OrderResponse, len(orders))
	for i, order := range orders {
		orderResponses[i] = h.convertDomainToResponse(&order)
	}
	
	// Calculate pagination
	totalPages := int((total + int64(req.Limit) - 1) / int64(req.Limit))
	hasNext := req.Page < totalPages
	hasPrev := req.Page > 1
	
	response := dto.ListOrdersResponse{
		Orders: orderResponses,
		Pagination: dto.PaginationResponse{
			Page:       req.Page,
			Limit:      req.Limit,
			Total:      total,
			TotalPages: totalPages,
			HasNext:    hasNext,
			HasPrev:    hasPrev,
		},
	}
	
	logger.Info("Orders listed successfully",
		zap.String("event", "orders_listed"),
		zap.Int("page", req.Page),
		zap.Int("limit", req.Limit),
		zap.Int64("total", total),
		zap.Int("returned_count", len(orders)),
	)
	
	c.JSON(http.StatusOK, response)
}

// Helper methods

func (h *OrderHandler) convertCreateRequestToDomain(req dto.CreateOrderRequest) (*domain.Order, error) {
	// Convert customer email to domain Email
	customerEmail, err := domain.NewEmail(req.CustomerEmail)
	if err != nil {
		return nil, err
	}
	
	// Convert items to domain OrderItems
	items := make([]*domain.OrderItem, len(req.Items))
	for i, item := range req.Items {
		// Create Money for unit price (assuming cents, USD currency)
		unitPrice, err := domain.NewMoneyFromCents(item.UnitPrice, domain.USD)
		if err != nil {
			return nil, err
		}
		
		// Create OrderItem using domain constructor with new UUID
		itemID := uuid.New()
		orderItem, err := domain.NewOrderItem(itemID, item.ProductID, item.ProductName, item.Quantity, unitPrice)
		if err != nil {
			return nil, err
		}
		
		items[i] = orderItem
	}
	
	// Create order using domain constructor
	order, err := domain.NewOrder(req.CustomerID, customerEmail, items)
	if err != nil {
		return nil, err
	}
	
	return order, nil
}

func (h *OrderHandler) convertDomainToResponse(order *domain.Order) dto.OrderResponse {
	items := order.Items()
	itemResponses := make([]dto.OrderItemResponse, len(items))
	for i, item := range items {
		itemResponses[i] = dto.OrderItemResponse{
			ID:          item.ID(),
			ProductID:   item.ProductID(),
			ProductName: item.ProductName(),
			Quantity:    item.Quantity(),
			UnitPrice:   item.UnitPrice().AmountInCents(),
			TotalPrice:  item.TotalPrice().AmountInCents(),
		}
	}
	
	return dto.OrderResponse{
		ID:            order.ID(),
		CustomerID:    order.CustomerID(),
		CustomerEmail: order.CustomerEmail().String(),
		TotalAmount:   order.TotalAmount().AmountInCents(),
		Status:        string(order.Status()),
		Items:         itemResponses,
		CreatedAt:     order.CreatedAt(),
		UpdatedAt:     order.UpdatedAt(),
		ProcessedAt:   order.ProcessedAt(),
	}
}

func (h *OrderHandler) convertListRequestToFilter(req dto.ListOrdersRequest) domain.OrderFilter {
	filter := domain.OrderFilter{
		Status:        req.Status,
		CreatedAfter:  req.CreatedAfter,
		CreatedBefore: req.CreatedBefore,
	}
	
	if req.CustomerID != "" {
		if customerID, err := uuid.Parse(req.CustomerID); err == nil {
			filter.CustomerID = &customerID
		}
	}
	
	return filter
}

func (h *OrderHandler) handleServiceError(c *gin.Context, err error, message string) {
	logger := middleware.GetLogger(c)
	
	// Log the error
	logger.Error(message,
		zap.String("event", "service_error"),
		zap.Error(err),
	)
	
	// Convert domain errors to HTTP responses
	var domainErr *domain.DomainError
	if errors.As(err, &domainErr) {
		switch domainErr.Code {
		case "ORDER_NOT_FOUND":
			middleware.AbortWithError(c, http.StatusNotFound, dto.ErrorCodeNotFound,
				"Order not found", nil)
		case "VALIDATION_ERROR":
			middleware.AbortWithError(c, http.StatusBadRequest, dto.ErrorCodeValidation,
				domainErr.Message, nil)
		case "BUSINESS_RULE_ERROR":
			middleware.AbortWithBusinessError(c, &dto.BusinessError{
				Type:    dto.ErrorCodeOrderNotEditable,
				Message: domainErr.Message,
			})
		default:
			middleware.AbortWithError(c, http.StatusInternalServerError, dto.ErrorCodeInternalServer,
				"An error occurred while processing your request", nil)
		}
	} else {
		middleware.AbortWithError(c, http.StatusInternalServerError, dto.ErrorCodeInternalServer,
			"An error occurred while processing your request", nil)
	}
}

func (h *OrderHandler) handleIdempotencyResponse(c *gin.Context, idempotencyKey string) {
	if idempotencyKey == "" {
		return
	}
	
	// This would be handled by the idempotency middleware
	// The actual response caching would happen there
	// This is just a placeholder for future enhancement
}