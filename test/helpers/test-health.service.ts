import { Injectable } from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';

@Injectable()
export class TestHealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @HealthCheck()
  check() {
    return this.health.check([
      // Database health check
      () => this.db.pingCheck('database'),
      // Memory health check - should not exceed 150MB
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
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
    return this.health.check([
      // Basic checks for liveness - more generous memory limit for tests
      () => this.memory.checkHeap('memory_heap', 500 * 1024 * 1024), // 500MB limit
    ]);
  }
}
