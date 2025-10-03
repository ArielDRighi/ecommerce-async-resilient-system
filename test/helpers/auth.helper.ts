import request from 'supertest';
import { INestApplication } from '@nestjs/common';

/**
 * Datos de respuesta de autenticación
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
  };
}

/**
 * Helper para operaciones de autenticación en tests E2E
 */
export class AuthHelper {
  constructor(private readonly app: INestApplication) {}

  /**
   * Registra un nuevo usuario y retorna los tokens
   */
  async registerUser(userData?: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<AuthTokens> {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);

    const defaultData = {
      email: userData?.email || `test-${timestamp}-${randomStr}@example.com`,
      password: userData?.password || 'Test1234!',
      firstName: userData?.firstName || 'Test',
      lastName: userData?.lastName || 'User',
    };

    const response = await request(this.app.getHttpServer())
      .post('/auth/register')
      .send(defaultData)
      .expect(201);

    return response.body.data;
  }

  /**
   * Realiza login y retorna los tokens
   */
  async loginUser(email: string, password: string): Promise<AuthTokens> {
    const response = await request(this.app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    return response.body.data;
  }

  /**
   * Refresca el access token usando el refresh token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const response = await request(this.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    return response.body.data;
  }

  /**
   * Obtiene el perfil del usuario autenticado
   */
  async getProfile(accessToken: string) {
    const response = await request(this.app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    return response.body.data;
  }

  /**
   * Crea un usuario de test completo con credenciales conocidas
   * Útil para múltiples tests que necesitan el mismo usuario
   */
  async createTestUser(): Promise<{
    tokens: AuthTokens;
    credentials: { email: string; password: string };
  }> {
    const credentials = {
      email: `testuser-${Date.now()}@example.com`,
      password: 'TestPassword123!',
    };

    const tokens = await this.registerUser({
      email: credentials.email,
      password: credentials.password,
      firstName: 'E2E',
      lastName: 'TestUser',
    });

    return { tokens, credentials };
  }
}
