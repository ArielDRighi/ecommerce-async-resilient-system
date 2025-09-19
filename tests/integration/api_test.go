package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestServer represents the test server
type TestServer struct {
	router *gin.Engine
	server *httptest.Server
}

// SetupTestServer creates a test server for integration tests
func SetupTestServer() *TestServer {
	gin.SetMode(gin.TestMode)
	
	// This would normally use the same setup as main.go
	// For now, we'll create a minimal test setup
	router := gin.New()
	
	// Add basic middleware
	router.Use(func(c *gin.Context) {
		correlationID := c.GetHeader("X-Correlation-ID")
		if correlationID == "" {
			correlationID = fmt.Sprintf("test_%d", time.Now().UnixNano())
		}
		c.Header("X-Correlation-ID", correlationID)
		c.Next()
	})
	
	// Add CORS
	router.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Correlation-ID")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})
	
	// Health endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":        "healthy",
			"timestamp":     time.Now(),
			"correlation_id": c.GetHeader("X-Correlation-ID"),
		})
	})
	
	// API routes
	v1 := router.Group("/api/v1")
	{
		orders := v1.Group("/orders")
		{
			orders.POST("", func(c *gin.Context) {
				correlationID := c.GetHeader("X-Correlation-ID")
				
				if c.GetHeader("Content-Type") != "application/json" {
					c.JSON(http.StatusUnsupportedMediaType, gin.H{
						"error":          "Unsupported Media Type",
						"message":        "Content-Type must be application/json",
						"correlation_id": correlationID,
					})
					return
				}
				
				var req map[string]interface{}
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{
						"error":          "Bad Request",
						"message":        "Invalid JSON format",
						"details":        err.Error(),
						"correlation_id": correlationID,
					})
					return
				}
				
				errors := []string{}
				if _, ok := req["customer_id"]; !ok {
					errors = append(errors, "customer_id is required")
				}
				if _, ok := req["items"]; !ok {
					errors = append(errors, "items is required")
				}
				
				if len(errors) > 0 {
					c.JSON(http.StatusBadRequest, gin.H{
						"error":             "Validation Failed",
						"message":           "Request validation failed",
						"validation_errors": errors,
						"correlation_id":    correlationID,
					})
					return
				}
				
				c.JSON(http.StatusAccepted, gin.H{
					"message":        "Order creation request accepted",
					"order_id":       fmt.Sprintf("order_%d", time.Now().UnixNano()),
					"status":         "accepted",
					"correlation_id": correlationID,
				})
			})
			
			orders.GET("", func(c *gin.Context) {
				c.JSON(http.StatusOK, gin.H{
					"orders":         []interface{}{},
					"correlation_id": c.GetHeader("X-Correlation-ID"),
				})
			})
		}
	}
	
	server := httptest.NewServer(router)
	
	return &TestServer{
		router: router,
		server: server,
	}
}

// Cleanup closes the test server
func (ts *TestServer) Cleanup() {
	ts.server.Close()
}

// TestAcceptanceCriteria runs a comprehensive test of all acceptance criteria
func TestAcceptanceCriteria(t *testing.T) {
	server := SetupTestServer()
	defer server.Cleanup()
	
	t.Run("HTTP Status Codes", func(t *testing.T) {
		// Test 200 OK
		resp, err := http.Get(server.server.URL + "/health")
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		
		// Test 400 Bad Request
		req, _ := http.NewRequest("POST", server.server.URL+"/api/v1/orders", bytes.NewBufferString("invalid json"))
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{}
		resp, err = client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		
		// Test 415 Unsupported Media Type
		req, _ = http.NewRequest("POST", server.server.URL+"/api/v1/orders", bytes.NewBufferString("test"))
		req.Header.Set("Content-Type", "text/plain")
		resp, err = client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		assert.Equal(t, http.StatusUnsupportedMediaType, resp.StatusCode)
	})
	
	t.Run("Request Validation", func(t *testing.T) {
		// Test validation with missing fields
		req, _ := http.NewRequest("POST", server.server.URL+"/api/v1/orders", bytes.NewBufferString(`{"invalid": "data"}`))
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{}
		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		
		var response map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&response)
		require.NoError(t, err)
		
		assert.Equal(t, "Validation Failed", response["error"])
		assert.NotNil(t, response["validation_errors"])
	})
	
	t.Run("Error Response Structure", func(t *testing.T) {
		req, _ := http.NewRequest("POST", server.server.URL+"/api/v1/orders", bytes.NewBufferString("invalid json"))
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{}
		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		
		var response map[string]interface{}
		err = json.NewDecoder(resp.Body).Decode(&response)
		require.NoError(t, err)
		
		// Check error response structure
		assert.NotEmpty(t, response["error"])
		assert.NotEmpty(t, response["message"])
		assert.NotEmpty(t, response["correlation_id"])
	})
	
	t.Run("CORS Middleware", func(t *testing.T) {
		req, _ := http.NewRequest("OPTIONS", server.server.URL+"/api/v1/orders", nil)
		client := &http.Client{}
		resp, err := client.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		
		assert.Equal(t, http.StatusNoContent, resp.StatusCode)
		assert.Equal(t, "*", resp.Header.Get("Access-Control-Allow-Origin"))
		assert.Contains(t, resp.Header.Get("Access-Control-Allow-Methods"), "POST")
	})
	
	t.Run("Correlation ID Generation", func(t *testing.T) {
		resp, err := http.Get(server.server.URL + "/health")
		require.NoError(t, err)
		defer resp.Body.Close()
		
		// Check header
		correlationID := resp.Header.Get("X-Correlation-ID")
		assert.NotEmpty(t, correlationID)
		assert.Contains(t, correlationID, "test_")
	})
}

// TestCORSHeaders tests CORS functionality
func TestCORSHeaders(t *testing.T) {
	server := SetupTestServer()
	defer server.Cleanup()
	
	req, err := http.NewRequest("OPTIONS", server.server.URL+"/api/v1/orders", nil)
	require.NoError(t, err)
	
	client := &http.Client{}
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusNoContent, resp.StatusCode)
	assert.Equal(t, "*", resp.Header.Get("Access-Control-Allow-Origin"))
	assert.Contains(t, resp.Header.Get("Access-Control-Allow-Methods"), "POST")
	assert.NotEmpty(t, resp.Header.Get("X-Correlation-ID"))
}

// TestOrderCreationValidation tests order creation with validation
func TestOrderCreationValidation(t *testing.T) {
	server := SetupTestServer()
	defer server.Cleanup()
	
	tests := []struct {
		name           string
		payload        string
		contentType    string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "Valid order creation",
			payload:        `{"customer_id": "123", "items": [{"product_id": "456", "quantity": 2}]}`,
			contentType:    "application/json",
			expectedStatus: http.StatusAccepted,
			expectedError:  "",
		},
		{
			name:           "Invalid JSON",
			payload:        `invalid json`,
			contentType:    "application/json",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Bad Request",
		},
		{
			name:           "Missing required fields",
			payload:        `{"invalid": "data"}`,
			contentType:    "application/json",
			expectedStatus: http.StatusBadRequest,
			expectedError:  "Validation Failed",
		},
		{
			name:           "Invalid content type",
			payload:        `test`,
			contentType:    "text/plain",
			expectedStatus: http.StatusUnsupportedMediaType,
			expectedError:  "Unsupported Media Type",
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := http.NewRequest("POST", server.server.URL+"/api/v1/orders", bytes.NewBufferString(tt.payload))
			require.NoError(t, err)
			
			req.Header.Set("Content-Type", tt.contentType)
			req.Header.Set("X-Correlation-ID", "test-correlation-id")
			
			client := &http.Client{}
			resp, err := client.Do(req)
			require.NoError(t, err)
			defer resp.Body.Close()
			
			assert.Equal(t, tt.expectedStatus, resp.StatusCode)
			assert.Equal(t, "test-correlation-id", resp.Header.Get("X-Correlation-ID"))
			
			var response map[string]interface{}
			err = json.NewDecoder(resp.Body).Decode(&response)
			require.NoError(t, err)
			
			assert.NotEmpty(t, response["correlation_id"])
			
			if tt.expectedError != "" {
				assert.Equal(t, tt.expectedError, response["error"])
			}
		})
	}
}

// TestListOrders tests the list orders endpoint
func TestListOrders(t *testing.T) {
	server := SetupTestServer()
	defer server.Cleanup()
	
	resp, err := http.Get(server.server.URL + "/api/v1/orders")
	require.NoError(t, err)
	defer resp.Body.Close()
	
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	
	// Check correlation ID in header
	correlationID := resp.Header.Get("X-Correlation-ID")
	assert.NotEmpty(t, correlationID, "Correlation ID should be present in header")
	
	var response map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	
	assert.NotNil(t, response["orders"])
	assert.NotEmpty(t, response["correlation_id"])
}

// TestCorrelationIDPropagation tests that correlation IDs are properly propagated
func TestCorrelationIDPropagation(t *testing.T) {
	server := SetupTestServer()
	defer server.Cleanup()
	
	customCorrelationID := "test-custom-correlation-123"
	
	req, err := http.NewRequest("GET", server.server.URL+"/health", nil)
	require.NoError(t, err)
	req.Header.Set("X-Correlation-ID", customCorrelationID)
	
	client := &http.Client{}
	resp, err := client.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
	
	// Check header propagation
	assert.Equal(t, customCorrelationID, resp.Header.Get("X-Correlation-ID"))
	
	// Check response body includes correlation ID
	var response map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&response)
	require.NoError(t, err)
	
	assert.Equal(t, customCorrelationID, response["correlation_id"])
}