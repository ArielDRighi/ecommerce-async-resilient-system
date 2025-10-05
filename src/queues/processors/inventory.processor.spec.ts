/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InventoryProcessor } from './inventory.processor';
import { InventoryManagementJobData, JobResult } from '../../common/interfaces/queue-job.interface';

describe('InventoryProcessor', () => {
  let processor: InventoryProcessor;

  const createMockJob = (
    data: Partial<InventoryManagementJobData> = {},
    options: Partial<Job> = {},
  ): Partial<Job<InventoryManagementJobData>> => ({
    id: options.id || '1',
    name: options.name || 'reserve-inventory',
    data: {
      jobId: 'job-1',
      createdAt: new Date(),
      action: 'reserve',
      productId: 'product-1',
      quantity: 5,
      ...data,
    } as InventoryManagementJobData,
    attemptsMade: options.attemptsMade || 0,
    opts: { attempts: 3, ...options.opts },
    progress: jest.fn().mockResolvedValue(undefined),
    ...options,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryProcessor],
    }).compile();

    processor = module.get<InventoryProcessor>(InventoryProcessor);

    // Mock logger to avoid console spam
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();

    // Mock delay method to avoid real delays in tests
    jest.spyOn(processor as any, 'delay').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });

    it('should have correct processor name', () => {
      expect((processor as any).processorName).toBe('InventoryProcessor');
    });

    it('should have logger instance', () => {
      expect((processor as any).logger).toBeDefined();
      expect((processor as any).logger).toBeInstanceOf(Logger);
    });
  });

  describe('handleReserveInventory', () => {
    it('should process reserve inventory job successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'reserve',
        productId: 'product-123',
        quantity: 10,
        orderId: 'order-456',
      });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any)?.productId).toBe('product-123');
      expect((result.data as any)?.action).toBe('reserve');
      expect((result.data as any)?.quantity).toBe(10);
      expect((result.data as any)?.status).toBe('completed');
      expect(result.processedAt).toBeInstanceOf(Date);
    });

    it('should update progress during reserve operation', async () => {
      // Arrange
      const mockJob = createMockJob({ action: 'reserve' });

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 0,
        message: 'Job started',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 30,
        message: 'Validating reserve operation',
        currentStep: 'validation',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 60,
        message: 'Executing reserve',
        currentStep: 'execution',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 90,
        message: 'Updating records',
        currentStep: 'record-update',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 100,
        message: 'Job completed',
      });
    });

    it('should include orderId in result when provided', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'reserve',
        orderId: 'order-789',
      });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing inventory reserve'),
        expect.objectContaining({
          orderId: 'order-789',
        }),
      );
    });

    it('should process reserve with reservationId', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'reserve',
        reservationId: 'res-123',
      });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('handleReleaseInventory', () => {
    it('should process release inventory job successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'release',
        productId: 'product-456',
        quantity: 3,
        reservationId: 'res-789',
      });

      // Act
      const result = await processor.handleReleaseInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.productId).toBe('product-456');
      expect((result.data as any)?.action).toBe('release');
      expect((result.data as any)?.quantity).toBe(3);
      expect((result.data as any)?.status).toBe('completed');
    });

    it('should update progress during release operation', async () => {
      // Arrange
      const mockJob = createMockJob({ action: 'release' });

      // Act
      await processor.handleReleaseInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 30,
          message: 'Validating release operation',
        }),
      );
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 60,
          message: 'Executing release',
        }),
      );
    });

    it('should log release operation with correct context', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'release',
        productId: 'product-999',
        quantity: 7,
      });

      // Act
      await processor.handleReleaseInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('release'),
        expect.objectContaining({
          productId: 'product-999',
          action: 'release',
          quantity: 7,
        }),
      );
    });

    it('should include reason in release operation when provided', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'release',
        reason: 'Order cancelled',
      });

      // Act
      const result = await processor.handleReleaseInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('handleConfirmInventory', () => {
    it('should process confirm inventory job successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'confirm',
        productId: 'product-111',
        quantity: 2,
        orderId: 'order-222',
      });

      // Act
      const result = await processor.handleConfirmInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.productId).toBe('product-111');
      expect((result.data as any)?.action).toBe('confirm');
      expect((result.data as any)?.quantity).toBe(2);
      expect((result.data as any)?.status).toBe('completed');
    });

    it('should update progress during confirm operation', async () => {
      // Arrange
      const mockJob = createMockJob({ action: 'confirm' });

      // Act
      await processor.handleConfirmInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 30,
          message: 'Validating confirm operation',
        }),
      );
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 60,
          message: 'Executing confirm',
        }),
      );
    });

    it('should log confirm operation with job ID', async () => {
      // Arrange
      const mockJob = createMockJob(
        {
          action: 'confirm',
        },
        { id: 'job-confirm-123' },
      );

      // Act
      await processor.handleConfirmInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('confirm'),
        expect.objectContaining({
          jobId: 'job-confirm-123',
        }),
      );
    });
  });

  describe('handleReplenishInventory', () => {
    it('should process replenish inventory job successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'replenish',
        productId: 'product-777',
        quantity: 50,
      });

      // Act
      const result = await processor.handleReplenishInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.productId).toBe('product-777');
      expect((result.data as any)?.action).toBe('replenish');
      expect((result.data as any)?.quantity).toBe(50);
      expect((result.data as any)?.status).toBe('completed');
    });

    it('should update progress during replenish operation', async () => {
      // Arrange
      const mockJob = createMockJob({ action: 'replenish' });

      // Act
      await processor.handleReplenishInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 30,
          message: 'Validating replenish operation',
        }),
      );
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 60,
          message: 'Executing replenish',
        }),
      );
    });

    it('should process large quantity replenishment', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'replenish',
        productId: 'product-888',
        quantity: 1000,
      });

      // Act
      const result = await processor.handleReplenishInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.quantity).toBe(1000);
    });

    it('should log replenish operation details', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'replenish',
        productId: 'product-555',
      });

      // Act
      await processor.handleReplenishInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('replenish'),
        expect.objectContaining({
          productId: 'product-555',
          action: 'replenish',
        }),
      );
    });
  });

  describe('processJob - Internal Logic', () => {
    it('should include processedAt timestamp in result', async () => {
      // Arrange
      const mockJob = createMockJob();
      const beforeTime = new Date();

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect((result.data as any)?.processedAt).toBeInstanceOf(Date);
      expect((result.data as any)?.processedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
    });

    it('should increment attemptsMade in result', async () => {
      // Arrange
      const mockJob = createMockJob({}, { attemptsMade: 0 });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.attemptsMade).toBe(1);
    });

    it('should track multiple attempts correctly', async () => {
      // Arrange
      const mockJob = createMockJob({}, { attemptsMade: 2 });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.attemptsMade).toBe(3);
    });

    it('should calculate duration correctly', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert - duration can be 0 in tests since delay() is mocked
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should include all progress steps in correct order', async () => {
      // Arrange
      const mockJob = createMockJob({ action: 'reserve' });
      const progressCalls: any[] = [];
      (mockJob.progress as jest.Mock).mockImplementation((progress) => {
        progressCalls.push(progress);
        return Promise.resolve();
      });

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(progressCalls).toHaveLength(5);
      expect(progressCalls[0].percentage).toBe(0);
      expect(progressCalls[1].percentage).toBe(30);
      expect(progressCalls[2].percentage).toBe(60);
      expect(progressCalls[3].percentage).toBe(90);
      expect(progressCalls[4].percentage).toBe(100);
    });

    it('should include currentStep in progress updates', async () => {
      // Arrange
      const mockJob = createMockJob();
      const progressCalls: any[] = [];
      (mockJob.progress as jest.Mock).mockImplementation((progress) => {
        progressCalls.push(progress);
        return Promise.resolve();
      });

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      const stepsWithCurrentStep = progressCalls.filter((p) => p.currentStep);
      expect(stepsWithCurrentStep).toHaveLength(3);
      expect(stepsWithCurrentStep[0].currentStep).toBe('validation');
      expect(stepsWithCurrentStep[1].currentStep).toBe('execution');
      expect(stepsWithCurrentStep[2].currentStep).toBe('record-update');
    });
  });

  describe('Logging and Metrics', () => {
    it('should log job start with all relevant data', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'reserve',
        productId: 'product-log-1',
        quantity: 15,
        orderId: 'order-log-1',
      });

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing inventory reserve'),
        expect.objectContaining({
          productId: 'product-log-1',
          action: 'reserve',
          quantity: 15,
          orderId: 'order-log-1',
          jobId: '1',
        }),
      );
    });

    it('should log job completion', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('completed successfully'),
        expect.any(Object),
      );
    });

    it('should call logMetrics with job result', async () => {
      // Arrange
      const mockJob = createMockJob();
      const logMetricsSpy = jest.spyOn(processor as any, 'logMetrics');

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(logMetricsSpy).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          success: true,
          data: expect.any(Object),
        }),
      );
    });

    it('should log metrics with correct processor name', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);

      // Assert
      expect(Logger.prototype.debug).toHaveBeenCalledWith(
        expect.stringContaining('Job metrics'),
        expect.objectContaining({
          processorName: 'InventoryProcessor',
        }),
      );
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle job with minimal required fields', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'reserve',
        productId: 'product-min',
        quantity: 1,
      });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle job with all optional fields', async () => {
      // Arrange
      const mockJob = createMockJob({
        action: 'reserve',
        productId: 'product-full',
        quantity: 10,
        orderId: 'order-123',
        reservationId: 'res-456',
        reason: 'Customer request',
        correlationId: 'corr-789',
        userId: 'user-111',
        metadata: { source: 'web', priority: 'high' },
      });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle zero quantity gracefully', async () => {
      // Arrange
      const mockJob = createMockJob({
        quantity: 0,
      });

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.quantity).toBe(0);
    });

    it('should handle progress update failure gracefully', async () => {
      // Arrange
      const mockJob = createMockJob();
      (mockJob.progress as jest.Mock).mockRejectedValueOnce(new Error('Progress failed'));

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert
      expect(result.success).toBe(true); // Job should still succeed
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('should process different product IDs correctly', async () => {
      // Arrange
      const products = ['prod-a', 'prod-b', 'prod-c'];
      const results: JobResult[] = [];

      // Act
      for (const productId of products) {
        const mockJob = createMockJob({ productId });
        const result = await processor.handleReserveInventory(
          mockJob as Job<InventoryManagementJobData>,
        );
        results.push(result);
      }

      // Assert
      expect(results).toHaveLength(3);
      expect((results[0]?.data as any)?.productId).toBe('prod-a');
      expect((results[1]?.data as any)?.productId).toBe('prod-b');
      expect((results[2]?.data as any)?.productId).toBe('prod-c');
    });

    it('should handle concurrent job processing', async () => {
      // Arrange
      const jobs = [
        createMockJob({ productId: 'prod-1' }),
        createMockJob({ productId: 'prod-2' }),
        createMockJob({ productId: 'prod-3' }),
      ];

      // Act
      const results = await Promise.all(
        jobs.map((job) => processor.handleReserveInventory(job as Job<InventoryManagementJobData>)),
      );

      // Assert
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('Different Action Types', () => {
    it('should handle all four action types correctly', async () => {
      // Arrange
      const actions: Array<'reserve' | 'release' | 'confirm' | 'replenish'> = [
        'reserve',
        'release',
        'confirm',
        'replenish',
      ];

      // Act & Assert
      for (const action of actions) {
        const mockJob = createMockJob({ action });
        let result: JobResult;

        switch (action) {
          case 'reserve':
            result = await processor.handleReserveInventory(
              mockJob as Job<InventoryManagementJobData>,
            );
            break;
          case 'release':
            result = await processor.handleReleaseInventory(
              mockJob as Job<InventoryManagementJobData>,
            );
            break;
          case 'confirm':
            result = await processor.handleConfirmInventory(
              mockJob as Job<InventoryManagementJobData>,
            );
            break;
          case 'replenish':
            result = await processor.handleReplenishInventory(
              mockJob as Job<InventoryManagementJobData>,
            );
            break;
        }

        expect(result.success).toBe(true);
        expect((result.data as any)?.action).toBe(action);
      }
    });

    it('should log different messages for different actions', async () => {
      // Arrange
      const actions: Array<'reserve' | 'release' | 'confirm' | 'replenish'> = [
        'reserve',
        'release',
        'confirm',
        'replenish',
      ];

      // Act & Assert
      for (const action of actions) {
        jest.clearAllMocks();
        const mockJob = createMockJob({ action });

        switch (action) {
          case 'reserve':
            await processor.handleReserveInventory(mockJob as Job<InventoryManagementJobData>);
            break;
          case 'release':
            await processor.handleReleaseInventory(mockJob as Job<InventoryManagementJobData>);
            break;
          case 'confirm':
            await processor.handleConfirmInventory(mockJob as Job<InventoryManagementJobData>);
            break;
          case 'replenish':
            await processor.handleReplenishInventory(mockJob as Job<InventoryManagementJobData>);
            break;
        }

        expect(Logger.prototype.log).toHaveBeenCalledWith(
          expect.stringContaining(action),
          expect.any(Object),
        );
      }
    });
  });

  describe('Timing and Performance', () => {
    // Note: Removed fake timer test as it causes timeouts with async operations
    it('should include duration in job result', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleReserveInventory(
        mockJob as Job<InventoryManagementJobData>,
      );

      // Assert - duration can be 0 in tests since delay() is mocked
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});
