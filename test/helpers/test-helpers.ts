import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Test Helpers
 * Utility functions for testing
 */

// ============================================================================
// APPLICATION FACTORY
// ============================================================================

/**
 * Create a test NestJS application
 * Use this factory in E2E tests to create a fully configured app
 */
export async function createTestApp(
  imports: any[] = [],
  controllers: any[] = [],
  providers: any[] = [],
): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: ['.env.test', '.env.example'],
      }),
      // Use in-memory SQLite for simple tests
      TypeOrmModule.forRoot({
        type: 'sqlite',
        database: ':memory:',
        entities: [],
        synchronize: true,
        dropSchema: true,
      }),
      ...imports,
    ],
    controllers,
    providers,
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Apply global pipes and filters
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Note: AllExceptionsFilter requires logger, uncomment if needed
  // app.useGlobalFilters(new AllExceptionsFilter());

  await app.init();
  return app;
}

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Generate a JWT token for testing
 * Use this to create authentication tokens for protected endpoints
 */
export function generateAuthToken(
  payload: { sub: string; email: string },
  jwtService: JwtService,
): string {
  return jwtService.sign(payload);
}

/**
 * Get JWT token from response
 * Extract token from login/register response
 */
export function extractTokenFromResponse(response: request.Response): string {
  return response.body.data?.accessToken || response.body.accessToken || '';
}

/**
 * Create authorization header
 */
export function createAuthHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

/**
 * Make an authenticated request
 * Wrapper for supertest request with authentication
 */
export function makeAuthenticatedRequest(
  app: INestApplication,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  token: string,
  data?: any,
): request.Test {
  const agent = request(app.getHttpServer());
  let req: request.Test;

  switch (method) {
    case 'get':
      req = agent.get(url);
      break;
    case 'post':
      req = agent.post(url);
      break;
    case 'put':
      req = agent.put(url);
      break;
    case 'patch':
      req = agent.patch(url);
      break;
    case 'delete':
      req = agent.delete(url);
      break;
  }

  req.set('Authorization', `Bearer ${token}`);

  if (data && (method === 'post' || method === 'put' || method === 'patch')) {
    req.send(data);
  }

  return req;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Expect validation error
 * Helper to validate that a validation error was returned
 */
export function expectValidationError(response: request.Response, field?: string): void {
  expect(response.status).toBe(400);
  expect(response.body).toHaveProperty('success', false);
  expect(response.body).toHaveProperty('message');

  if (field) {
    const message = response.body.message;
    expect(
      Array.isArray(message)
        ? message.some((m: string) => m.includes(field))
        : message.includes(field),
    ).toBe(true);
  }
}

/**
 * Expect unauthorized error
 */
export function expectUnauthorizedError(response: request.Response): void {
  expect(response.status).toBe(401);
  expect(response.body).toHaveProperty('success', false);
}

/**
 * Expect forbidden error
 */
export function expectForbiddenError(response: request.Response): void {
  expect(response.status).toBe(403);
  expect(response.body).toHaveProperty('success', false);
}

/**
 * Expect not found error
 */
export function expectNotFoundError(response: request.Response): void {
  expect(response.status).toBe(404);
  expect(response.body).toHaveProperty('success', false);
}

/**
 * Expect conflict error
 */
export function expectConflictError(response: request.Response): void {
  expect(response.status).toBe(409);
  expect(response.body).toHaveProperty('success', false);
}

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

/**
 * Validate paginated response structure
 */
export function expectPaginatedResponse(response: request.Response, expectedLength?: number): void {
  expect(response.status).toBe(200);
  expect(response.body).toHaveProperty('success', true);
  expect(response.body).toHaveProperty('data');
  expect(response.body.data).toHaveProperty('data');
  expect(response.body.data).toHaveProperty('meta');
  expect(response.body.data.meta).toHaveProperty('page');
  expect(response.body.data.meta).toHaveProperty('limit');
  expect(response.body.data.meta).toHaveProperty('total');
  expect(response.body.data.meta).toHaveProperty('totalPages');
  expect(Array.isArray(response.body.data.data)).toBe(true);

  if (expectedLength !== undefined) {
    expect(response.body.data.data).toHaveLength(expectedLength);
  }
}

// ============================================================================
// ASYNC HELPERS
// ============================================================================

/**
 * Wait for a condition to be true
 * Useful for waiting for async operations
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for queue job to complete
 * Mock implementation - replace with actual queue checking in real tests
 */
export async function waitForQueueJob(
  queueName: string,
  jobId: string,
  _timeoutMs = 30000,
): Promise<void> {
  // This is a simplified version
  // In real implementation, you would check the actual queue/job status
  // TODO: Implement actual queue checking using Bull
  // For now, just wait a fixed amount of time
  void queueName; // Mark as used
  void jobId; // Mark as used
  await sleep(1000); // Simplified wait
}

// ============================================================================
// DATA HELPERS
// ============================================================================

/**
 * Generate random string
 */
export function randomString(length = 10): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Generate random number in range
 */
export function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random email
 */
export function randomEmail(): string {
  return `test-${randomString()}@example.com`;
}

/**
 * Generate random UUID (simplified)
 */
export function randomUUID(): string {
  return `${randomString(8)}-${randomString(4)}-${randomString(4)}-${randomString(4)}-${randomString(12)}`;
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Suppress console logs during tests
 * Useful for cleaner test output
 */
export function suppressConsoleLogs(): void {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
}

/**
 * Restore console logs after suppressing
 */
export function restoreConsoleLogs(): void {
  jest.restoreAllMocks();
}

/**
 * Measure execution time of async function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Retry async function with exponential backoff
 * Useful for flaky tests
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt < maxAttempts) {
        await sleep(delayMs * attempt); // Exponential backoff
      }
    }
  }

  throw lastError;
}
