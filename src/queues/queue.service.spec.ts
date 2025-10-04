import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { Logger } from '@nestjs/common';
import { QueueService } from './queue.service';
import {
  OrderProcessingJobData,
  PaymentProcessingJobData,
  InventoryManagementJobData,
  NotificationSendingJobData,
} from '../common/interfaces/queue-job.interface';

describe('QueueService', () => {
  let service: QueueService;
  let orderQueue: jest.Mocked<Queue>;
  let paymentQueue: jest.Mocked<Queue>;
  let inventoryQueue: jest.Mocked<Queue>;
  let notificationQueue: jest.Mocked<Queue>;

  const createMockQueue = (): Partial<Queue> => ({
    add: jest.fn(),
    on: jest.fn(),
    getJobCounts: jest.fn(),
    isPaused: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    clean: jest.fn(),
    empty: jest.fn(),
    close: jest.fn(),
    getActiveCount: jest.fn(),
    process: jest.fn(),
  });

  beforeEach(async () => {
    orderQueue = createMockQueue() as jest.Mocked<Queue>;
    paymentQueue = createMockQueue() as jest.Mocked<Queue>;
    inventoryQueue = createMockQueue() as jest.Mocked<Queue>;
    notificationQueue = createMockQueue() as jest.Mocked<Queue>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken('order-processing'),
          useValue: orderQueue,
        },
        {
          provide: getQueueToken('payment-processing'),
          useValue: paymentQueue,
        },
        {
          provide: getQueueToken('inventory-management'),
          useValue: inventoryQueue,
        },
        {
          provide: getQueueToken('notification-sending'),
          useValue: notificationQueue,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should set up event listeners for all queues on module initialization', async () => {
      await service.onModuleInit();

      // Verify event listeners were set up for all queues
      expect(orderQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(orderQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(orderQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(orderQueue.on).toHaveBeenCalledWith('error', expect.any(Function));

      expect(paymentQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(paymentQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(paymentQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(paymentQueue.on).toHaveBeenCalledWith('error', expect.any(Function));

      expect(inventoryQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(inventoryQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(inventoryQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(inventoryQueue.on).toHaveBeenCalledWith('error', expect.any(Function));

      expect(notificationQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(notificationQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(notificationQueue.on).toHaveBeenCalledWith('stalled', expect.any(Function));
      expect(notificationQueue.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('addOrderJob', () => {
    const jobData: OrderProcessingJobData = {
      jobId: 'JOB-123',
      createdAt: new Date(),
      orderId: 'ORD-123',
      userId: 'USER-456',
      items: [{ productId: 'PROD-789', quantity: 2, unitPrice: 99.99 }],
      totalAmount: 199.98,
    };

    it('should add an order job to the queue without options', async () => {
      const mockJob = { id: '1', data: jobData } as Partial<Job>;
      orderQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addOrderJob('process-order', jobData);

      expect(orderQueue.add).toHaveBeenCalledWith('process-order', jobData, undefined);
      expect(result).toEqual(mockJob);
    });

    it('should add an order job with priority option', async () => {
      const mockJob = { id: '2', data: jobData } as Partial<Job>;
      const options = { priority: 1 };
      orderQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addOrderJob('process-order', jobData, options);

      expect(orderQueue.add).toHaveBeenCalledWith('process-order', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should add an order job with delay option', async () => {
      const mockJob = { id: '3', data: jobData } as Partial<Job>;
      const options = { delay: 5000 };
      orderQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addOrderJob('process-order', jobData, options);

      expect(orderQueue.add).toHaveBeenCalledWith('process-order', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should add an order job with attempts option', async () => {
      const mockJob = { id: '4', data: jobData } as Partial<Job>;
      const options = { attempts: 3 };
      orderQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addOrderJob('process-order', jobData, options);

      expect(orderQueue.add).toHaveBeenCalledWith('process-order', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should add an order job with all options', async () => {
      const mockJob = { id: '5', data: jobData } as Partial<Job>;
      const options = { priority: 1, delay: 5000, attempts: 3 };
      orderQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addOrderJob('process-order', jobData, options);

      expect(orderQueue.add).toHaveBeenCalledWith('process-order', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should propagate errors from queue.add', async () => {
      const error = new Error('Queue full');
      orderQueue.add.mockRejectedValue(error);

      await expect(service.addOrderJob('process-order', jobData)).rejects.toThrow('Queue full');
    });
  });

  describe('addPaymentJob', () => {
    const jobData: PaymentProcessingJobData = {
      jobId: 'JOB-PAY-123',
      createdAt: new Date(),
      orderId: 'ORD-123',
      paymentId: 'PAY-456',
      amount: 199.98,
      currency: 'USD',
      paymentMethod: 'credit_card',
      customerId: 'CUST-789',
    };

    it('should add a payment job to the queue without options', async () => {
      const mockJob = { id: '1', data: jobData } as Partial<Job>;
      paymentQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addPaymentJob('process-payment', jobData);

      expect(paymentQueue.add).toHaveBeenCalledWith('process-payment', jobData, undefined);
      expect(result).toEqual(mockJob);
    });

    it('should add a payment job with priority option', async () => {
      const mockJob = { id: '2', data: jobData } as Partial<Job>;
      const options = { priority: 1 };
      paymentQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addPaymentJob('process-payment', jobData, options);

      expect(paymentQueue.add).toHaveBeenCalledWith('process-payment', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should add a payment job with delay and attempts', async () => {
      const mockJob = { id: '3', data: jobData } as Partial<Job>;
      const options = { delay: 2000, attempts: 5 };
      paymentQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addPaymentJob('process-payment', jobData, options);

      expect(paymentQueue.add).toHaveBeenCalledWith('process-payment', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should propagate errors from queue.add', async () => {
      const error = new Error('Payment gateway unavailable');
      paymentQueue.add.mockRejectedValue(error);

      await expect(service.addPaymentJob('process-payment', jobData)).rejects.toThrow(
        'Payment gateway unavailable',
      );
    });
  });

  describe('addInventoryJob', () => {
    const jobData: InventoryManagementJobData = {
      jobId: 'JOB-INV-123',
      createdAt: new Date(),
      productId: 'PROD-789',
      action: 'reserve',
      quantity: 2,
      orderId: 'ORD-123',
    };

    it('should add an inventory job to the queue without options', async () => {
      const mockJob = { id: '1', data: jobData } as Partial<Job>;
      inventoryQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addInventoryJob('reserve-stock', jobData);

      expect(inventoryQueue.add).toHaveBeenCalledWith('reserve-stock', jobData, undefined);
      expect(result).toEqual(mockJob);
    });

    it('should add an inventory job with all options', async () => {
      const mockJob = { id: '2', data: jobData } as Partial<Job>;
      const options = { priority: 2, delay: 1000, attempts: 3 };
      inventoryQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addInventoryJob('reserve-stock', jobData, options);

      expect(inventoryQueue.add).toHaveBeenCalledWith('reserve-stock', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should propagate errors from queue.add', async () => {
      const error = new Error('Inventory service down');
      inventoryQueue.add.mockRejectedValue(error);

      await expect(service.addInventoryJob('reserve-stock', jobData)).rejects.toThrow(
        'Inventory service down',
      );
    });
  });

  describe('addNotificationJob', () => {
    const jobData: NotificationSendingJobData = {
      jobId: 'JOB-NOT-123',
      createdAt: new Date(),
      userId: 'USER-456',
      type: 'email',
      recipient: 'user@example.com',
      template: 'order-confirmation',
      data: { orderId: 'ORD-123', total: 199.98 },
    };

    it('should add a notification job to the queue without options', async () => {
      const mockJob = { id: '1', data: jobData } as Partial<Job>;
      notificationQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addNotificationJob('send-email', jobData);

      expect(notificationQueue.add).toHaveBeenCalledWith('send-email', jobData, undefined);
      expect(result).toEqual(mockJob);
    });

    it('should add a notification job with priority and delay', async () => {
      const mockJob = { id: '2', data: jobData } as Partial<Job>;
      const options = { priority: 3, delay: 3000 };
      notificationQueue.add.mockResolvedValue(mockJob as Job);

      const result = await service.addNotificationJob('send-email', jobData, options);

      expect(notificationQueue.add).toHaveBeenCalledWith('send-email', jobData, options);
      expect(result).toEqual(mockJob);
    });

    it('should propagate errors from queue.add', async () => {
      const error = new Error('Notification service unavailable');
      notificationQueue.add.mockRejectedValue(error);

      await expect(service.addNotificationJob('send-email', jobData)).rejects.toThrow(
        'Notification service unavailable',
      );
    });
  });

  describe('getQueueMetrics', () => {
    it('should return metrics for order-processing queue', async () => {
      const mockCounts = {
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      };
      orderQueue.getJobCounts.mockResolvedValue(mockCounts);
      orderQueue.isPaused.mockResolvedValue(false);

      const result = await service.getQueueMetrics('order-processing');

      expect(result).toEqual({
        queueName: 'order-processing',
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
        paused: false,
        timestamp: expect.any(Date),
      });
    });

    it('should return metrics for payment-processing queue', async () => {
      const mockCounts = {
        waiting: 10,
        active: 5,
        completed: 200,
        failed: 10,
        delayed: 2,
      };
      paymentQueue.getJobCounts.mockResolvedValue(mockCounts);
      paymentQueue.isPaused.mockResolvedValue(true);

      const result = await service.getQueueMetrics('payment-processing');

      expect(result).toEqual({
        queueName: 'payment-processing',
        waiting: 10,
        active: 5,
        completed: 200,
        failed: 10,
        delayed: 2,
        paused: true,
        timestamp: expect.any(Date),
      });
    });

    it('should handle missing count properties with default 0', async () => {
      const mockCounts = {}; // Empty counts
      orderQueue.getJobCounts.mockResolvedValue(mockCounts as never);
      orderQueue.isPaused.mockResolvedValue(false);

      const result = await service.getQueueMetrics('order-processing');

      expect(result).toEqual({
        queueName: 'order-processing',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: false,
        timestamp: expect.any(Date),
      });
    });

    it('should throw error for unknown queue name', async () => {
      await expect(service.getQueueMetrics('unknown-queue')).rejects.toThrow(
        'Unknown queue: unknown-queue',
      );
    });
  });

  describe('getAllQueueMetrics', () => {
    it('should return metrics for all queues', async () => {
      const orderCounts = { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 };
      const paymentCounts = { waiting: 10, active: 5, completed: 200, failed: 10, delayed: 2 };
      const inventoryCounts = { waiting: 3, active: 1, completed: 50, failed: 2, delayed: 0 };
      const notificationCounts = { waiting: 15, active: 8, completed: 500, failed: 5, delayed: 3 };

      orderQueue.getJobCounts.mockResolvedValue(orderCounts);
      orderQueue.isPaused.mockResolvedValue(false);

      paymentQueue.getJobCounts.mockResolvedValue(paymentCounts);
      paymentQueue.isPaused.mockResolvedValue(false);

      inventoryQueue.getJobCounts.mockResolvedValue(inventoryCounts);
      inventoryQueue.isPaused.mockResolvedValue(false);

      notificationQueue.getJobCounts.mockResolvedValue(notificationCounts);
      notificationQueue.isPaused.mockResolvedValue(false);

      const result = await service.getAllQueueMetrics();

      expect(result).toHaveLength(4);
      expect(result[0]).toMatchObject({ queueName: 'order-processing' });
      expect(result[1]).toMatchObject({ queueName: 'payment-processing' });
      expect(result[2]).toMatchObject({ queueName: 'inventory-management' });
      expect(result[3]).toMatchObject({ queueName: 'notification-sending' });
    });
  });

  describe('pauseQueue', () => {
    it('should pause order-processing queue', async () => {
      await service.pauseQueue('order-processing');

      expect(orderQueue.pause).toHaveBeenCalled();
    });

    it('should pause payment-processing queue', async () => {
      await service.pauseQueue('payment-processing');

      expect(paymentQueue.pause).toHaveBeenCalled();
    });

    it('should pause inventory-management queue', async () => {
      await service.pauseQueue('inventory-management');

      expect(inventoryQueue.pause).toHaveBeenCalled();
    });

    it('should pause notification-sending queue', async () => {
      await service.pauseQueue('notification-sending');

      expect(notificationQueue.pause).toHaveBeenCalled();
    });

    it('should throw error for unknown queue name', async () => {
      await expect(service.pauseQueue('unknown-queue')).rejects.toThrow(
        'Unknown queue: unknown-queue',
      );
    });
  });

  describe('resumeQueue', () => {
    it('should resume order-processing queue', async () => {
      await service.resumeQueue('order-processing');

      expect(orderQueue.resume).toHaveBeenCalled();
    });

    it('should resume payment-processing queue', async () => {
      await service.resumeQueue('payment-processing');

      expect(paymentQueue.resume).toHaveBeenCalled();
    });

    it('should resume inventory-management queue', async () => {
      await service.resumeQueue('inventory-management');

      expect(inventoryQueue.resume).toHaveBeenCalled();
    });

    it('should resume notification-sending queue', async () => {
      await service.resumeQueue('notification-sending');

      expect(notificationQueue.resume).toHaveBeenCalled();
    });

    it('should throw error for unknown queue name', async () => {
      await expect(service.resumeQueue('unknown-queue')).rejects.toThrow(
        'Unknown queue: unknown-queue',
      );
    });
  });

  describe('cleanQueue', () => {
    it('should clean order-processing queue with default grace period', async () => {
      await service.cleanQueue('order-processing');

      expect(orderQueue.clean).toHaveBeenCalledWith(3600000, 'completed');
      expect(orderQueue.clean).toHaveBeenCalledWith(3600000, 'failed');
    });

    it('should clean payment-processing queue with custom grace period', async () => {
      const customGrace = 7200000; // 2 hours
      await service.cleanQueue('payment-processing', customGrace);

      expect(paymentQueue.clean).toHaveBeenCalledWith(customGrace, 'completed');
      expect(paymentQueue.clean).toHaveBeenCalledWith(customGrace, 'failed');
    });

    it('should throw error for unknown queue name', async () => {
      await expect(service.cleanQueue('unknown-queue')).rejects.toThrow(
        'Unknown queue: unknown-queue',
      );
    });
  });

  describe('emptyQueue', () => {
    it('should empty order-processing queue', async () => {
      await service.emptyQueue('order-processing');

      expect(orderQueue.empty).toHaveBeenCalled();
    });

    it('should empty payment-processing queue', async () => {
      await service.emptyQueue('payment-processing');

      expect(paymentQueue.empty).toHaveBeenCalled();
    });

    it('should throw error for unknown queue name', async () => {
      await expect(service.emptyQueue('unknown-queue')).rejects.toThrow(
        'Unknown queue: unknown-queue',
      );
    });
  });

  describe('getAllQueues', () => {
    it('should return all queue instances with their names', () => {
      const result = service.getAllQueues();

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        name: 'order-processing',
        queue: orderQueue,
      });
      expect(result[1]).toEqual({
        name: 'payment-processing',
        queue: paymentQueue,
      });
      expect(result[2]).toEqual({
        name: 'inventory-management',
        queue: inventoryQueue,
      });
      expect(result[3]).toEqual({
        name: 'notification-sending',
        queue: notificationQueue,
      });
    });
  });

  describe('gracefulShutdown', () => {
    beforeEach(() => {
      // Mock setTimeout to avoid actual delays in tests
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should pause all queues during shutdown', async () => {
      orderQueue.getActiveCount.mockResolvedValue(0);
      paymentQueue.getActiveCount.mockResolvedValue(0);
      inventoryQueue.getActiveCount.mockResolvedValue(0);
      notificationQueue.getActiveCount.mockResolvedValue(0);

      await service.gracefulShutdown();

      expect(orderQueue.pause).toHaveBeenCalled();
      expect(paymentQueue.pause).toHaveBeenCalled();
      expect(inventoryQueue.pause).toHaveBeenCalled();
      expect(notificationQueue.pause).toHaveBeenCalled();
    });

    it('should close all queues after active jobs complete', async () => {
      orderQueue.getActiveCount.mockResolvedValue(0);
      paymentQueue.getActiveCount.mockResolvedValue(0);
      inventoryQueue.getActiveCount.mockResolvedValue(0);
      notificationQueue.getActiveCount.mockResolvedValue(0);

      await service.gracefulShutdown();

      expect(orderQueue.close).toHaveBeenCalled();
      expect(paymentQueue.close).toHaveBeenCalled();
      expect(inventoryQueue.close).toHaveBeenCalled();
      expect(notificationQueue.close).toHaveBeenCalled();
    });

    it('should wait for active jobs to complete before closing', async () => {
      // First call: 2 active jobs, second call: 0 active jobs
      orderQueue.getActiveCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      paymentQueue.getActiveCount.mockResolvedValue(0);
      inventoryQueue.getActiveCount.mockResolvedValue(0);
      notificationQueue.getActiveCount.mockResolvedValue(0);

      const shutdownPromise = service.gracefulShutdown();

      // Advance timers to simulate waiting period
      await jest.advanceTimersByTimeAsync(1000);

      await shutdownPromise;

      expect(orderQueue.getActiveCount).toHaveBeenCalledTimes(2);
      expect(orderQueue.close).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent job additions', async () => {
      const jobData1: OrderProcessingJobData = {
        jobId: 'JOB-1',
        createdAt: new Date(),
        orderId: 'ORD-1',
        userId: 'USER-1',
        items: [],
        totalAmount: 100,
      };
      const jobData2: OrderProcessingJobData = {
        jobId: 'JOB-2',
        createdAt: new Date(),
        orderId: 'ORD-2',
        userId: 'USER-2',
        items: [],
        totalAmount: 200,
      };

      orderQueue.add
        .mockResolvedValueOnce({ id: '1' } as Job)
        .mockResolvedValueOnce({ id: '2' } as Job);

      const [result1, result2] = await Promise.all([
        service.addOrderJob('process-order', jobData1),
        service.addOrderJob('process-order', jobData2),
      ]);

      expect(orderQueue.add).toHaveBeenCalledTimes(2);
      expect(result1.id).toBe('1');
      expect(result2.id).toBe('2');
    });

    it('should handle metrics retrieval when queue operations fail', async () => {
      const error = new Error('Redis connection lost');
      orderQueue.getJobCounts.mockRejectedValue(error);

      await expect(service.getQueueMetrics('order-processing')).rejects.toThrow(
        'Redis connection lost',
      );
    });
  });
});
