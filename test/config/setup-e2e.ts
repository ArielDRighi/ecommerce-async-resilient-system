/**
 * Global setup for E2E tests
 * This file is executed before all E2E tests
 */

// Set test environment
process.env['NODE_ENV'] = 'test';

// Configure test database URL
process.env['DATABASE_URL'] =
  process.env['TEST_DATABASE_URL'] || 'postgresql://test:test@localhost:5433/test_ecommerce';

// Configure test Redis URL
process.env['REDIS_URL'] = process.env['TEST_REDIS_URL'] || 'redis://localhost:6380';

// Configure JWT secrets for testing
process.env['JWT_SECRET'] = process.env['JWT_SECRET'] || 'test-jwt-secret-key';
process.env['JWT_REFRESH_SECRET'] = process.env['JWT_REFRESH_SECRET'] || 'test-refresh-secret-key';

// Disable external services in tests
process.env['DISABLE_EXTERNAL_SERVICES'] = 'true';

// Set timeout for E2E tests
jest.setTimeout(60000);

// Global beforeAll hook
beforeAll(async () => {
  // Global E2E setup can go here
  // eslint-disable-next-line no-console
  console.log('🧪 Starting E2E Test Suite...');
});

// Global afterAll hook
afterAll(async () => {
  // Global E2E cleanup can go here
  // eslint-disable-next-line no-console
  console.log('✅ E2E Test Suite Completed');
});
