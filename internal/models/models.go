// Package models provides the data models for the order processing system.
// This package contains GORM models that map to the database schema and provide
// business logic methods for order processing, event sourcing, and idempotency.
//
// The models follow domain-driven design principles and implement the following patterns:
// - Aggregate Root (Order)
// - Entity (OrderItem)
// - Event Sourcing (OutboxEvent)
// - Idempotency (IdempotencyKey)
//
// Each model includes:
// - Proper GORM tags for database mapping
// - UUID primary keys
// - Timestamps for audit trails
// - Business logic methods
// - Validation hooks
package models