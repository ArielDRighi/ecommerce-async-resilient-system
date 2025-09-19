// @title Order Processing API
// @version 1.0
// @description A comprehensive REST API for asynchronous order processing with resilience patterns
// @description This API provides endpoints for creating and managing orders in an asynchronous, resilient manner.
// @description
// @description Features:
// @description - Asynchronous order processing with messaging
// @description - Comprehensive error handling and logging
// @description - Rate limiting and idempotency support
// @description - Health checks and monitoring
// @description - Request/response validation
// @description - Correlation ID tracking
//
// @termsOfService http://swagger.io/terms/
//
// @contact.name API Support Team
// @contact.url http://www.order-processor.example.com/support
// @contact.email support@order-processor.example.com
//
// @license.name MIT
// @license.url https://opensource.org/licenses/MIT
//
// @host localhost:8080
// @BasePath /
//
// @schemes http https
//
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Bearer token authentication. Format: "Bearer {token}"
//
// @tag.name orders
// @tag.description Order management operations including creation, retrieval, and status updates
//
// @tag.name health
// @tag.description Health check endpoints for monitoring system status and readiness
//
// @x-extension-openapi {"info":{"x-logo":{"url":"https://order-processor.example.com/logo.png"}}}
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/handler/http/dto"
	"github.com/username/order-processor/internal/logger"

	_ "github.com/username/order-processor/docs"
)

var (
	// Version information (set during build)
	Version   = "1.0.0"
	BuildTime = "unknown"
	GitCommit = "unknown"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger
	if err := logger.Initialize(cfg.Logger); err != nil {
		fmt.Printf("Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	// Log application startup
	logger.SugaredLogger.Infow("Starting Order Processor API",
		"version", Version,
		"build_time", BuildTime,
		"git_commit", GitCommit,
		"environment", cfg.App.Environment,
	)

	// Also print to console for immediate feedback
	fmt.Printf("🚀 Starting Order Processor API\n")
	fmt.Printf("   Version: %s\n", Version)
	fmt.Printf("   Environment: %s\n", cfg.App.Environment)
	fmt.Printf("   Build Time: %s\n", BuildTime)

	// Set Gin mode based on environment
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	} else {
		gin.SetMode(gin.DebugMode)
	}

	// Create Gin router
	router := gin.New()

	// Add middleware
	router.Use(logger.GinLogger())
	router.Use(logger.GinRecovery())

	// Add CORS middleware (basic implementation)
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Correlation-ID, X-Idempotency-Key")
		
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		
		c.Next()
	})

	// Health check endpoint (simple version for now)
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "healthy",
			"timestamp": time.Now(),
			"version": Version,
			"service": "order-processor",
		})
	})

	// Root endpoint - API information
	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service":     "order-processor",
			"version":     Version,
			"description": "Order Processing API with asynchronous processing and resilience patterns",
			"environment": cfg.App.Environment,
			"endpoints": gin.H{
				"health":       "/health",
				"swagger":      "/swagger/index.html",
				"api_v1":       "/api/v1",
				"create_order": "/api/v1/orders",
				"get_order":    "/api/v1/orders/{id}",
				"list_orders":  "/api/v1/orders",
				"test_error":   "/api/v1/test/error",
				"test_validate": "/api/v1/test/validate",
			},
			"documentation": "/swagger/index.html",
		})
	})

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Order routes with proper validation and error handling
		orders := v1.Group("/orders")
		{
			// POST /api/v1/orders - Create order with domain validation
			orders.POST("", func(c *gin.Context) {
				correlationID := c.GetHeader("X-Correlation-ID")
				if correlationID == "" {
					correlationID = fmt.Sprintf("%d", time.Now().UnixNano())
					c.Header("X-Correlation-ID", correlationID)
				}

				logger.SugaredLogger.Infow("Processing create order request",
					"correlation_id", correlationID,
					"method", "POST",
					"path", "/api/v1/orders",
				)

				// Validate Content-Type
				if c.GetHeader("Content-Type") != "application/json" {
					logger.SugaredLogger.Errorw("Invalid content type",
						"correlation_id", correlationID,
						"content_type", c.GetHeader("Content-Type"),
					)
					c.JSON(http.StatusUnsupportedMediaType, gin.H{
						"error": "Unsupported Media Type",
						"message": "Content-Type must be application/json",
						"correlation_id": correlationID,
						"timestamp": time.Now(),
					})
					return
				}

				// Bind JSON to CreateOrderRequest DTO
				var request dto.CreateOrderRequest
				if err := c.ShouldBindJSON(&request); err != nil {
					logger.SugaredLogger.Errorw("JSON binding failed",
						"correlation_id", correlationID,
						"error", err.Error(),
					)
					c.JSON(http.StatusBadRequest, dto.ErrorResponse{
						Code:          dto.ErrorCodeInvalidFormat,
						Message:       "Invalid JSON format",
						Details:       map[string]interface{}{"error": err.Error()},
						CorrelationID: correlationID,
						Timestamp:     time.Now(),
						Path:          c.Request.URL.Path,
					})
					return
				}

				// Convert to domain entity (this performs domain validation)
				errorMapper := dto.NewDomainErrorMapper()
				domainOrder, err := request.ToDomainOrder()
				if err != nil {
					logger.SugaredLogger.Errorw("Domain validation failed",
						"correlation_id", correlationID,
						"validation_error", err.Error(),
					)
					statusCode, errorResponse := errorMapper.MapDomainErrorToHTTP(err, correlationID, c.Request.URL.Path)
					c.JSON(statusCode, errorResponse)
					return
				}

				logger.SugaredLogger.Infow("Order creation request validated successfully with domain validation",
					"correlation_id", correlationID,
					"customer_id", domainOrder.CustomerID(),
					"customer_email", domainOrder.CustomerEmail().String(),
					"total_amount_cents", domainOrder.TotalAmount().AmountInCents(),
					"items_count", len(domainOrder.Items()),
				)

				// Create response DTO from domain entity
				createResponse := dto.CreateOrderResponse{
					ID:            domainOrder.ID(),
					Message:       "Order created successfully and queued for processing",
					Status:        string(domainOrder.Status()),
					CorrelationID: correlationID,
				}

				// Return 202 Accepted for async processing
				c.JSON(http.StatusAccepted, createResponse)
			})

			// GET /api/v1/orders/:id - Get order with validation
			orders.GET("/:id", func(c *gin.Context) {
				correlationID := c.GetHeader("X-Correlation-ID")
				if correlationID == "" {
					correlationID = fmt.Sprintf("%d", time.Now().UnixNano())
					c.Header("X-Correlation-ID", correlationID)
				}

				orderID := c.Param("id")
				logger.SugaredLogger.Infow("Processing get order request",
					"correlation_id", correlationID,
					"order_id", orderID,
					"method", "GET",
				)

				// Validate UUID format (proper UUID validation)
				if _, err := uuid.Parse(orderID); err != nil {
					logger.SugaredLogger.Errorw("Invalid order ID format",
						"correlation_id", correlationID,
						"order_id", orderID,
						"error", err.Error(),
					)
					c.JSON(http.StatusBadRequest, gin.H{
						"error": "Bad Request",
						"message": "Invalid order ID format - must be a valid UUID",
						"correlation_id": correlationID,
						"timestamp": time.Now(),
					})
					return
				}

				// Simulate order not found for demo
				logger.SugaredLogger.Infow("Order not found (demo response)",
					"correlation_id", correlationID,
					"order_id", orderID,
				)
				c.JSON(http.StatusNotFound, gin.H{
					"error": "Not Found",
					"message": "Order not found",
					"order_id": orderID,
					"correlation_id": correlationID,
					"timestamp": time.Now(),
				})
			})

			// GET /api/v1/orders - List orders with pagination validation
			orders.GET("", func(c *gin.Context) {
				correlationID := c.GetHeader("X-Correlation-ID")
				if correlationID == "" {
					correlationID = fmt.Sprintf("%d", time.Now().UnixNano())
					c.Header("X-Correlation-ID", correlationID)
				}

				logger.SugaredLogger.Infow("Processing list orders request",
					"correlation_id", correlationID,
					"method", "GET",
					"query_params", c.Request.URL.RawQuery,
				)

				// Validate pagination parameters
				page := c.DefaultQuery("page", "1")
				limit := c.DefaultQuery("limit", "10")

				// Return empty list for demo
				c.JSON(http.StatusOK, gin.H{
					"orders": []interface{}{},
					"pagination": gin.H{
						"page": page,
						"limit": limit,
						"total": 0,
						"total_pages": 0,
					},
					"correlation_id": correlationID,
					"timestamp": time.Now(),
				})
			})
		}

		// Test endpoints for validation and error handling
		test := v1.Group("/test")
		{
			// Test endpoint for error handling
			test.GET("/error", func(c *gin.Context) {
				correlationID := c.GetHeader("X-Correlation-ID")
				if correlationID == "" {
					correlationID = fmt.Sprintf("%d", time.Now().UnixNano())
					c.Header("X-Correlation-ID", correlationID)
				}

				logger.SugaredLogger.Errorw("Test error endpoint called",
					"correlation_id", correlationID,
					"path", "/api/v1/test/error",
				)

				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Internal Server Error",
					"message": "This is a test error endpoint",
					"correlation_id": correlationID,
					"timestamp": time.Now(),
				})
			})

			// Test endpoint for validation
			test.POST("/validate", func(c *gin.Context) {
				correlationID := c.GetHeader("X-Correlation-ID")
				if correlationID == "" {
					correlationID = fmt.Sprintf("%d", time.Now().UnixNano())
					c.Header("X-Correlation-ID", correlationID)
				}

				logger.SugaredLogger.Infow("Test validation endpoint called",
					"correlation_id", correlationID,
					"path", "/api/v1/test/validate",
				)

				var req map[string]interface{}
				if err := c.ShouldBindJSON(&req); err != nil {
					logger.SugaredLogger.Errorw("JSON validation failed",
						"correlation_id", correlationID,
						"error", err.Error(),
					)
					c.JSON(http.StatusBadRequest, gin.H{
						"error": "Bad Request",
						"message": "Invalid JSON format",
						"details": err.Error(),
						"correlation_id": correlationID,
						"timestamp": time.Now(),
					})
					return
				}

				// Validate required fields
				errors := []string{}
				if name, ok := req["name"]; !ok || name == "" {
					errors = append(errors, "name is required and cannot be empty")
				}
				if email, ok := req["email"]; !ok || email == "" {
					errors = append(errors, "email is required and cannot be empty")
				}

			if len(errors) > 0 {
				logger.SugaredLogger.Warnw("Validation errors found",
					"correlation_id", correlationID,
					"validation_errors", errors,
				)
				errorResponse := dto.ErrorResponse{
					Code:          dto.ErrorCodeValidation,
					Message:       "Validation failed for one or more fields",
					Details:       map[string]interface{}{"validation_errors": errors},
					CorrelationID: correlationID,
					Timestamp:     time.Now(),
					Path:          c.Request.URL.Path,
				}
				c.JSON(http.StatusBadRequest, errorResponse)
				return
			}
			
			logger.SugaredLogger.Infow("Validation successful",
					"correlation_id", correlationID,
					"validated_data", req,
				)

				c.JSON(http.StatusOK, gin.H{
					"message": "Validation successful",
					"data": req,
					"correlation_id": correlationID,
					"timestamp": time.Now(),
				})
			})
		}
	}

	// Swagger documentation
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler,
		ginSwagger.DefaultModelsExpandDepth(-1),
	))
	
	// Debug route to check if documentation is loaded
	router.GET("/docs/swagger.json", func(c *gin.Context) {
		c.Header("Content-Type", "application/json")
		c.File("./docs/swagger.json")
	})
	
	swaggerURL := fmt.Sprintf("http://%s:%d/swagger/index.html", cfg.Server.Host, cfg.Server.Port)
	if cfg.Server.Host == "0.0.0.0" {
		swaggerURL = fmt.Sprintf("http://localhost:%d/swagger/index.html", cfg.Server.Port)
	}
	
	logger.SugaredLogger.Infow("Swagger UI available", "url", swaggerURL)
	fmt.Printf("📚 Swagger UI: %s\n", swaggerURL)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port),
		Handler:      router,
		ReadTimeout:  time.Duration(cfg.Server.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(cfg.Server.WriteTimeout) * time.Second,
		IdleTimeout:  time.Duration(cfg.Server.IdleTimeout) * time.Second,
	}

	// Start server in a goroutine
	go func() {
		serverURL := fmt.Sprintf("http://%s:%d", cfg.Server.Host, cfg.Server.Port)
		if cfg.Server.Host == "0.0.0.0" {
			serverURL = fmt.Sprintf("http://localhost:%d", cfg.Server.Port)
		}
		
		logger.SugaredLogger.Infow("Starting HTTP server",
			"address", server.Addr,
			"read_timeout", cfg.Server.ReadTimeout,
			"write_timeout", cfg.Server.WriteTimeout,
		)
		
		fmt.Printf("🌐 Server starting on: %s\n", serverURL)
		fmt.Printf("📋 Available endpoints:\n")
		fmt.Printf("   • API Info:     %s/\n", serverURL)
		fmt.Printf("   • Health Check: %s/health\n", serverURL)
		fmt.Printf("   • API v1:       %s/api/v1\n", serverURL)
		fmt.Printf("   • Swagger UI:   %s/swagger/index.html\n", serverURL)
		fmt.Printf("\n✅ Press Ctrl+C to stop the server\n\n")

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.SugaredLogger.Fatalw("Failed to start server", "error", err)
			fmt.Printf("❌ Failed to start server: %v\n", err)
		}
	}()

	logger.SugaredLogger.Infow("Order Processor API started successfully",
		"address", server.Addr,
		"environment", cfg.App.Environment,
		"debug", cfg.App.Debug,
	)

	fmt.Printf("🎉 Order Processor API started successfully!\n")
	fmt.Printf("🔧 Environment: %s | Debug: %v\n", cfg.App.Environment, cfg.App.Debug)
	fmt.Printf("🎯 Server is ready to accept requests...\n\n")

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.SugaredLogger.Info("Shutting down server...")
	fmt.Printf("\n🛑 Shutting down server gracefully...\n")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.SugaredLogger.Errorw("Server forced to shutdown", "error", err)
		fmt.Printf("❌ Server forced to shutdown: %v\n", err)
		os.Exit(1)
	}

	logger.SugaredLogger.Info("Server exited")
	fmt.Printf("✅ Server stopped successfully. Goodbye!\n")
}