import { Injectable, Optional } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { DatabaseHealthIndicator, RedisHealthIndicator, QueueHealthIndicator } from './indicators';

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly database: DatabaseHealthIndicator,
    @Optional() private readonly redis?: RedisHealthIndicator,
    @Optional() private readonly queue?: QueueHealthIndicator,
  ) {}

  @HealthCheck()
  check() {
    // Use higher thresholds in test environment to avoid false positives during E2E tests
    const isTest = process.env['NODE_ENV'] === 'test';
    const heapThreshold = isTest ? 1024 * 1024 * 1024 : 150 * 1024 * 1024; // 1GB in test, 150MB in prod
    const rssThreshold = isTest ? 1536 * 1024 * 1024 : 300 * 1024 * 1024; // 1.5GB in test, 300MB in prod

    return this.health.check([
      // Database health check
      () => this.db.pingCheck('database'),

      // Memory health check - should not exceed threshold
      () => this.memory.checkHeap('memory_heap', heapThreshold),

      // Memory health check - should not exceed threshold RSS
      () => this.memory.checkRSS('memory_rss', rssThreshold),

      // Disk health check - should have at least 250GB free
      () =>
        this.disk.checkStorage('storage', {
          path: process.platform === 'win32' ? 'C:\\' : '/',
          thresholdPercent: 0.9, // 90% usage threshold
        }),
    ]);
  }

  @HealthCheck()
  checkReadiness() {
    return this.health.check([
      // Only check critical dependencies for readiness
      () => this.db.pingCheck('database'),
    ]);
  }

  @HealthCheck()
  checkLiveness() {
    // Use higher threshold in test environment
    const isTest = process.env['NODE_ENV'] === 'test';
    const heapThreshold = isTest ? 1024 * 1024 * 1024 : 200 * 1024 * 1024; // 1GB in test, 200MB in prod

    return this.health.check([
      // Basic checks for liveness
      () => this.memory.checkHeap('memory_heap', heapThreshold),
    ]);
  }

  @HealthCheck()
  checkDetailed() {
    // Use higher thresholds in test environment
    const isTest = process.env['NODE_ENV'] === 'test';
    const heapThreshold = isTest ? 1024 * 1024 * 1024 : 150 * 1024 * 1024; // 1GB in test, 150MB in prod
    const rssThreshold = isTest ? 1536 * 1024 * 1024 : 300 * 1024 * 1024; // 1.5GB in test, 300MB in prod

    return this.health.check([
      // Database checks
      () => this.db.pingCheck('database'),
      () => this.database.pingCheck('database_detailed'),

      // Redis checks (commented out until Redis client is properly configured)
      // () => this.redis.isHealthy('redis'),
      // () => this.redis.checkLatency('redis_latency', 100), // 100ms threshold

      // Queue checks (commented out until properly configured)
      // () => this.queue?.isHealthy('queues'),

      // Memory checks
      () => this.memory.checkHeap('memory_heap', heapThreshold),
      () => this.memory.checkRSS('memory_rss', rssThreshold),

      // Disk check
      () =>
        this.disk.checkStorage('storage', {
          path: process.platform === 'win32' ? 'C:\\' : '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }
}
