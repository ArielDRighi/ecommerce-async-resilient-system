import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { WinstonLoggerService } from '../../src/common/utils/winston-logger.service';
import { QueueService } from '../../src/queues/queue.service';

/**
 * Helper para crear y configurar la aplicación NestJS para tests E2E
 * Usa la configuración EXACTA de main.ts
 */
export class TestAppHelper {
  /**
   * Crea y configura una nueva instancia de la aplicación
   */
  static async createApp(): Promise<INestApplication> {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const app = moduleFixture.createNestApplication();

    // Configurar ValidationPipe (igual que en main.ts)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    // Configurar filtros globales (necesita WinstonLoggerService)
    const logger = app.get(WinstonLoggerService);
    app.useGlobalFilters(new AllExceptionsFilter(logger));

    // Configurar interceptores globales
    app.useGlobalInterceptors(new ResponseInterceptor());

    await app.init();

    return app;
  }

  /**
   * Cierra la aplicación de manera segura, esperando a que terminen los jobs de cola
   * Esto previene errores "Driver not Connected" por sagas que continúan ejecutándose
   *
   * @param app - Instancia de la aplicación NestJS
   * @param timeout - Tiempo máximo de espera en milisegundos (default: 10000ms)
   */
  static async closeApp(app: INestApplication, timeout: number = 10000): Promise<void> {
    try {
      const queueService = app.get(QueueService);
      await queueService.waitForActiveJobs(timeout);
    } catch (error) {
      // Si falla obtener QueueService o waitForActiveJobs, solo loguear warning
      console.warn(
        'Warning: Could not wait for queue jobs:',
        error instanceof Error ? error.message : String(error),
      );
    }

    await app.close();
  }
}
