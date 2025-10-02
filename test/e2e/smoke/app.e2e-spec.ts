import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import request from 'supertest';
import { AppController } from '../../../src/app.controller';
import { AppService } from '../../../src/app.service';
import { HealthController } from '../../../src/health/health.controller';
import { HealthService } from '../../../src/health/health.service';
import { TestHealthService } from '../../helpers/test-health.service';

interface TestResponse {
  body: Record<string, unknown>;
}

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env.example'],
        }),
        // Use in-memory SQLite for testing
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [],
          synchronize: true,
          dropSchema: true,
        }),
        TerminusModule,
      ],
      controllers: [AppController, HealthController],
      providers: [
        AppService,
        {
          provide: HealthService,
          useClass: TestHealthService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET) - should return app information', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res: TestResponse) => {
        expect(res.body).toHaveProperty('name');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('environment');
        expect(res.body).toHaveProperty('status');
        expect(res.body['status']).toBe('running');
      });
  });

  it('/health/live (GET) - should return liveness status', () => {
    return request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect((res: TestResponse) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body['status']).toBe('ok');
      });
  });
});
