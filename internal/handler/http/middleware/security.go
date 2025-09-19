package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// CORS creates a CORS middleware with comprehensive configuration
func CORS() gin.HandlerFunc {
	config := cors.Config{
		// Allow specific origins in production, wildcard for development
		AllowOrigins: []string{
			"http://localhost:3000",     // React development server
			"http://localhost:8080",     // Alternative development port
			"https://yourdomain.com",    // Production domain
		},
		
		// Allow common HTTP methods
		AllowMethods: []string{
			"GET",
			"POST",
			"PUT",
			"PATCH",
			"DELETE",
			"HEAD",
			"OPTIONS",
		},
		
		// Allow common headers including custom ones
		AllowHeaders: []string{
			"Origin",
			"Content-Length",
			"Content-Type",
			"Authorization",
			"X-Requested-With",
			"X-Correlation-ID",
			"X-Idempotency-Key",
			"Accept",
			"Accept-Encoding",
			"Accept-Language",
			"Cache-Control",
			"Connection",
			"DNT",
			"Host",
			"Pragma",
			"Referer",
			"User-Agent",
		},
		
		// Expose custom headers to the client
		ExposeHeaders: []string{
			"X-Correlation-ID",
			"X-RateLimit-Limit",
			"X-RateLimit-Remaining",
			"X-RateLimit-Reset",
		},
		
		// Allow credentials (cookies, authorization headers)
		AllowCredentials: true,
		
		// Cache preflight responses for 12 hours
		MaxAge: 12 * time.Hour,
	}
	
	return cors.New(config)
}

// CORSDevMode creates a permissive CORS middleware for development
func CORSDevMode() gin.HandlerFunc {
	config := cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"*"},
		AllowCredentials: true,
		MaxAge:          12 * time.Hour,
	}
	
	return cors.New(config)
}

// Security creates a middleware that adds security headers
func Security() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Prevent MIME type sniffing
		c.Header("X-Content-Type-Options", "nosniff")
		
		// Enable XSS protection
		c.Header("X-XSS-Protection", "1; mode=block")
		
		// Prevent clickjacking
		c.Header("X-Frame-Options", "DENY")
		
		// Enforce HTTPS (only in production)
		if gin.Mode() == gin.ReleaseMode {
			c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		}
		
		// Content Security Policy (basic)
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'")
		
		// Referrer policy
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		
		// Permissions policy (formerly Feature Policy)
		c.Header("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		
		c.Next()
	}
}

// NoCache creates a middleware that adds no-cache headers for sensitive endpoints
func NoCache() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.Header("Expires", "0")
		c.Next()
	}
}

// Timeout creates a middleware that enforces request timeouts
func Timeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Create a context with timeout
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()
		
		// Replace the request context
		c.Request = c.Request.WithContext(ctx)
		
		// Channel to signal when processing is done
		done := make(chan struct{})
		
		go func() {
			c.Next()
			close(done)
		}()
		
		select {
		case <-done:
			// Request completed normally
			return
		case <-ctx.Done():
			// Request timed out
			logger := GetLogger(c)
			correlationID := GetCorrelationID(c)
			
			logger.Warn("Request timeout",
				zap.String("event", "request_timeout"),
				zap.Duration("timeout", timeout),
				zap.String("path", c.Request.URL.Path),
				zap.String("method", c.Request.Method),
			)
			
			c.JSON(http.StatusRequestTimeout, gin.H{
				"code":           "REQUEST_TIMEOUT",
				"message":        "Request processing timed out",
				"correlation_id": correlationID,
				"timestamp":      time.Now(),
				"path":           c.Request.URL.Path,
			})
			c.Abort()
		}
	}
}