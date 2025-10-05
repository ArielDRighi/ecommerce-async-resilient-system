import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables from the correct file
config({ path: `.env.${process.env['NODE_ENV'] || 'development'}` });

const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  host: configService.get('DATABASE_HOST', 'localhost'),
  port: configService.get('DATABASE_PORT', 5433),
  username:
    configService.get('DATABASE_USERNAME') || configService.get('DATABASE_USER') || 'postgres',
  password: configService.get('DATABASE_PASSWORD', 'password'),
  database: configService.get('DATABASE_NAME', 'ecommerce_async_dev'),

  entities: [
    join(__dirname, '..', 'modules', '**', 'entities', '*.entity{.ts,.js}'),
    join(__dirname, '..', 'modules', '**', '*.entity{.ts,.js}'),
  ],
  migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],

  synchronize: false, // Never use synchronize in production
  logging: configService.get('NODE_ENV') === 'development',
  migrationsTableName: 'migrations_history',

  ssl:
    configService.get('DATABASE_SSL') === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : false,
});
