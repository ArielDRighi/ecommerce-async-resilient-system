/**
 * Global setup for unit tests
 * This file is executed before all unit tests
 */

// Set test environment
process.env['NODE_ENV'] = 'test';

// Configure test timeouts
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests (optional)
// Uncomment if you want cleaner test output
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
