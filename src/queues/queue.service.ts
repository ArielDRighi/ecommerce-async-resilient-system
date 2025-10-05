import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  OrderProcessingJobData,
  PaymentProcessingJobData,
  InventoryManagementJobData,
  NotificationSendingJobData,
  BaseJobData,
  QueueMetrics,
} from '../common/interfaces/queue-job.interface';

/**
 * Queue Service
 * Provides helper methods for managing and monitoring queues
 */
@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue('order-processing')
    private readonly orderQueue: Queue<OrderProcessingJobData>,

    @InjectQueue('payment-processing')
    private readonly paymentQueue: Queue<PaymentProcessingJobData>,

    @InjectQueue('inventory-management')
    private readonly inventoryQueue: Queue<InventoryManagementJobData>,

    @InjectQueue('notification-sending')
    private readonly notificationQueue: Queue<NotificationSendingJobData>,
  ) {}

  async onModuleInit() {
    this.logger.log('Queue Service initialized');
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for all queues
   */
  private setupEventListeners(): void {
    const queues = [
      { name: 'order-processing', queue: this.orderQueue },
      { name: 'payment-processing', queue: this.paymentQueue },
      { name: 'inventory-management', queue: this.inventoryQueue },
      { name: 'notification-sending', queue: this.notificationQueue },
    ];

    queues.forEach(({ name, queue }) => {
      queue.on('completed', (job) => {
        this.logger.debug(`Job ${job.id} completed in queue ${name}`);
      });

      queue.on('failed', (job, error) => {
        this.logger.error(`Job ${job?.id} failed in queue ${name}: ${error.message}`);
      });

      queue.on('stalled', (job) => {
        this.logger.warn(`Job ${job.id} stalled in queue ${name}`);
      });

      queue.on('error', (error) => {
        this.logger.error(`Queue ${name} error: ${error.message}`);
      });
    });
  }

  /**
   * Add a job to the order processing queue
   */
  async addOrderJob(
    jobName: string,
    data: OrderProcessingJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    },
  ) {
    return this.orderQueue.add(jobName, data, options);
  }

  /**
   * Add a job to the payment processing queue
   */
  async addPaymentJob(
    jobName: string,
    data: PaymentProcessingJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    },
  ) {
    return this.paymentQueue.add(jobName, data, options);
  }

  /**
   * Add a job to the inventory management queue
   */
  async addInventoryJob(
    jobName: string,
    data: InventoryManagementJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    },
  ) {
    return this.inventoryQueue.add(jobName, data, options);
  }

  /**
   * Add a job to the notification sending queue
   */
  async addNotificationJob(
    jobName: string,
    data: NotificationSendingJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    },
  ) {
    return this.notificationQueue.add(jobName, data, options);
  }

  /**
   * Get metrics for a specific queue
   */
  async getQueueMetrics(queueName: string): Promise<QueueMetrics> {
    const queue = this.getQueue(queueName);
    const counts = await queue.getJobCounts();

    return {
      queueName,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: await queue.isPaused(),
      timestamp: new Date(),
    };
  }

  /**
   * Get metrics for all queues
   */
  async getAllQueueMetrics(): Promise<QueueMetrics[]> {
    const queueNames = [
      'order-processing',
      'payment-processing',
      'inventory-management',
      'notification-sending',
    ];

    return Promise.all(queueNames.map((name) => this.getQueueMetrics(name)));
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    this.logger.log(`Queue ${queueName} paused`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    this.logger.log(`Queue ${queueName} resumed`);
  }

  /**
   * Clean completed jobs from a queue
   */
  async cleanQueue(
    queueName: string,
    grace: number = 3600000, // 1 hour default
  ): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    this.logger.log(`Queue ${queueName} cleaned`);
  }

  /**
   * Empty a queue (remove all jobs)
   */
  async emptyQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.empty();
    this.logger.warn(`Queue ${queueName} emptied`);
  }

  /**
   * Get queue instance by name
   */
  private getQueue(queueName: string): Queue<BaseJobData> {
    switch (queueName) {
      case 'order-processing':
        return this.orderQueue as Queue<BaseJobData>;
      case 'payment-processing':
        return this.paymentQueue as Queue<BaseJobData>;
      case 'inventory-management':
        return this.inventoryQueue as Queue<BaseJobData>;
      case 'notification-sending':
        return this.notificationQueue as Queue<BaseJobData>;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }
  }

  /**
   * Get all queue instances
   */
  getAllQueues(): Array<{ name: string; queue: Queue<BaseJobData> }> {
    return [
      { name: 'order-processing', queue: this.orderQueue as Queue<BaseJobData> },
      { name: 'payment-processing', queue: this.paymentQueue as Queue<BaseJobData> },
      { name: 'inventory-management', queue: this.inventoryQueue as Queue<BaseJobData> },
      { name: 'notification-sending', queue: this.notificationQueue as Queue<BaseJobData> },
    ];
  }

  /**
   * Wait for all active jobs to complete without closing queues
   * Useful for E2E tests to prevent database errors
   */
  async waitForActiveJobs(timeout: number = 10000): Promise<void> {
    const queues = this.getAllQueues();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const activeJobs = await Promise.all(queues.map(({ queue }) => queue.getActiveCount()));
      const totalActive = activeJobs.reduce((sum, count) => sum + count, 0);

      if (totalActive === 0) {
        this.logger.debug('All active jobs completed');
        return;
      }

      this.logger.debug(`Waiting for ${totalActive} active jobs to complete...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    this.logger.warn(`Timeout waiting for active jobs after ${timeout}ms`);
  }

  /**
   * Graceful shutdown - wait for active jobs to complete
   */
  async gracefulShutdown(timeout: number = 30000): Promise<void> {
    this.logger.log('Starting graceful shutdown of all queues...');

    const queues = this.getAllQueues();

    // Pause all queues to prevent new jobs
    await Promise.all(
      queues.map(async ({ name, queue }) => {
        await queue.pause();
        this.logger.log(`Queue ${name} paused for shutdown`);
      }),
    );

    // Wait for active jobs to complete or timeout
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const activeJobs = await Promise.all(queues.map(({ queue }) => queue.getActiveCount()));

      const totalActive = activeJobs.reduce((sum, count) => sum + count, 0);

      if (totalActive === 0) {
        this.logger.log('All active jobs completed');
        break;
      }

      this.logger.log(`Waiting for ${totalActive} active jobs to complete...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Close all queues
    await Promise.all(
      queues.map(async ({ name, queue }) => {
        await queue.close();
        this.logger.log(`Queue ${name} closed`);
      }),
    );

    this.logger.log('Graceful shutdown complete');
  }
}
