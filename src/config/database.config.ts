import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env['DATABASE_HOST'] || 'localhost',
    port: parseInt(process.env['DATABASE_PORT'] || '5433', 10),
    username: process.env['DATABASE_USERNAME'] || process.env['DATABASE_USER'] || 'postgres',
    password: process.env['DATABASE_PASSWORD'] || 'password',
    database: process.env['DATABASE_NAME'] || 'ecommerce_async_dev',

    // Entity and Migration Paths
    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],

    // Migration Configuration
    synchronize: false, // Disabled to prevent TypeORM metadata issues
    migrationsRun: process.env['RUN_MIGRATIONS'] === 'true',
    migrationsTableName: 'migrations_history',

    // Logging Configuration
    logging: process.env['NODE_ENV'] === 'development' ? 'all' : ['error', 'warn'],
    logger: 'advanced-console',
    maxQueryExecutionTime: 10000, // Log slow queries (>10s)

    // Connection Pool Configuration
    extra: {
      max: parseInt(process.env['DATABASE_MAX_CONNECTIONS'] || '20', 10), // Maximum pool size
      min: parseInt(process.env['DATABASE_MIN_CONNECTIONS'] || '5', 10), // Minimum pool size
      acquireTimeoutMillis: parseInt(process.env['DATABASE_ACQUIRE_TIMEOUT'] || '30000', 10),
      idleTimeoutMillis: parseInt(process.env['DATABASE_IDLE_TIMEOUT'] || '30000', 10),
      reapIntervalMillis: parseInt(process.env['DATABASE_REAP_INTERVAL'] || '1000', 10),
      createTimeoutMillis: parseInt(process.env['DATABASE_CREATE_TIMEOUT'] || '30000', 10),
      destroyTimeoutMillis: parseInt(process.env['DATABASE_DESTROY_TIMEOUT'] || '5000', 10),
      createRetryIntervalMillis: parseInt(process.env['DATABASE_RETRY_INTERVAL'] || '200', 10),

      // Connection validation
      testOnBorrow: true,
      validationQuery: 'SELECT 1',
    },

    // SSL Configuration
    ssl:
      process.env['DATABASE_SSL'] === 'true'
        ? {
            rejectUnauthorized: false,
            ca: process.env['DATABASE_SSL_CA'],
            key: process.env['DATABASE_SSL_KEY'],
            cert: process.env['DATABASE_SSL_CERT'],
          }
        : false,

    // Retry and Error Handling
    retryAttempts: parseInt(process.env['DATABASE_RETRY_ATTEMPTS'] || '3', 10),
    retryDelay: parseInt(process.env['DATABASE_RETRY_DELAY'] || '3000', 10),

    // Performance and Cache (temporarily disabled for development)
    // cache: {
    //   type: 'redis',
    //   options: {
    //     host: process.env['REDIS_HOST'] || 'localhost',
    //     port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    //     password: process.env['REDIS_PASSWORD'],
    //     db: parseInt(process.env['REDIS_CACHE_DB'] || '1', 10),
    //   },
    //   duration: parseInt(process.env['DATABASE_CACHE_DURATION'] || '30000', 10), // 30 seconds
    // },

    // Additional TypeORM Options
    autoLoadEntities: true,
    keepConnectionAlive: true,
    dropSchema: process.env['NODE_ENV'] === 'test',
  }),
);

export const databaseTestConfig = registerAs(
  'database-test',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env['TEST_DATABASE_HOST'] || process.env['DATABASE_HOST'] || 'localhost',
    port: parseInt(process.env['TEST_DATABASE_PORT'] || process.env['DATABASE_PORT'] || '5432', 10),
    username:
      process.env['TEST_DATABASE_USERNAME'] ||
      process.env['DATABASE_USERNAME'] ||
      process.env['DATABASE_USER'] ||
      'postgres',
    password:
      process.env['TEST_DATABASE_PASSWORD'] || process.env['DATABASE_PASSWORD'] || 'password',
    database:
      process.env['TEST_DATABASE_NAME'] || process.env['DATABASE_NAME'] || 'ecommerce_async_test',

    entities: [__dirname + '/../modules/**/*.entity{.ts,.js}'],
    synchronize: true, // Always synchronize in test environment
    logging: false,
    dropSchema: true, // Reset database for each test run
    keepConnectionAlive: false,

    // Minimal pool for testing
    extra: {
      max: 5,
      min: 1,
    },
  }),
);
