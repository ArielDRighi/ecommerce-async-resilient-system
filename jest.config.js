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
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
    // Critical modules require higher coverage
    // Commented out for now - will be enabled as we improve coverage
    // '**/src/modules/auth/**/*.ts': {
    //   branches: 95,
    //   functions: 95,
    //   lines: 95,
    //   statements: 95,
    // },
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../test/config/setup-after-env.ts'],

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
