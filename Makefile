# Order Processor Makefile
# Enhanced commands for build, test, documentation, and deployment

.PHONY: help build build-api build-worker test test-unit test-integration clean docker-build docker-build-api docker-build-worker docs-generate docs-serve logs-clean run-api run-worker dev deps deps-dev format lint vet security-scan coverage mod-tidy mod-download install-tools

# Variables
APP_NAME := order-processor
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "1.0.0")
BUILD_TIME := $(shell date -u '+%Y-%m-%d_%H:%M:%S')
GIT_COMMIT := $(shell git rev-parse HEAD 2>/dev/null || echo "unknown")
GO_VERSION := $(shell go version | cut -d' ' -f3)

# Build variables
LDFLAGS := -ldflags "-X main.Version=$(VERSION) -X main.BuildTime=$(BUILD_TIME) -X main.GitCommit=$(GIT_COMMIT)"
BUILD_DIR := ./bin
DOCKER_IMAGE_API := $(APP_NAME)-api
DOCKER_IMAGE_WORKER := $(APP_NAME)-worker
DOCKER_TAG := $(VERSION)

# Go build flags
GOFLAGS := -mod=readonly
CGO_ENABLED := 0

# Default target
help: ## Show this help message
	@echo 'Management commands for $(APP_NAME):'
	@echo ''
	@echo 'Usage:'
	@echo '    make build           Build all binaries'
	@echo '    make test            Run all tests'
	@echo '    make docker-build    Build Docker images'
	@echo '    make docs-generate   Generate API documentation'
	@echo '    make run-api         Run API service locally'
	@echo '    make run-worker      Run Worker service locally'
	@echo '    make dev             Run in development mode'
	@echo '    make clean           Clean build artifacts'
	@echo '    make help            Show this help message'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "    %-20s %s\n", $$1, $$2}'

# Build targets
build: build-api build-worker ## Build all binaries

build-api: ## Build API service binary
	@echo "Building API service..."
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=amd64 go build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/api-linux ./cmd/api
	CGO_ENABLED=$(CGO_ENABLED) GOOS=windows GOARCH=amd64 go build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/api-windows.exe ./cmd/api
	CGO_ENABLED=$(CGO_ENABLED) go build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/api ./cmd/api
	@echo "API service built successfully"

build-worker: ## Build Worker service binary
	@echo "Building Worker service..."
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=linux GOARCH=amd64 go build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/worker-linux ./cmd/worker
	CGO_ENABLED=$(CGO_ENABLED) GOOS=windows GOARCH=amd64 go build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/worker-windows.exe ./cmd/worker
	CGO_ENABLED=$(CGO_ENABLED) go build $(GOFLAGS) $(LDFLAGS) -o $(BUILD_DIR)/worker ./cmd/worker
	@echo "Worker service built successfully"

# Test targets
test: test-unit test-integration ## Run all tests

test-unit: ## Run unit tests
	@echo "Running unit tests..."
	go test -v -race -timeout=300s -coverprofile=coverage.out ./...
	@echo "Unit tests completed"

test-ci: ## Run tests for CI (reserved for future CI/CD setup)
	@echo "Running CI tests..."
	@echo "Note: Full CI/CD will be configured after Task 3-4"
	@go test -v -race -coverprofile=coverage.out -covermode=atomic ./...
	@echo "CI tests completed"

test-integration: ## Run integration tests
	@echo "Running integration tests..."
	go test -v -race -timeout=600s -tags=integration ./tests/integration/...
	@echo "Integration tests completed"

coverage: test-unit ## Generate test coverage report
	@echo "Generating coverage report..."
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report generated: coverage.html"

# Development targets
dev: ## Run in development mode with hot reload
	@echo "Starting development mode..."
	@echo "Make sure to set ORDER_LOGGER_ENVIRONMENT=development"
	ORDER_LOGGER_ENVIRONMENT=development go run ./cmd/api &
	ORDER_LOGGER_ENVIRONMENT=development go run ./cmd/worker

run-api: ## Run API service locally
	@echo "Starting API service..."
	go run ./cmd/api

run-worker: ## Run Worker service locally
	@echo "Starting Worker service..."
	go run ./cmd/worker

# Docker targets
docker-build: docker-build-api docker-build-worker ## Build all Docker images

docker-build-api: ## Build API service Docker image
	@echo "Building API Docker image..."
	docker build -f docker/Dockerfile.api -t $(DOCKER_IMAGE_API):$(DOCKER_TAG) -t $(DOCKER_IMAGE_API):latest .
	@echo "API Docker image built: $(DOCKER_IMAGE_API):$(DOCKER_TAG)"

docker-build-worker: ## Build Worker service Docker image
	@echo "Building Worker Docker image..."
	docker build -f docker/Dockerfile.worker -t $(DOCKER_IMAGE_WORKER):$(DOCKER_TAG) -t $(DOCKER_IMAGE_WORKER):latest .
	@echo "Worker Docker image built: $(DOCKER_IMAGE_WORKER):$(DOCKER_TAG)"

docker-compose-up: ## Start all services with docker-compose
	@echo "Starting services with docker-compose..."
	docker-compose -f docker/docker-compose.yml up -d
	@echo "Services started"

docker-compose-down: ## Stop all services with docker-compose
	@echo "Stopping services with docker-compose..."
	docker-compose -f docker/docker-compose.yml down
	@echo "Services stopped"

# Documentation targets
docs-generate: install-tools ## Generate API documentation with Swagger
	@echo "Generating API documentation..."
	swag init -g ./internal/handler/http/handlers.go -o ./docs/swagger --parseDependency --parseInternal
	@echo "API documentation generated in ./docs/swagger"

docs-serve: docs-generate ## Serve documentation locally
	@echo "Serving documentation at http://localhost:8081"
	@echo "Press Ctrl+C to stop"
	@cd docs && python3 -m http.server 8081 2>/dev/null || python -m SimpleHTTPServer 8081

# Dependency management
deps: ## Download and verify dependencies
	@echo "Downloading dependencies..."
	go mod download
	go mod verify
	@echo "Dependencies downloaded and verified"

deps-dev: deps install-tools ## Install development dependencies
	@echo "Installing development dependencies..."
	go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	go install github.com/securecodewarrior/sast-scan/cmd/sast-scan@latest
	@echo "Development dependencies installed"

mod-tidy: ## Tidy and verify module dependencies
	@echo "Tidying module dependencies..."
	go mod tidy
	go mod verify
	@echo "Module dependencies tidied"

mod-download: ## Download module dependencies
	@echo "Downloading module dependencies..."
	go mod download
	@echo "Module dependencies downloaded"

# Code quality targets
format: ## Format Go code
	@echo "Formatting code..."
	go fmt ./...
	@echo "Code formatted"

lint: install-tools ## Run linting
	@echo "Running linter..."
	golangci-lint run ./...
	@echo "Linting completed"

vet: ## Run go vet
	@echo "Running go vet..."
	go vet ./...
	@echo "Go vet completed"

security-scan: install-tools ## Run security scan
	@echo "Running security scan..."
	gosec ./...
	@echo "Security scan completed"

# Utility targets
clean: ## Clean build artifacts and logs
	@echo "Cleaning build artifacts..."
	rm -rf $(BUILD_DIR)
	rm -f coverage.out coverage.html
	@echo "Cleaning rotated logs..."
	find logs -name "*.log.*" -type f -delete 2>/dev/null || true
	find logs -name "*.gz" -type f -delete 2>/dev/null || true
	@echo "Clean completed"

logs-clean: ## Clean rotated log files
	@echo "Cleaning rotated logs..."
	find logs -name "*.log.*" -type f -delete 2>/dev/null || true
	find logs -name "*.gz" -type f -delete 2>/dev/null || true
	@echo "Rotated logs cleaned"

install-tools: ## Install required development tools
	@echo "Installing development tools..."
	@which swag > /dev/null || go install github.com/swaggo/swag/cmd/swag@latest
	@which golangci-lint > /dev/null || go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@which gosec > /dev/null || go install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest
	@echo "Development tools installed"

# Info targets
version: ## Show version information
	@echo "Application: $(APP_NAME)"
	@echo "Version: $(VERSION)"
	@echo "Build Time: $(BUILD_TIME)"
	@echo "Git Commit: $(GIT_COMMIT)"
	@echo "Go Version: $(GO_VERSION)"

env-check: ## Check environment setup
	@echo "Checking environment setup..."
	@echo "Go version: $(shell go version)"
	@echo "Docker version: $(shell docker --version 2>/dev/null || echo 'Docker not installed')"
	@echo "Make version: $(shell make --version | head -n1)"
	@echo "Current directory: $(shell pwd)"
	@echo "GOPATH: $(GOPATH)"
	@echo "GOROOT: $(GOROOT)"
	@echo ""
	@echo "Required tools:"
	@which swag > /dev/null && echo "✓ swag installed" || echo "✗ swag not installed (run: make install-tools)"
	@which golangci-lint > /dev/null && echo "✓ golangci-lint installed" || echo "✗ golangci-lint not installed (run: make deps-dev)"
	@which gosec > /dev/null && echo "✓ gosec installed" || echo "✗ gosec not installed (run: make deps-dev)"

# Database migration targets (placeholder for future implementation)
migrate-up: ## Run database migrations up
	@echo "Database migrations not implemented yet"

migrate-down: ## Run database migrations down
	@echo "Database migrations not implemented yet"

migrate-status: ## Show migration status
	@echo "Database migrations not implemented yet"

# Performance testing targets (placeholder for future implementation)
bench: ## Run benchmark tests
	@echo "Running benchmark tests..."
	go test -bench=. -benchmem ./...

load-test: ## Run load tests (requires external tools)
	@echo "Load testing not implemented yet"