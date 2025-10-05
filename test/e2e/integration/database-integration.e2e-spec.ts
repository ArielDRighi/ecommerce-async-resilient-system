import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { DataSource } from 'typeorm';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';
import { TestAppHelper, DatabaseHelper } from '../../helpers';

/**
 * Database Integration E2E Tests
 * Category: Integration Tests
 * Purpose: Test database connections, transactions, and data integrity
 */
describe('Database Integration (E2E)', () => {
  let app: INestApplication;
  let dbHelper: DatabaseHelper;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    dbHelper = new DatabaseHelper(app);
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    if (app) {
      await dbHelper.cleanDatabase();
      await TestAppHelper.closeApp(app);
    }
  });

  afterEach(async () => {
    // Clean up test data after each test
    try {
      // Delete test data in correct order (respecting foreign keys)
      await dataSource.query("DELETE FROM orders WHERE CAST(id AS TEXT) LIKE '00000000%'");
      await dataSource.query("DELETE FROM products WHERE CAST(id AS TEXT) LIKE '00000000%'");
      await dataSource.query("DELETE FROM users WHERE CAST(id AS TEXT) LIKE '00000000%'");
    } catch (error) {
      // Ignore cleanup errors
      if (error instanceof Error) {
        // eslint-disable-next-line no-console
        console.log('Cleanup warning:', error.message);
      }
    }
  });

  describe('Database Connection', () => {
    it('should establish database connection', async () => {
      expect(dataSource).toBeDefined();
      expect(dataSource.isInitialized).toBe(true);
    });

    it('should have all required entities registered', async () => {
      const metadata = dataSource.entityMetadatas;
      const entityNames = metadata.map((m) => m.name);

      expect(entityNames).toContain('User');
      expect(entityNames).toContain('Product');
      expect(entityNames).toContain('Order');
      expect(entityNames).toContain('OrderItem');
    });

    it('should execute raw queries successfully', async () => {
      const result = await dataSource.query('SELECT 1 as value');
      expect(result).toBeDefined();
      expect(result[0].value).toBe(1);
    });
  });

  describe('Transaction Management', () => {
    it('should commit transaction on success', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
          [
            '00000000-0000-0000-0000-000000000001',
            generateTestEmail(),
            'hashedpassword',
            'Test',
            'User',
          ],
        );

        await queryRunner.commitTransaction();

        const user = await queryRunner.manager.query('SELECT * FROM users WHERE id = $1', [
          '00000000-0000-0000-0000-000000000001',
        ]);

        expect(user).toBeDefined();
        expect(user.length).toBe(1);
      } finally {
        await queryRunner.release();
      }
    });

    it('should rollback transaction on error', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.manager.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
          [
            '00000000-0000-0000-0000-000000000002',
            generateTestEmail(),
            'hashedpassword',
            'Rollback',
            'User',
          ],
        );

        // Simulate error
        throw new Error('Simulated error');
      } catch (error) {
        await queryRunner.rollbackTransaction();
      } finally {
        await queryRunner.release();
      }

      // Verify rollback
      const user = await dataSource.query('SELECT * FROM users WHERE id = $1', [
        '00000000-0000-0000-0000-000000000002',
      ]);

      expect(user.length).toBe(0);
    });

    it('should handle nested transactions', async () => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        await queryRunner.startTransaction();

        await queryRunner.manager.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
          [
            '00000000-0000-0000-0000-000000000003',
            generateTestEmail(),
            'hashedpassword',
            'Nested',
            'User',
          ],
        );

        // Create savepoint (nested transaction)
        await queryRunner.manager.query('SAVEPOINT nested_txn');

        await queryRunner.manager.query(
          `INSERT INTO products (id, name, description, price, sku) VALUES ($1, $2, $3, $4, $5)`,
          [
            '00000000-0000-0000-0000-000000000004',
            'Test Product',
            'Description',
            99.99,
            generateTestSKU(),
          ],
        );

        // Rollback to savepoint
        await queryRunner.manager.query('ROLLBACK TO SAVEPOINT nested_txn');

        await queryRunner.commitTransaction();

        // User should exist
        const user = await dataSource.query('SELECT * FROM users WHERE id = $1', [
          '00000000-0000-0000-0000-000000000003',
        ]);
        expect(user.length).toBe(1);

        // Product should not exist (rolled back)
        const product = await dataSource.query('SELECT * FROM products WHERE id = $1', [
          '00000000-0000-0000-0000-000000000004',
        ]);
        expect(product.length).toBe(0);
      } finally {
        await queryRunner.release();
      }
    });
  });

  describe('Data Integrity', () => {
    it('should enforce foreign key constraints', async () => {
      // Try to insert order with non-existent user (using valid UUID format)
      await expect(
        dataSource.query(
          `INSERT INTO orders (id, user_id, status, total_amount) VALUES ($1, $2, $3, $4)`,
          [
            '00000000-0000-0000-0000-000000000005',
            '99999999-9999-9999-9999-999999999999',
            'PENDING',
            100,
          ],
        ),
      ).rejects.toThrow();
    });

    it('should enforce unique constraints', async () => {
      const email = generateTestEmail();

      await dataSource.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
        ['00000000-0000-0000-0000-000000000006', email, 'hashedpassword', 'Unique', 'User'],
      );

      // Try to insert duplicate email
      await expect(
        dataSource.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
          ['00000000-0000-0000-0000-000000000007', email, 'hashedpassword', 'Duplicate', 'User'],
        ),
      ).rejects.toThrow();
    });

    it('should enforce foreign key constraints', async () => {
      // Create user and order
      const userId = '00000000-0000-0000-0000-000000000008';
      const orderId = '00000000-0000-0000-0000-000000000009';

      await dataSource.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
        [userId, generateTestEmail(), 'hashedpassword', 'FK', 'User'],
      );

      await dataSource.query(
        `INSERT INTO orders (id, user_id, status, total_amount) VALUES ($1, $2, $3, $4)`,
        [orderId, userId, 'PENDING', 100],
      );

      // Try to delete user with existing orders - should fail due to FK constraint
      await expect(dataSource.query('DELETE FROM users WHERE id = $1', [userId])).rejects.toThrow();

      // Cleanup: Delete in correct order
      await dataSource.query('DELETE FROM orders WHERE id = $1', [orderId]);
      await dataSource.query('DELETE FROM users WHERE id = $1', [userId]);
    });
  });

  describe('Connection Pooling', () => {
    it('should handle multiple concurrent queries', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        dataSource.query(
          `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4, $5)`,
          [
            `00000000-0000-0000-000${i}-00000000000${i}`,
            `concurrent-${Date.now()}-${i}@test.com`,
            'hashedpassword',
            'Concurrent',
            `User${i}`,
          ],
        ),
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();

      const users = await dataSource.query(`SELECT * FROM users WHERE first_name = 'Concurrent'`);
      expect(users.length).toBe(10);
    });
  });

  describe('Query Performance', () => {
    it('should execute simple queries efficiently', async () => {
      const startTime = Date.now();

      await dataSource.query('SELECT * FROM users LIMIT 10');

      const executionTime = Date.now() - startTime;

      // Query should complete in less than 100ms
      expect(executionTime).toBeLessThan(100);
    });

    it('should handle batch inserts efficiently', async () => {
      const startTime = Date.now();
      const timestamp = Date.now();

      const values = Array.from(
        { length: 100 },
        (_, i) =>
          `('00000000-0000-0000-${i.toString().padStart(4, '0')}-000000000000', 'batch-${timestamp}-${i}@test.com', 'hashedpassword', 'Batch', 'User${i}')`,
      );

      await dataSource.query(
        `INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ${values.join(', ')}`,
      );

      const executionTime = Date.now() - startTime;

      // Batch insert should complete in less than 500ms
      expect(executionTime).toBeLessThan(500);

      const users = await dataSource.query(`SELECT * FROM users WHERE first_name = 'Batch'`);
      expect(users.length).toBe(100);
    });
  });
});
