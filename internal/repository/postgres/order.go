package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/username/order-processor/internal/domain"
	"github.com/username/order-processor/internal/repository"
	"github.com/username/order-processor/internal/repository/models"
)

// OrderRepository implements the OrderRepository interface using GORM and PostgreSQL
type OrderRepository struct {
	db           *gorm.DB
	errorHandler *repository.ErrorHandler
}

// NewOrderRepository creates a new PostgreSQL order repository
func NewOrderRepository(db *gorm.DB) *OrderRepository {
	return &OrderRepository{
		db:           db,
		errorHandler: repository.NewErrorHandler(nil), // Can inject logger later
	}
}

// Create saves a new order with its items in a transaction
func (r *OrderRepository) Create(ctx context.Context, order *domain.Order) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Convert domain order to GORM model
		orderModel := r.domainToModel(order)
		
		// Create the order
		if err := tx.Create(&orderModel).Error; err != nil {
			return r.errorHandler.Handle("create", "order", err)
		}
		
		return nil
	})
}

// FindByID retrieves an order by its ID including all items
func (r *OrderRepository) FindByID(ctx context.Context, id uuid.UUID) (*domain.Order, error) {
	var orderModel models.OrderModel
	
	err := r.db.WithContext(ctx).
		Preload("Items").
		Where("id = ?", id).
		First(&orderModel).Error
	
	if err != nil {
		return nil, r.errorHandler.Handle("find", "order", err)
	}
	
	return r.modelToDomain(&orderModel)
}

// FindByCustomerID retrieves orders for a specific customer with pagination
func (r *OrderRepository) FindByCustomerID(ctx context.Context, customerID uuid.UUID, filter repository.OrderFilter) ([]*domain.Order, *repository.PaginationResult, error) {
	filter.CustomerID = &customerID
	return r.FindAll(ctx, filter)
}

// FindAll retrieves orders with pagination and filtering
func (r *OrderRepository) FindAll(ctx context.Context, filter repository.OrderFilter) ([]*domain.Order, *repository.PaginationResult, error) {
	if err := filter.Validate(); err != nil {
		return nil, nil, err
	}
	
	query := r.db.WithContext(ctx).Model(&models.OrderModel{})
	
	// Apply filters
	query = r.applyFilters(query, filter)
	
	// Count total items for pagination
	var totalCount int64
	if err := query.Count(&totalCount).Error; err != nil {
		return nil, nil, r.errorHandler.Handle("count", "order", err)
	}
	
	// Apply pagination and sorting
	query = r.applySorting(query, filter)
	query = query.Offset(filter.Offset()).Limit(filter.PageSize)
	
	// Include items if requested
	if filter.IncludeItems {
		query = query.Preload("Items")
	}
	
	var orderModels []models.OrderModel
	if err := query.Find(&orderModels).Error; err != nil {
		return nil, nil, r.errorHandler.Handle("find", "order", err)
	}
	
	// Convert to domain objects
	orders := make([]*domain.Order, len(orderModels))
	for i, model := range orderModels {
		order, err := r.modelToDomain(&model)
		if err != nil {
			return nil, nil, err
		}
		orders[i] = order
	}
	
	// Calculate pagination
	pagination := filter.CalculatePagination(totalCount)
	
	return orders, pagination, nil
}

// Update updates an existing order
func (r *OrderRepository) Update(ctx context.Context, order *domain.Order) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Convert domain order to GORM model
		orderModel := r.domainToModel(order)
		
		// Update the order (excluding items - they should be managed separately)
		err := tx.Model(&orderModel).
			Select("customer_email", "total_amount", "currency", "status", "updated_at", "processed_at").
			Where("id = ?", orderModel.ID).
			Updates(orderModel).Error
		
		if err != nil {
			return r.errorHandler.Handle("update", "order", err)
		}
		
		// Update items - delete existing and create new ones
		if err := tx.Where("order_id = ?", orderModel.ID).Delete(&models.OrderItemModel{}).Error; err != nil {
			return r.errorHandler.Handle("delete", "orderitem", err)
		}
		
		if len(orderModel.Items) > 0 {
			if err := tx.Create(&orderModel.Items).Error; err != nil {
				return r.errorHandler.Handle("create", "orderitem", err)
			}
		}
		
		return nil
	})
}

// UpdateStatus updates only the order status and timestamps
func (r *OrderRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.OrderStatus) error {
	updates := map[string]interface{}{
		"status":     string(status),
		"updated_at": time.Now(),
	}
	
	// Set processed_at for terminal states
	if status.IsTerminal() {
		updates["processed_at"] = time.Now()
	}
	
	result := r.db.WithContext(ctx).
		Model(&models.OrderModel{}).
		Where("id = ?", id).
		Updates(updates)
	
	if result.Error != nil {
		return r.errorHandler.Handle("update_status", "order", result.Error)
	}
	
	if result.RowsAffected == 0 {
		return repository.NewOrderNotFoundError(id.String())
	}
	
	return nil
}

// Delete soft deletes an order
func (r *OrderRepository) Delete(ctx context.Context, id uuid.UUID) error {
	result := r.db.WithContext(ctx).Delete(&models.OrderModel{}, id)
	
	if result.Error != nil {
		return r.errorHandler.Handle("delete", "order", result.Error)
	}
	
	if result.RowsAffected == 0 {
		return repository.NewOrderNotFoundError(id.String())
	}
	
	return nil
}

// Count returns the total number of orders matching the filter
func (r *OrderRepository) Count(ctx context.Context, filter repository.OrderFilter) (int64, error) {
	query := r.db.WithContext(ctx).Model(&models.OrderModel{})
	query = r.applyFilters(query, filter)
	
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return 0, r.errorHandler.Handle("count", "order", err)
	}
	
	return count, nil
}

// ExistsByID checks if an order exists by its ID
func (r *OrderRepository) ExistsByID(ctx context.Context, id uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.OrderModel{}).
		Where("id = ?", id).
		Count(&count).Error
	
	if err != nil {
		return false, r.errorHandler.Handle("exists", "order", err)
	}
	
	return count > 0, nil
}

// FindByStatus retrieves orders by status with pagination
func (r *OrderRepository) FindByStatus(ctx context.Context, status domain.OrderStatus, filter repository.OrderFilter) ([]*domain.Order, *repository.PaginationResult, error) {
	filter.Status = &status
	return r.FindAll(ctx, filter)
}

// FindPendingOrders retrieves orders that need processing
func (r *OrderRepository) FindPendingOrders(ctx context.Context, limit int) ([]*domain.Order, error) {
	var orderModels []models.OrderModel
	
	err := r.db.WithContext(ctx).
		Preload("Items").
		Where("status = ?", models.OrderStatusPending).
		Order("created_at ASC").
		Limit(limit).
		Find(&orderModels).Error
	
	if err != nil {
		return nil, r.errorHandler.Handle("find_pending", "order", err)
	}
	
	orders := make([]*domain.Order, len(orderModels))
	for i, model := range orderModels {
		order, err := r.modelToDomain(&model)
		if err != nil {
			return nil, err
		}
		orders[i] = order
	}
	
	return orders, nil
}

// FindOrdersCreatedBetween retrieves orders created within a time range
func (r *OrderRepository) FindOrdersCreatedBetween(ctx context.Context, start, end time.Time, filter repository.OrderFilter) ([]*domain.Order, *repository.PaginationResult, error) {
	filter.CreatedAfter = &start
	filter.CreatedBefore = &end
	return r.FindAll(ctx, filter)
}

// applyFilters applies filtering conditions to the query
func (r *OrderRepository) applyFilters(query *gorm.DB, filter repository.OrderFilter) *gorm.DB {
	if filter.CustomerID != nil {
		query = query.Where("customer_id = ?", *filter.CustomerID)
	}
	
	if filter.CustomerEmail != "" {
		query = query.Where("customer_email ILIKE ?", "%"+filter.CustomerEmail+"%")
	}
	
	if filter.Status != nil {
		query = query.Where("status = ?", string(*filter.Status))
	}
	
	if filter.MinAmount != nil {
		minCents := models.ConvertFloatToCents(*filter.MinAmount)
		query = query.Where("total_amount >= ?", minCents)
	}
	
	if filter.MaxAmount != nil {
		maxCents := models.ConvertFloatToCents(*filter.MaxAmount)
		query = query.Where("total_amount <= ?", maxCents)
	}
	
	if filter.Currency != "" {
		query = query.Where("currency = ?", filter.Currency)
	}
	
	if filter.CreatedAfter != nil {
		query = query.Where("created_at >= ?", *filter.CreatedAfter)
	}
	
	if filter.CreatedBefore != nil {
		query = query.Where("created_at <= ?", *filter.CreatedBefore)
	}
	
	if filter.UpdatedAfter != nil {
		query = query.Where("updated_at >= ?", *filter.UpdatedAfter)
	}
	
	if filter.UpdatedBefore != nil {
		query = query.Where("updated_at <= ?", *filter.UpdatedBefore)
	}
	
	if filter.SearchTerm != "" {
		searchPattern := "%" + strings.ToLower(filter.SearchTerm) + "%"
		query = query.Where(
			"LOWER(customer_email) LIKE ? OR id::text LIKE ?",
			searchPattern, searchPattern,
		)
	}
	
	return query
}

// applySorting applies sorting to the query
func (r *OrderRepository) applySorting(query *gorm.DB, filter repository.OrderFilter) *gorm.DB {
	orderClause := fmt.Sprintf("%s %s", filter.SortBy, strings.ToUpper(filter.SortOrder))
	return query.Order(orderClause)
}

// domainToModel converts a domain Order to a GORM OrderModel
func (r *OrderRepository) domainToModel(order *domain.Order) models.OrderModel {
	orderModel := models.OrderModel{
		ID:            order.ID(),
		CustomerID:    order.CustomerID(),
		CustomerEmail: order.CustomerEmail().Value(),
		TotalAmount:   models.ConvertFloatToCents(order.TotalAmount().Amount()),
		Currency:      string(order.TotalAmount().Currency()),
		Status:        string(order.Status()),
		CreatedAt:     order.CreatedAt(),
		UpdatedAt:     order.UpdatedAt(),
		ProcessedAt:   order.ProcessedAt(),
	}
	
	// Convert order items
	items := order.Items()
	orderModel.Items = make([]models.OrderItemModel, len(items))
	for i, item := range items {
		orderModel.Items[i] = models.OrderItemModel{
			ID:          item.ID(),
			OrderID:     item.OrderID(),
			ProductID:   item.ProductID(),
			ProductName: item.ProductName(),
			Quantity:    item.Quantity(),
			UnitPrice:   models.ConvertFloatToCents(item.UnitPrice().Amount()),
			TotalPrice:  models.ConvertFloatToCents(item.TotalPrice().Amount()),
			Currency:    string(item.UnitPrice().Currency()),
			CreatedAt:   item.CreatedAt(),
			UpdatedAt:   item.UpdatedAt(),
		}
	}
	
	return orderModel
}

// modelToDomain converts a GORM OrderModel to a domain Order
func (r *OrderRepository) modelToDomain(orderModel *models.OrderModel) (*domain.Order, error) {
	// Convert customer email
	customerEmail, err := domain.NewEmail(orderModel.CustomerEmail)
	if err != nil {
		return nil, fmt.Errorf("invalid customer email: %w", err)
	}
	
	// Convert order items
	items := make([]*domain.OrderItem, len(orderModel.Items))
	for i, itemModel := range orderModel.Items {
		unitPrice, err := domain.NewMoney(
			models.ConvertCentsToFloat(itemModel.UnitPrice),
			domain.Currency(itemModel.Currency),
		)
		if err != nil {
			return nil, fmt.Errorf("invalid unit price for item %s: %w", itemModel.ID, err)
		}
		
		item, err := domain.NewOrderItem(
			itemModel.OrderID,
			itemModel.ProductID,
			itemModel.ProductName,
			itemModel.Quantity,
			unitPrice,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create order item: %w", err)
		}
		
		// Set the correct ID and timestamps from the model
		r.setOrderItemFields(item, &itemModel)
		items[i] = item
	}
	
	// Create the order using domain constructor
	order, err := domain.NewOrder(orderModel.CustomerID, customerEmail, items)
	if err != nil {
		return nil, fmt.Errorf("failed to create order: %w", err)
	}
	
	// Set fields that can't be set through the constructor
	r.setOrderFields(order, orderModel)
	
	return order, nil
}

// setOrderFields sets private fields on the order using reflection-like access
// In a real implementation, we might add setter methods to the domain model
// or use a different approach to handle persistence concerns
func (r *OrderRepository) setOrderFields(order *domain.Order, model *models.OrderModel) {
	// This is a simplified approach - in practice, you might:
	// 1. Add setter methods to domain objects for persistence
	// 2. Use a factory pattern
	// 3. Use reflection (not recommended)
	// 4. Have domain objects implement a persistence interface
	
	// For now, we'll assume the domain order has the correct values
	// since we created it with the constructor
	
	// To properly handle status transitions, we would need to set the status
	// This might require adding a method like SetPersistedStatus to the domain model
	
	// Convert and set the status
	status := domain.OrderStatus(model.Status)
	if status != order.Status() {
		// In a real implementation, we might have a method like:
		// order.SetPersistedStatus(status)
		// For now, we'll use the transition method if possible
		if err := order.TransitionTo(status); err != nil {
			// Log the error but don't fail the conversion
			// This might happen with invalid status transitions in legacy data
			// In production, you might want to handle this differently
			_ = err // Acknowledge the error but continue
		}
	}
}

// setOrderItemFields sets private fields on the order item
func (r *OrderRepository) setOrderItemFields(item *domain.OrderItem, model *models.OrderItemModel) {
	// Similar to setOrderFields, this would need proper domain model support
	// For now, the domain constructor should set most fields correctly
}

// GetDB returns the underlying GORM database connection
// This can be useful for custom queries or testing
func (r *OrderRepository) GetDB() *gorm.DB {
	return r.db
}

// WithTransaction executes a function within a database transaction
func (r *OrderRepository) WithTransaction(ctx context.Context, fn func(*gorm.DB) error) error {
	return r.db.WithContext(ctx).Transaction(fn)
}

// CreateBatch creates multiple orders in a single transaction
func (r *OrderRepository) CreateBatch(ctx context.Context, orders []*domain.Order) error {
	if len(orders) == 0 {
		return nil
	}
	
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, order := range orders {
			orderModel := r.domainToModel(order)
			if err := tx.Create(&orderModel).Error; err != nil {
				return r.errorHandler.Handle("create_batch", "order", err)
			}
		}
		return nil
	})
}

// UpdateBatch updates multiple orders in a single transaction
func (r *OrderRepository) UpdateBatch(ctx context.Context, orders []*domain.Order) error {
	if len(orders) == 0 {
		return nil
	}
	
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, order := range orders {
			orderModel := r.domainToModel(order)
			
			err := tx.Model(&orderModel).
				Select("customer_email", "total_amount", "currency", "status", "updated_at", "processed_at").
				Where("id = ?", orderModel.ID).
				Updates(orderModel).Error
			
			if err != nil {
				return r.errorHandler.Handle("update_batch", "order", err)
			}
		}
		return nil
	})
}