/**
 * Global setup for E2E tests
 * Runs once before all test suites
 */

export default async () => {
  // Set test environment
  process.env['NODE_ENV'] = 'test';

  // Configure test database - use CI environment variables if available
  const dbHost = process.env['DATABASE_HOST'] || 'localhost';
  const dbPort = process.env['DATABASE_PORT'] || '5433';
  const dbName = process.env['DATABASE_NAME'] || 'test_ecommerce';
  const dbUser = process.env['DATABASE_USER'] || 'test';
  const dbPassword = process.env['DATABASE_PASSWORD'] || 'test';

  process.env['DATABASE_URL'] =
    process.env['TEST_DATABASE_URL'] ||
    `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  // Redis de testing (usar instancia de desarrollo)
  const redisHost = process.env['REDIS_HOST'] || 'localhost';
  const redisPort = process.env['REDIS_PORT'] || '6379';
  process.env['REDIS_URL'] =
    process.env['TEST_REDIS_URL'] || `redis://${redisHost}:${redisPort}`;

  // Configure JWT secrets
  process.env['JWT_SECRET'] = 'test-jwt-secret-key-e2e';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-key-e2e';
  process.env['JWT_EXPIRATION'] = '1h';
  process.env['JWT_REFRESH_EXPIRATION'] = '7d';

  // Disable external services in tests
  process.env['DISABLE_EXTERNAL_SERVICES'] = 'true';

  // eslint-disable-next-line no-console
  console.log('\n🧪 E2E Test Suite - Global Setup');
  // eslint-disable-next-line no-console
  console.log('=====================================');
  // eslint-disable-next-line no-console
  console.log('Environment: test');
  // eslint-disable-next-line no-console
  console.log('Database:', process.env['DATABASE_URL']);
  // eslint-disable-next-line no-console
  console.log('Redis:', process.env['REDIS_URL']);
  // eslint-disable-next-line no-console
  console.log('=====================================\n');
};
