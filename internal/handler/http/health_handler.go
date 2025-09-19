package http

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rabbitmq/amqp091-go"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/username/order-processor/internal/handler/http/dto"
	"github.com/username/order-processor/internal/handler/http/middleware"
)

// HealthHandler handles health check requests
type HealthHandler struct {
	db          *gorm.DB
	redisClient *redis.Client
	rabbitConn  *amqp091.Connection
	logger      *zap.Logger
	version     string
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(db *gorm.DB, redisClient *redis.Client, rabbitConn *amqp091.Connection, logger *zap.Logger, version string) *HealthHandler {
	return &HealthHandler{
		db:          db,
		redisClient: redisClient,
		rabbitConn:  rabbitConn,
		logger:      logger,
		version:     version,
	}
}

// HealthCheck performs a comprehensive health check of all system components
// @Summary System health check
// @Description Performs a comprehensive health check of all system components including database, Redis, and RabbitMQ
// @Tags health
// @Accept json
// @Produce json
// @Success 200 {object} dto.HealthResponse "System is healthy"
// @Failure 503 {object} dto.HealthResponse "System is unhealthy"
// @Router /health [get]
func (h *HealthHandler) HealthCheck(c *gin.Context) {
	start := time.Now()
	logger := middleware.GetLogger(c)
	
	logger.Info("Health check started",
		zap.String("event", "health_check_started"),
	)
	
	// Check all components
	dbStatus := h.checkDatabase(c.Request.Context())
	cacheStatus := h.checkRedis(c.Request.Context())
	mqStatus := h.checkRabbitMQ(c.Request.Context())
	
	// Determine overall status
	overallStatus := "healthy"
	httpStatus := http.StatusOK
	
	if dbStatus.Status == "unhealthy" || cacheStatus.Status == "unhealthy" || mqStatus.Status == "unhealthy" {
		overallStatus = "unhealthy"
		httpStatus = http.StatusServiceUnavailable
	} else if dbStatus.Status == "degraded" || cacheStatus.Status == "degraded" || mqStatus.Status == "degraded" {
		overallStatus = "degraded"
		httpStatus = http.StatusOK // Still return 200 for degraded state
	}
	
	duration := time.Since(start)
	
	response := dto.HealthResponse{
		Status:    overallStatus,
		Timestamp: time.Now(),
		Version:   h.version,
		Components: dto.HealthComponents{
			Database:     dbStatus,
			Cache:        cacheStatus,
			MessageQueue: mqStatus,
		},
		Duration: duration.Milliseconds(),
	}
	
	// Log health check result
	logger.Info("Health check completed",
		zap.String("event", "health_check_completed"),
		zap.String("overall_status", overallStatus),
		zap.String("database_status", dbStatus.Status),
		zap.String("cache_status", cacheStatus.Status),
		zap.String("message_queue_status", mqStatus.Status),
		zap.Duration("duration", duration),
	)
	
	c.JSON(httpStatus, response)
}

// ReadinessCheck performs a readiness check to determine if the service can accept traffic
// @Summary Service readiness check
// @Description Checks if the service is ready to accept traffic (lighter check than health)
// @Tags health
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{} "Service is ready"
// @Failure 503 {object} map[string]interface{} "Service is not ready"
// @Router /ready [get]
func (h *HealthHandler) ReadinessCheck(c *gin.Context) {
	start := time.Now()
	logger := middleware.GetLogger(c)
	
	logger.Info("Readiness check started",
		zap.String("event", "readiness_check_started"),
	)
	
	// Quick database check - just verify connection
	dbReady := h.quickDatabaseCheck(c.Request.Context())
	
	// For readiness, we mainly care about critical dependencies
	// Redis and RabbitMQ can be degraded but service can still be ready
	ready := dbReady
	httpStatus := http.StatusOK
	
	if !ready {
		httpStatus = http.StatusServiceUnavailable
	}
	
	duration := time.Since(start)
	
	response := map[string]interface{}{
		"ready":     ready,
		"timestamp": time.Now(),
		"duration":  duration.Milliseconds(),
		"checks": map[string]interface{}{
			"database": dbReady,
		},
	}
	
	logger.Info("Readiness check completed",
		zap.String("event", "readiness_check_completed"),
		zap.Bool("ready", ready),
		zap.Duration("duration", duration),
	)
	
	c.JSON(httpStatus, response)
}

// LivenessCheck performs a liveness check to determine if the service is alive
// @Summary Service liveness check
// @Description Checks if the service is alive and responsive
// @Tags health
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{} "Service is alive"
// @Router /live [get]
func (h *HealthHandler) LivenessCheck(c *gin.Context) {
	// Simple alive check - just return 200 if the service is running
	c.JSON(http.StatusOK, map[string]interface{}{
		"alive":     true,
		"timestamp": time.Now(),
		"service":   "order-processor",
		"version":   h.version,
	})
}

// Helper methods for checking individual components

func (h *HealthHandler) checkDatabase(ctx context.Context) dto.HealthComponentStatus {
	start := time.Now()
	
	// Create a context with timeout for database check
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	
	// Get the underlying database connection
	sqlDB, err := h.db.DB()
	if err != nil {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "Failed to get database connection: " + err.Error(),
		}
	}
	
	// Ping the database
	err = sqlDB.PingContext(checkCtx)
	if err != nil {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "Database ping failed: " + err.Error(),
		}
	}
	
	// Check database stats
	stats := sqlDB.Stats()
	details := map[string]interface{}{
		"open_connections": stats.OpenConnections,
		"in_use":          stats.InUse,
		"idle":            stats.Idle,
	}
	
	// Determine status based on connection pool
	status := "healthy"
	if stats.OpenConnections > 80 { // Assuming max 100 connections
		status = "degraded"
	}
	
	return dto.HealthComponentStatus{
		Status:       status,
		ResponseTime: time.Since(start).Milliseconds(),
		Details:      details,
	}
}

func (h *HealthHandler) quickDatabaseCheck(ctx context.Context) bool {
	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	
	sqlDB, err := h.db.DB()
	if err != nil {
		return false
	}
	
	return sqlDB.PingContext(checkCtx) == nil
}

func (h *HealthHandler) checkRedis(ctx context.Context) dto.HealthComponentStatus {
	start := time.Now()
	
	if h.redisClient == nil {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "Redis client not configured",
		}
	}
	
	// Create a context with timeout for Redis check
	checkCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	
	// Ping Redis
	pong, err := h.redisClient.Ping(checkCtx).Result()
	if err != nil {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "Redis ping failed: " + err.Error(),
		}
	}
	
	// Check Redis info
	info, err := h.redisClient.Info(checkCtx, "memory").Result()
	if err != nil {
		// Redis is responding but can't get info - degraded
		return dto.HealthComponentStatus{
			Status:       "degraded",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "Could not get Redis info: " + err.Error(),
			Details: map[string]interface{}{
				"ping_response": pong,
			},
		}
	}
	
	return dto.HealthComponentStatus{
		Status:       "healthy",
		ResponseTime: time.Since(start).Milliseconds(),
		Details: map[string]interface{}{
			"ping_response": pong,
			"info_length":   len(info),
		},
	}
}

func (h *HealthHandler) checkRabbitMQ(ctx context.Context) dto.HealthComponentStatus {
	start := time.Now()
	
	if h.rabbitConn == nil {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "RabbitMQ connection not configured",
		}
	}
	
	// Check if connection is alive
	if h.rabbitConn.IsClosed() {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "RabbitMQ connection is closed",
		}
	}
	
	// Try to create a channel to test the connection
	ch, err := h.rabbitConn.Channel()
	if err != nil {
		return dto.HealthComponentStatus{
			Status:       "unhealthy",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "Failed to create RabbitMQ channel: " + err.Error(),
		}
	}
	defer ch.Close()
	
	// Try to declare a temporary queue to test functionality
	_, err = ch.QueueDeclare(
		"health-check-temp", // queue name
		false,               // durable
		true,                // delete when unused
		true,                // exclusive
		false,               // no-wait
		nil,                 // arguments
	)
	
	if err != nil {
		return dto.HealthComponentStatus{
			Status:       "degraded",
			ResponseTime: time.Since(start).Milliseconds(),
			Error:        "RabbitMQ queue operations failed: " + err.Error(),
			Details: map[string]interface{}{
				"connection_open": !h.rabbitConn.IsClosed(),
			},
		}
	}
	
	return dto.HealthComponentStatus{
		Status:       "healthy",
		ResponseTime: time.Since(start).Milliseconds(),
		Details: map[string]interface{}{
			"connection_open": !h.rabbitConn.IsClosed(),
		},
	}
}