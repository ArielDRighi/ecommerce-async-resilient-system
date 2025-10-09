import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';

/**
 * Helper para operaciones de base de datos en tests E2E
 * Incluye funciones para limpiar datos de test
 */
export class DatabaseHelper {
  private dataSource: DataSource;

  constructor(app: INestApplication) {
    this.dataSource = app.get(DataSource);
  }

  /**
   * Limpia todas las tablas relacionadas con tests
   * IMPORTANTE: Ejecutar en afterEach o afterAll
   */
  async cleanDatabase(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Deshabilitar foreign keys temporalmente
      await queryRunner.query('SET session_replication_role = replica;');

      // Limpiar tablas en orden inverso a las dependencias
      await queryRunner.query('DELETE FROM "order_items" WHERE 1=1;');
      await queryRunner.query('DELETE FROM "orders" WHERE 1=1;');

      // Solo eliminar stock_movements si existe la tabla
      const stockMovementsExists = await queryRunner.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'stock_movements');`,
      );
      if (stockMovementsExists[0].exists) {
        await queryRunner.query('DELETE FROM "stock_movements" WHERE 1=1;');
      }

      await queryRunner.query('DELETE FROM "inventory" WHERE 1=1;');
      await queryRunner.query('DELETE FROM "products" WHERE 1=1;');
      await queryRunner.query('DELETE FROM "categories" WHERE 1=1;');
      await queryRunner.query('DELETE FROM "users" WHERE 1=1;');

      // Rehabilitar foreign keys
      await queryRunner.query('SET session_replication_role = DEFAULT;');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Limpia solo datos de un usuario específico
   * Útil para tests aislados
   */
  async cleanUserData(userId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query('SET session_replication_role = replica;');

      // Limpiar datos del usuario
      await queryRunner.query(
        'DELETE FROM "order_items" WHERE "orderId" IN (SELECT id FROM "orders" WHERE "userId" = $1);',
        [userId],
      );
      await queryRunner.query('DELETE FROM "orders" WHERE "userId" = $1;', [userId]);
      await queryRunner.query('DELETE FROM "users" WHERE id = $1;', [userId]);

      await queryRunner.query('SET session_replication_role = DEFAULT;');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Limpia solo productos de test
   */
  async cleanTestProducts(): Promise<void> {
    await this.dataSource.query('DELETE FROM "products" WHERE "sku" LIKE \'TEST-%\';');
  }

  /**
   * Verifica conexión a la base de datos
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Limpia tablas específicas para tests E2E
   * @param tables - Lista de nombres de tablas a limpiar
   */
  async cleanTables(tables: string[]): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query('SET session_replication_role = replica;');

      for (const table of tables) {
        // Verificar si la tabla existe antes de intentar limpiarla
        const tableExists = await queryRunner.query(
          `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1);`,
          [table],
        );

        if (tableExists[0].exists) {
          await queryRunner.query(`DELETE FROM "${table}" WHERE 1=1;`);
        }
      }

      await queryRunner.query('SET session_replication_role = DEFAULT;');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Trunca todas las tablas (más rápido que DELETE)
   * CUIDADO: Esto es irreversible
   */
  async truncateAllTables(): Promise<void> {
    const entities = this.dataSource.entityMetadatas;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query('SET session_replication_role = replica;');

      for (const entity of entities) {
        await queryRunner.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
      }

      await queryRunner.query('SET session_replication_role = DEFAULT;');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Obtiene el DataSource para operaciones avanzadas
   */
  getDataSource(): DataSource {
    return this.dataSource;
  }
}
