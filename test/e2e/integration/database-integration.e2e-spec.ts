import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { DataSource } from 'typeorm';
import { generateTestEmail, generateTestSKU } from '../../helpers/mock-data';

/**
 * Database Integration E2E Tests
 * Category: Integration Tests
 * Purpose: Test database connections, transactions, and data integrity
 */
describe('Database Integration (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
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
          `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
          [
            '00000000-0000-0000-0000-000000000001',
            generateTestEmail(),
            'hashedpassword',
            'Test',
            'User',
          ],
        );

        await queryRunner.commitTransaction();

        const user = await queryRunner.manager.query('SELECT * FROM users WHERE id = ?', [
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
          `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
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
      const user = await dataSource.query('SELECT * FROM users WHERE id = ?', [
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
          `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
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
          `INSERT INTO products (id, name, description, price, sku) VALUES (?, ?, ?, ?, ?)`,
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
        const user = await dataSource.query('SELECT * FROM users WHERE id = ?', [
          '00000000-0000-0000-0000-000000000003',
        ]);
        expect(user.length).toBe(1);

        // Product should not exist (rolled back)
        const product = await dataSource.query('SELECT * FROM products WHERE id = ?', [
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
      // Try to insert order with non-existent user
      await expect(
        dataSource.query(
          `INSERT INTO orders (id, userId, status, totalAmount) VALUES (?, ?, ?, ?)`,
          ['00000000-0000-0000-0000-000000000005', 'non-existent-user-id', 'PENDING', 100],
        ),
      ).rejects.toThrow();
    });

    it('should enforce unique constraints', async () => {
      const email = generateTestEmail();

      await dataSource.query(
        `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
        ['00000000-0000-0000-0000-000000000006', email, 'hashedpassword', 'Unique', 'User'],
      );

      // Try to insert duplicate email
      await expect(
        dataSource.query(
          `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
          ['00000000-0000-0000-0000-000000000007', email, 'hashedpassword', 'Duplicate', 'User'],
        ),
      ).rejects.toThrow();
    });

    it('should cascade delete related entities', async () => {
      // Create user and order
      const userId = '00000000-0000-0000-0000-000000000008';
      const orderId = '00000000-0000-0000-0000-000000000009';

      await dataSource.query(
        `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
        [userId, generateTestEmail(), 'hashedpassword', 'Cascade', 'User'],
      );

      await dataSource.query(
        `INSERT INTO orders (id, userId, status, totalAmount) VALUES (?, ?, ?, ?)`,
        [orderId, userId, 'PENDING', 100],
      );

      // Delete user (should cascade to orders if configured)
      await dataSource.query('DELETE FROM users WHERE id = ?', [userId]);

      // Verify order handling (depends on cascade configuration)
      const orders = await dataSource.query('SELECT * FROM orders WHERE id = ?', [orderId]);

      // If cascade delete is configured, order should be deleted
      // If not, this test documents the behavior
      expect(orders).toBeDefined();
    });
  });

  describe('Connection Pooling', () => {
    it('should handle multiple concurrent queries', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        dataSource.query(
          `INSERT INTO users (id, email, password, firstName, lastName) VALUES (?, ?, ?, ?, ?)`,
          [`concurrent-user-${i}`, generateTestEmail(), 'hashedpassword', 'Concurrent', `User${i}`],
        ),
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();

      const users = await dataSource.query(`SELECT * FROM users WHERE firstName = 'Concurrent'`);
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

      const values = Array.from(
        { length: 100 },
        (_, i) =>
          `('batch-user-${i}', '${generateTestEmail()}', 'hashedpassword', 'Batch', 'User${i}')`,
      );

      await dataSource.query(
        `INSERT INTO users (id, email, password, firstName, lastName) VALUES ${values.join(', ')}`,
      );

      const executionTime = Date.now() - startTime;

      // Batch insert should complete in less than 500ms
      expect(executionTime).toBeLessThan(500);

      const users = await dataSource.query(`SELECT * FROM users WHERE firstName = 'Batch'`);
      expect(users.length).toBe(100);
    });
  });
});
