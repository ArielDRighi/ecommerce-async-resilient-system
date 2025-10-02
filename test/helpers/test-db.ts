import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';

/**
 * Test Database Helpers
 * Utilities for managing database state in tests
 */

/**
 * Clean up all database tables respecting foreign key constraints
 * Use this in afterEach to ensure test isolation
 */
export async function cleanupDatabase(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;

  // Disable foreign key checks temporarily
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0;');

  try {
    // Clear all tables in reverse order to respect dependencies
    for (const entity of entities.reverse()) {
      const repository = dataSource.getRepository(entity.name);
      await repository.clear();
    }
  } finally {
    // Re-enable foreign key checks
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1;');
  }
}

/**
 * Clean up database for PostgreSQL
 * Use this version for PostgreSQL databases
 */
export async function cleanupDatabasePostgres(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;

  // Get all table names
  const tableNames = entities.map((entity) => `"${entity.tableName}"`).join(', ');

  if (tableNames) {
    // Truncate all tables at once (faster for PostgreSQL)
    await dataSource.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
  }
}

/**
 * Setup test database
 * Initialize database schema and seed initial data if needed
 */
export async function setupTestDatabase(dataSource: DataSource): Promise<void> {
  // Drop and recreate schema
  await dataSource.synchronize(true);
}

/**
 * Teardown test database
 * Close all database connections
 */
export async function teardownTestDatabase(dataSource: DataSource): Promise<void> {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}

/**
 * Get database connection from NestJS app
 */
export function getDataSource(app: INestApplication): DataSource {
  return app.get(DataSource);
}

/**
 * Execute in transaction and rollback
 * Useful for tests that need database but shouldn't persist changes
 */
export async function runInTransaction<T>(
  dataSource: DataSource,
  callback: () => Promise<T>,
): Promise<T> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const result = await callback();
    return result;
  } finally {
    await queryRunner.rollbackTransaction();
    await queryRunner.release();
  }
}

/**
 * Check if database is ready
 */
export async function isDatabaseReady(dataSource: DataSource): Promise<boolean> {
  try {
    await dataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for database to be ready
 * Useful for E2E tests that need to wait for container startup
 */
export async function waitForDatabase(
  dataSource: DataSource,
  maxAttempts = 30,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await isDatabaseReady(dataSource)) {
      return;
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Database did not become ready in time');
}
