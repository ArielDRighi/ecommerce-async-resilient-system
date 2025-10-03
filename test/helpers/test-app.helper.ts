import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { WinstonLoggerService } from '../../src/common/utils/winston-logger.service';

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
}
