// @title Order Processor API
// @version 1.0
// @description Asynchronous Order Processing System API
// @description This API provides endpoints for creating and managing orders in an asynchronous, resilient manner.
//
// @contact.name API Support
// @contact.email support@example.com
//
// @license.name Apache 2.0
// @license.url http://www.apache.org/licenses/LICENSE-2.0.html
//
// @host localhost:8080
// @BasePath /api/v1
// @schemes http https
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
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/username/order-processor/docs/swagger" // Import generated docs
	"github.com/username/order-processor/internal/config"
	"github.com/username/order-processor/internal/database"
	httphandler "github.com/username/order-processor/internal/handler/http"
	"github.com/username/order-processor/internal/health"
	"github.com/username/order-processor/internal/logger"
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

	// Initialize database connection
	db, err := database.New(&cfg.Database, logger.Logger)
	if err != nil {
		logger.SugaredLogger.Fatalw("Failed to initialize database connection", "error", err)
	}
	defer db.Close()

	// Initialize health service
	healthService := health.NewService(logger.Logger)
	
	// Register health checkers
	dbHealthChecker := health.NewDatabaseHealthChecker(db, logger.Logger)
	healthService.RegisterChecker(dbHealthChecker)

	// Log application startup
	logger.SugaredLogger.Infow("Starting Order Processor API",
		"version", Version,
		"build_time", BuildTime,
		"git_commit", GitCommit,
		"environment", cfg.App.Environment,
	)

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

	// Health check endpoint (outside API versioning)
	router.GET("/health", httphandler.HealthCheckHandler(healthService))

	// API v1 routes
	v1 := router.Group("/api/v1")
	{
		// Order routes
		orders := v1.Group("/orders")
		{
			orders.POST("", httphandler.CreateOrderHandler)
			orders.GET("/:id", httphandler.GetOrderHandler)
			orders.GET("", httphandler.ListOrdersHandler)
		}
	}

	// Swagger documentation
	if !cfg.IsProduction() || cfg.App.Debug {
		router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
		logger.SugaredLogger.Infow("Swagger UI available",
			"url", fmt.Sprintf("http://%s:%d/swagger/index.html", cfg.Server.Host, cfg.Server.Port),
		)
	}

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
		logger.SugaredLogger.Infow("Starting HTTP server",
			"address", server.Addr,
			"read_timeout", cfg.Server.ReadTimeout,
			"write_timeout", cfg.Server.WriteTimeout,
		)

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.SugaredLogger.Fatalw("Failed to start server", "error", err)
		}
	}()

	logger.SugaredLogger.Infow("Order Processor API started successfully",
		"address", server.Addr,
		"environment", cfg.App.Environment,
		"debug", cfg.App.Debug,
	)

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.SugaredLogger.Info("Shutting down server...")

	// Graceful shutdown with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.SugaredLogger.Errorw("Server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.SugaredLogger.Info("Server exited")
}