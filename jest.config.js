module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Unit Tests',

  // Root directory for tests
  rootDir: 'src',

  // Test matching patterns
  testMatch: ['<rootDir>/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/'],

  // Module configuration
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  // Transform configuration
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },

  // Coverage configuration
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/*.enum.ts',
    '!**/*.config.ts',
    '!**/index.ts',
    '!main.ts',
    '!test/**',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json'],

  // Coverage thresholds - Quality Gates
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    // Critical modules require 95%+ coverage
    '**/src/modules/auth/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    '**/src/modules/orders/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    '**/src/modules/payments/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    '**/src/modules/inventory/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    '**/src/modules/events/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../test/config/setup.ts'],

  // Test timeout
  testTimeout: 30000,

  // Performance
  maxWorkers: '50%',

  // Verbose output
  verbose: true,

  // Detect open handles and memory leaks
  detectOpenHandles: false,
  forceExit: false,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
