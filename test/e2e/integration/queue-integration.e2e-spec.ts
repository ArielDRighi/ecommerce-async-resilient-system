import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';
import { sleep } from '../../helpers/test-helpers';

/**
 * Queue Integration E2E Tests
 * Category: Integration Tests
 * Purpose: Test queue system integration and job processing
 */
describe('Queue Integration (E2E)', () => {
  let app: INestApplication;
  let orderQueue: Queue;
  let emailQueue: Queue;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    orderQueue = app.get(getQueueToken('order-processing'));
    emailQueue = app.get(getQueueToken('notification-sending'));
  });

  afterAll(async () => {
    // Clean up queues
    if (orderQueue) {
      await orderQueue.empty();
      await orderQueue.close();
    }
    if (emailQueue) {
      await emailQueue.empty();
      await emailQueue.close();
    }

    if (app) {
      await app.close();
    }
  });

  afterEach(async () => {
    // Clean up jobs after each test
    if (orderQueue) {
      await orderQueue.empty();
    }
    if (emailQueue) {
      await emailQueue.empty();
    }
  });

  describe('Queue Connection', () => {
    it('should connect to queues successfully', () => {
      expect(orderQueue).toBeDefined();
      expect(emailQueue).toBeDefined();
    });

    it('should get queue names', async () => {
      const orderQueueName = await orderQueue.name;
      const emailQueueName = await emailQueue.name;

      expect(orderQueueName).toBe('order-processing');
      expect(emailQueueName).toBe('email-notifications');
    });
  });

  describe('Job Management', () => {
    it('should add job to queue', async () => {
      const job = await orderQueue.add('process-order', {
        orderId: 'test-order-001',
        userId: 'test-user-001',
      });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.data.orderId).toBe('test-order-001');
    });

    it('should add multiple jobs to queue', async () => {
      const jobs = await Promise.all([
        orderQueue.add('process-order', { orderId: 'order-1' }),
        orderQueue.add('process-order', { orderId: 'order-2' }),
        orderQueue.add('process-order', { orderId: 'order-3' }),
      ]);

      expect(jobs).toHaveLength(3);
      expect(jobs.every((job) => job.id)).toBe(true);
    });

    it('should add job with options', async () => {
      const job = await orderQueue.add(
        'process-order',
        {
          orderId: 'test-order-002',
        },
        {
          delay: 1000, // 1 second delay
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      );

      expect(job).toBeDefined();
      expect(job.opts.delay).toBe(1000);
      expect(job.opts.attempts).toBe(3);
    });

    it('should get job by ID', async () => {
      const createdJob = await orderQueue.add('process-order', {
        orderId: 'test-order-003',
      });

      const retrievedJob = await orderQueue.getJob(createdJob.id);

      expect(retrievedJob).toBeDefined();
      expect(retrievedJob?.id).toBe(createdJob.id);
      expect(retrievedJob?.data.orderId).toBe('test-order-003');
    });

    it('should remove job from queue', async () => {
      const job = await orderQueue.add('process-order', {
        orderId: 'test-order-004',
      });

      await job.remove();

      const retrievedJob = await orderQueue.getJob(job.id);
      expect(retrievedJob).toBeNull();
    });
  });

  describe('Queue State', () => {
    it('should get waiting jobs count', async () => {
      await orderQueue.add('process-order', { orderId: 'order-1' });
      await orderQueue.add('process-order', { orderId: 'order-2' });

      const waitingCount = await orderQueue.getWaitingCount();
      expect(waitingCount).toBeGreaterThanOrEqual(2);
    });

    it('should get active jobs count', async () => {
      const activeCount = await orderQueue.getActiveCount();
      expect(activeCount).toBeGreaterThanOrEqual(0);
    });

    it('should get completed jobs count', async () => {
      const completedCount = await orderQueue.getCompletedCount();
      expect(completedCount).toBeGreaterThanOrEqual(0);
    });

    it('should get failed jobs count', async () => {
      const failedCount = await orderQueue.getFailedCount();
      expect(failedCount).toBeGreaterThanOrEqual(0);
    });

    it('should pause and resume queue', async () => {
      await orderQueue.pause();
      const isPaused = await orderQueue.isPaused();
      expect(isPaused).toBe(true);

      await orderQueue.resume();
      const isResumed = await orderQueue.isPaused();
      expect(isResumed).toBe(false);
    });

    it('should empty queue', async () => {
      await orderQueue.add('process-order', { orderId: 'order-1' });
      await orderQueue.add('process-order', { orderId: 'order-2' });
      await orderQueue.add('process-order', { orderId: 'order-3' });

      await orderQueue.empty();

      const waitingCount = await orderQueue.getWaitingCount();
      expect(waitingCount).toBe(0);
    });
  });

  describe('Job Processing', () => {
    it('should process job with callback', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let processedData: any = null;

      // Define processor
      orderQueue.process('test-process', async (job) => {
        processedData = job.data;
        return { success: true };
      });

      // Add job
      await orderQueue.add('test-process', {
        orderId: 'test-order-005',
        amount: 100,
      });

      // Wait for processing
      await sleep(1000);

      expect(processedData).toBeDefined();
      expect(processedData.orderId).toBe('test-order-005');
    });

    it('should handle job completion events', async () => {
      return new Promise<void>((resolve) => {
        orderQueue.on('completed', (job, result) => {
          expect(job).toBeDefined();
          expect(result.success).toBe(true);
          resolve();
        });

        orderQueue.process('test-completion', async () => {
          return { success: true };
        });

        orderQueue.add('test-completion', { test: true });
      });
    }, 10000);

    it('should handle job failure events', async () => {
      return new Promise<void>((resolve) => {
        orderQueue.on('failed', (job, err) => {
          expect(job).toBeDefined();
          expect(err).toBeDefined();
          resolve();
        });

        orderQueue.process('test-failure', async () => {
          throw new Error('Simulated job failure');
        });

        orderQueue.add('test-failure', { test: true });
      });
    }, 10000);
  });

  describe('Job Retry Logic', () => {
    it('should retry failed jobs', async () => {
      let attemptCount = 0;

      orderQueue.process('test-retry', async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return { success: true, attempts: attemptCount };
      });

      await orderQueue.add(
        'test-retry',
        { test: true },
        {
          attempts: 3,
          backoff: {
            type: 'fixed',
            delay: 100,
          },
        },
      );

      // Wait for retries
      await sleep(2000);

      expect(attemptCount).toBe(3);
    }, 10000);
  });

  describe('Delayed Jobs', () => {
    it('should process delayed jobs', async () => {
      const startTime = Date.now();
      let processTime = 0;

      orderQueue.process('test-delayed', async () => {
        processTime = Date.now();
        return { success: true };
      });

      await orderQueue.add(
        'test-delayed',
        { test: true },
        {
          delay: 1000, // 1 second delay
        },
      );

      // Wait for processing
      await sleep(2000);

      const timeDiff = processTime - startTime;
      expect(timeDiff).toBeGreaterThanOrEqual(900); // Allow some margin
    }, 10000);
  });

  describe('Priority Jobs', () => {
    it('should process high priority jobs first', async () => {
      const processedOrder: string[] = [];

      orderQueue.process('test-priority', async (job) => {
        processedOrder.push(job.data.id);
        return { success: true };
      });

      // Add jobs with different priorities
      await orderQueue.add('test-priority', { id: 'low' }, { priority: 10 });
      await orderQueue.add('test-priority', { id: 'high' }, { priority: 1 });
      await orderQueue.add('test-priority', { id: 'medium' }, { priority: 5 });

      // Wait for processing
      await sleep(2000);

      // High priority should be processed first
      expect(processedOrder[0]).toBe('high');
    }, 10000);
  });
});
