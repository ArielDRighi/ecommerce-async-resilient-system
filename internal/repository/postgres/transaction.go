package postgres

import (
	"context"
	"fmt"

	"gorm.io/gorm"
	
	"github.com/username/order-processor/internal/repository"
)

// TransactionManager implements the TransactionManager interface using GORM
type TransactionManager struct {
	db           *gorm.DB
	errorHandler *repository.ErrorHandler
}

// NewTransactionManager creates a new PostgreSQL transaction manager
func NewTransactionManager(db *gorm.DB) *TransactionManager {
	return &TransactionManager{
		db:           db,
		errorHandler: repository.NewErrorHandler(nil),
	}
}

// txContextKey is used as a key for storing transaction in context
type txContextKey struct{}

// WithTransaction executes a function within a database transaction
func (tm *TransactionManager) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	// Check if we're already in a transaction
	if tm.IsInTransaction(ctx) {
		// If we're already in a transaction, just execute the function
		// This allows for nested transaction calls
		return fn(ctx)
	}

	// Start a new transaction
	return tm.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Store the transaction in the context
		txCtx := context.WithValue(ctx, txContextKey{}, tx)
		
		// Execute the function with the transaction context
		return fn(txCtx)
	})
}

// BeginTransaction starts a new transaction and returns a context with the transaction
func (tm *TransactionManager) BeginTransaction(ctx context.Context) (context.Context, error) {
	// Check if we're already in a transaction
	if tm.IsInTransaction(ctx) {
		return nil, fmt.Errorf("transaction already active in context")
	}

	// Begin a new transaction
	tx := tm.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return nil, tm.errorHandler.Handle("begin", "transaction", tx.Error)
	}

	// Store the transaction in the context
	txCtx := context.WithValue(ctx, txContextKey{}, tx)
	
	return txCtx, nil
}

// CommitTransaction commits the transaction in the given context
func (tm *TransactionManager) CommitTransaction(ctx context.Context) error {
	tx, ok := ctx.Value(txContextKey{}).(*gorm.DB)
	if !ok {
		return fmt.Errorf("no active transaction found in context")
	}

	if err := tx.Commit().Error; err != nil {
		return tm.errorHandler.Handle("commit", "transaction", err)
	}

	return nil
}

// RollbackTransaction rolls back the transaction in the given context
func (tm *TransactionManager) RollbackTransaction(ctx context.Context) error {
	tx, ok := ctx.Value(txContextKey{}).(*gorm.DB)
	if !ok {
		return fmt.Errorf("no active transaction found in context")
	}

	if err := tx.Rollback().Error; err != nil {
		return tm.errorHandler.Handle("rollback", "transaction", err)
	}

	return nil
}

// IsInTransaction checks if the context contains an active transaction
func (tm *TransactionManager) IsInTransaction(ctx context.Context) bool {
	_, ok := ctx.Value(txContextKey{}).(*gorm.DB)
	return ok
}

// GetDB returns the database connection for the context
// If a transaction is active, it returns the transaction
// Otherwise, it returns the main database connection
func (tm *TransactionManager) GetDB(ctx context.Context) *gorm.DB {
	if tx, ok := ctx.Value(txContextKey{}).(*gorm.DB); ok {
		return tx
	}
	return tm.db.WithContext(ctx)
}

// TransactionalRepositoryBase provides a base for repositories that need transaction support
type TransactionalRepositoryBase struct {
	db           *gorm.DB
	txManager    *TransactionManager
	errorHandler *repository.ErrorHandler
}

// NewTransactionalRepositoryBase creates a new transactional repository base
func NewTransactionalRepositoryBase(db *gorm.DB, txManager *TransactionManager) *TransactionalRepositoryBase {
	return &TransactionalRepositoryBase{
		db:           db,
		txManager:    txManager,
		errorHandler: repository.NewErrorHandler(nil),
	}
}

// GetDB returns the appropriate database connection for the context
func (tr *TransactionalRepositoryBase) GetDB(ctx context.Context) *gorm.DB {
	return tr.txManager.GetDB(ctx)
}

// WithTransaction is a convenience method for executing functions in a transaction
func (tr *TransactionalRepositoryBase) WithTransaction(ctx context.Context, fn func(ctx context.Context) error) error {
	return tr.txManager.WithTransaction(ctx, fn)
}

// TransactionHandler provides advanced transaction handling patterns
type TransactionHandler struct {
	tm *TransactionManager
}

// NewTransactionHandler creates a new transaction handler
func NewTransactionHandler(tm *TransactionManager) *TransactionHandler {
	return &TransactionHandler{tm: tm}
}

// ExecuteInTransaction executes multiple functions in a single transaction
// If any function fails, the entire transaction is rolled back
func (th *TransactionHandler) ExecuteInTransaction(ctx context.Context, operations ...func(ctx context.Context) error) error {
	return th.tm.WithTransaction(ctx, func(txCtx context.Context) error {
		for i, operation := range operations {
			if err := operation(txCtx); err != nil {
				return fmt.Errorf("operation %d failed: %w", i+1, err)
			}
		}
		return nil
	})
}

// ExecuteWithSavepoints executes functions with savepoints for partial rollbacks
// Note: This is a more advanced pattern and would require additional GORM support
func (th *TransactionHandler) ExecuteWithSavepoints(ctx context.Context, operations ...func(ctx context.Context) error) error {
	return th.tm.WithTransaction(ctx, func(txCtx context.Context) error {
		db := th.tm.GetDB(txCtx)
		
		for i, operation := range operations {
			// Create savepoint
			savepointName := fmt.Sprintf("sp_%d", i)
			if err := db.Exec(fmt.Sprintf("SAVEPOINT %s", savepointName)).Error; err != nil {
				return fmt.Errorf("failed to create savepoint %s: %w", savepointName, err)
			}
			
			// Execute operation
			if err := operation(txCtx); err != nil {
				// Rollback to savepoint
				if rollbackErr := db.Exec(fmt.Sprintf("ROLLBACK TO SAVEPOINT %s", savepointName)).Error; rollbackErr != nil {
					return fmt.Errorf("failed to rollback to savepoint %s: %w", savepointName, rollbackErr)
				}
				return fmt.Errorf("operation %d failed: %w", i+1, err)
			}
			
			// Release savepoint
			if err := db.Exec(fmt.Sprintf("RELEASE SAVEPOINT %s", savepointName)).Error; err != nil {
				return fmt.Errorf("failed to release savepoint %s: %w", savepointName, err)
			}
		}
		
		return nil
	})
}

// RetryableTransaction executes a function in a transaction with retry logic
func (th *TransactionHandler) RetryableTransaction(ctx context.Context, maxRetries int, fn func(ctx context.Context) error) error {
	var lastErr error
	
	for attempt := 0; attempt <= maxRetries; attempt++ {
		err := th.tm.WithTransaction(ctx, fn)
		if err == nil {
			return nil
		}
		
		lastErr = err
		
		// Check if the error is retryable
		if !repository.RetryableError(err) {
			return err
		}
		
		// If this is the last attempt, return the error
		if attempt == maxRetries {
			break
		}
		
		// Optional: Add exponential backoff here
		// time.Sleep(time.Duration(math.Pow(2, float64(attempt))) * time.Second)
	}
	
	return fmt.Errorf("transaction failed after %d retries: %w", maxRetries, lastErr)
}

// TransactionStats provides statistics about database transactions
type TransactionStats struct {
	ActiveTransactions int64 `json:"active_transactions"`
	CommittedTransactions int64 `json:"committed_transactions"`
	RolledBackTransactions int64 `json:"rolled_back_transactions"`
}

// GetTransactionStats returns statistics about database transactions
func (tm *TransactionManager) GetTransactionStats(ctx context.Context) (TransactionStats, error) {
	var stats TransactionStats
	
	// Query PostgreSQL system tables for transaction statistics
	// This is a simplified example - in practice, you might want to track these metrics yourself
	
	var activeCount int64
	err := tm.db.WithContext(ctx).Raw(`
		SELECT COUNT(*) 
		FROM pg_stat_activity 
		WHERE state = 'active' AND backend_type = 'client backend'
	`).Scan(&activeCount).Error
	
	if err != nil {
		return stats, tm.errorHandler.Handle("get_stats", "transaction", err)
	}
	
	stats.ActiveTransactions = activeCount
	
	// Note: PostgreSQL doesn't provide committed/rolled back transaction counts directly
	// In a production system, you would typically track these metrics in your application
	
	return stats, nil
}

// CleanupIdleTransactions can be used to identify and potentially clean up idle transactions
func (tm *TransactionManager) CleanupIdleTransactions(ctx context.Context, maxIdleTime int) error {
	// This is a maintenance operation that would typically be run periodically
	// It identifies transactions that have been idle for too long
	
	result := tm.db.WithContext(ctx).Exec(`
		SELECT pg_terminate_backend(pid)
		FROM pg_stat_activity
		WHERE state = 'idle in transaction'
		AND backend_type = 'client backend'
		AND NOW() - state_change > INTERVAL '%d seconds'
	`, maxIdleTime)
	
	if result.Error != nil {
		return tm.errorHandler.Handle("cleanup_idle", "transaction", result.Error)
	}
	
	return nil
}