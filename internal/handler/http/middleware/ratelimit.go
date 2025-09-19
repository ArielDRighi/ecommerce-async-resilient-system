package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	redisClient "github.com/redis/go-redis/v9"
	"github.com/ulule/limiter/v3"
	"github.com/ulule/limiter/v3/drivers/store/redis"
	"go.uber.org/zap"

	"github.com/username/order-processor/internal/handler/http/dto"
)

// RateLimiterConfig holds configuration for rate limiting
type RateLimiterConfig struct {
	// Rate limit (e.g., "100-H" for 100 requests per hour, "10-M" for 10 per minute)
	Rate string
	// Redis client for distributed rate limiting
	RedisClient *redisClient.Client
	// Key prefix for Redis keys
	KeyPrefix string
	// Skip rate limiting for certain IPs (e.g., health checks)
	SkipIPs []string
}

// RateLimit creates a rate limiting middleware using Redis
func RateLimit(config RateLimiterConfig) gin.HandlerFunc {
	// Parse rate limit
	rate, err := limiter.NewRateFromFormatted(config.Rate)
	if err != nil {
		panic("Invalid rate limit format: " + config.Rate)
	}
	
	// Create Redis store
	store, err := redis.NewStore(config.RedisClient)
	if err != nil {
		panic("Failed to create Redis store for rate limiting: " + err.Error())
	}
	
	// Create limiter instance
	instance := limiter.New(store, rate, limiter.WithTrustForwardHeader(true))
	
	return func(c *gin.Context) {
		logger := GetLogger(c)
		correlationID := GetCorrelationID(c)
		clientIP := c.ClientIP()
		
		// Skip rate limiting for certain IPs
		for _, skipIP := range config.SkipIPs {
			if clientIP == skipIP {
				c.Next()
				return
			}
		}
		
		// Create rate limiting key based on IP and path
		key := config.KeyPrefix + ":" + clientIP + ":" + c.Request.URL.Path
		
		// Check rate limit
		context, err := instance.Get(c.Request.Context(), key)
		if err != nil {
			logger.Error("Rate limiting error",
				zap.String("event", "rate_limit_error"),
				zap.Error(err),
				zap.String("client_ip", clientIP),
				zap.String("key", key),
			)
			// Allow request to proceed if rate limiting fails
			c.Next()
			return
		}
		
		// Set rate limit headers
		c.Header("X-RateLimit-Limit", strconv.FormatInt(context.Limit, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(context.Remaining, 10))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(context.Reset, 10))
		
		// Check if rate limit exceeded
		if context.Reached {
			logger.Warn("Rate limit exceeded",
				zap.String("event", "rate_limit_exceeded"),
				zap.String("client_ip", clientIP),
				zap.String("path", c.Request.URL.Path),
				zap.Int64("limit", context.Limit),
				zap.Int64("remaining", context.Remaining),
				zap.Int64("reset", context.Reset),
			)
			
			errorResponse := dto.ErrorResponse{
				Code:          dto.ErrorCodeRateLimit,
				Message:       "Rate limit exceeded. Please try again later.",
				Details: map[string]interface{}{
					"limit":     context.Limit,
					"remaining": context.Remaining,
					"reset":     context.Reset,
					"retry_after": context.Reset - time.Now().Unix(),
				},
				CorrelationID: correlationID,
				Timestamp:     time.Now(),
				Path:          c.Request.URL.Path,
			}
			
			// Set Retry-After header
			c.Header("Retry-After", strconv.FormatInt(context.Reset-time.Now().Unix(), 10))
			
			c.JSON(http.StatusTooManyRequests, errorResponse)
			c.Abort()
			return
		}
		
		// Log rate limiting metrics for monitoring
		logger.Info("Rate limit check",
			zap.String("event", "rate_limit_check"),
			zap.String("client_ip", clientIP),
			zap.String("path", c.Request.URL.Path),
			zap.Int64("limit", context.Limit),
			zap.Int64("remaining", context.Remaining),
			zap.Int64("reset", context.Reset),
		)
		
		c.Next()
	}
}

// RateLimitByUserID creates a rate limiting middleware based on user ID
func RateLimitByUserID(config RateLimiterConfig, getUserID func(*gin.Context) string) gin.HandlerFunc {
	// Parse rate limit
	rate, err := limiter.NewRateFromFormatted(config.Rate)
	if err != nil {
		panic("Invalid rate limit format: " + config.Rate)
	}
	
	// Create Redis store
	store, err := redis.NewStore(config.RedisClient)
	if err != nil {
		panic("Failed to create Redis store for rate limiting: " + err.Error())
	}
	
	// Create limiter instance
	instance := limiter.New(store, rate)
	
	return func(c *gin.Context) {
		logger := GetLogger(c)
		correlationID := GetCorrelationID(c)
		
		// Get user ID
		userID := getUserID(c)
		if userID == "" {
			// If no user ID, fall back to IP-based rate limiting
			clientIP := c.ClientIP()
			userID = "ip:" + clientIP
		}
		
		// Create rate limiting key based on user ID and path
		key := config.KeyPrefix + ":user:" + userID + ":" + c.Request.URL.Path
		
		// Check rate limit
		context, err := instance.Get(c.Request.Context(), key)
		if err != nil {
			logger.Error("User rate limiting error",
				zap.String("event", "user_rate_limit_error"),
				zap.Error(err),
				zap.String("user_id", userID),
				zap.String("key", key),
			)
			// Allow request to proceed if rate limiting fails
			c.Next()
			return
		}
		
		// Set rate limit headers
		c.Header("X-RateLimit-Limit", strconv.FormatInt(context.Limit, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(context.Remaining, 10))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(context.Reset, 10))
		
		// Check if rate limit exceeded
		if context.Reached {
			logger.Warn("User rate limit exceeded",
				zap.String("event", "user_rate_limit_exceeded"),
				zap.String("user_id", userID),
				zap.String("path", c.Request.URL.Path),
				zap.Int64("limit", context.Limit),
				zap.Int64("remaining", context.Remaining),
				zap.Int64("reset", context.Reset),
			)
			
			errorResponse := dto.ErrorResponse{
				Code:          dto.ErrorCodeRateLimit,
				Message:       "Rate limit exceeded for your account. Please try again later.",
				Details: map[string]interface{}{
					"limit":     context.Limit,
					"remaining": context.Remaining,
					"reset":     context.Reset,
					"retry_after": context.Reset - time.Now().Unix(),
				},
				CorrelationID: correlationID,
				Timestamp:     time.Now(),
				Path:          c.Request.URL.Path,
			}
			
			// Set Retry-After header
			c.Header("Retry-After", strconv.FormatInt(context.Reset-time.Now().Unix(), 10))
			
			c.JSON(http.StatusTooManyRequests, errorResponse)
			c.Abort()
			return
		}
		
		c.Next()
	}
}

// IdempotencyMiddleware creates middleware for handling idempotency keys
func IdempotencyMiddleware(redisClient *redisClient.Client, ttl time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only apply to POST, PUT, PATCH requests
		if c.Request.Method != "POST" && c.Request.Method != "PUT" && c.Request.Method != "PATCH" {
			c.Next()
			return
		}
		
		logger := GetLogger(c)
		
		// Get idempotency key from header
		idempotencyKey := c.GetHeader("X-Idempotency-Key")
		if idempotencyKey == "" {
			// Idempotency key is optional, proceed without it
			c.Next()
			return
		}
		
		// Create Redis key for idempotency
		redisKey := "idempotency:" + idempotencyKey
		
		// Check if this request was already processed
		existingResponse, err := redisClient.Get(c.Request.Context(), redisKey).Result()
		if err == nil {
			// Found existing response, return it
			logger.Info("Idempotent request detected",
				zap.String("event", "idempotent_request"),
				zap.String("idempotency_key", idempotencyKey),
				zap.String("path", c.Request.URL.Path),
			)
			
			c.Header("X-Idempotency-Replayed", "true")
			c.Header("Content-Type", "application/json")
			c.String(http.StatusOK, existingResponse)
			c.Abort()
			return
		}
		
		// Store idempotency key in context for handlers
		c.Set("idempotency_key", idempotencyKey)
		c.Set("idempotency_redis_key", redisKey)
		c.Set("idempotency_ttl", ttl)
		
		c.Next()
	}
}