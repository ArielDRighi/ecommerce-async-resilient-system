/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bull';
import { OrderProcessingProcessor } from './order-processing.processor';
import { Logger } from '@nestjs/common';
import { OrderProcessingSagaService } from '../../modules/orders/services/order-processing-saga.service';

describe('OrderProcessingProcessor', () => {
  let processor: OrderProcessingProcessor;

  const mockSagaService = {
    executeSaga: jest.fn().mockResolvedValue({
      finalStatus: 'COMPLETED',
      totalDurationMs: 1000,
      compensationExecuted: false,
      stepMetrics: [
        { step: 'STOCK_VERIFIED', success: true, durationMs: 100, retries: 0 },
        { step: 'STOCK_RESERVED', success: true, durationMs: 150, retries: 0 },
        { step: 'PAYMENT_PROCESSING', success: true, durationMs: 200, retries: 0 },
        { step: 'PAYMENT_COMPLETED', success: true, durationMs: 150, retries: 0 },
        { step: 'NOTIFICATION_SENT', success: true, durationMs: 100, retries: 0 },
        { step: 'CONFIRMED', success: true, durationMs: 100, retries: 0 },
      ],
      circuitBreakerStats: {
        payment: { state: 'CLOSED', failures: 0, successes: 1, lastFailureTime: null },
        inventory: { state: 'CLOSED', failures: 0, successes: 2, lastFailureTime: null },
        notification: { state: 'CLOSED', failures: 0, successes: 1, lastFailureTime: null },
      },
    }),
    getCircuitBreakerStats: jest.fn().mockReturnValue({
      payment: { state: 'CLOSED', failureCount: 0, successCount: 1, lastFailureTime: null },
      inventory: { state: 'CLOSED', failureCount: 0, successCount: 2, lastFailureTime: null },
      notification: { state: 'CLOSED', failureCount: 0, successCount: 1, lastFailureTime: null },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderProcessingProcessor,
        {
          provide: OrderProcessingSagaService,
          useValue: mockSagaService,
        },
      ],
    }).compile();

    processor = module.get<OrderProcessingProcessor>(OrderProcessingProcessor);

    // Mock logger to avoid console spam
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleJob - create-order', () => {
    it('should process order creation job successfully', async () => {
      const mockJob: Partial<Job> = {
        id: '1',
        name: 'create-order',
        data: {
          jobId: 'order-123',
          orderId: 'order-123',
          sagaId: 'saga-123',
          userId: 'user-456',
          items: [
            { productId: 'prod-1', quantity: 2 },
            { productId: 'prod-2', quantity: 1 },
          ],
          totalAmount: 299.99,
          currency: 'USD',
          shippingAddress: {
            street: '123 Test St',
            city: 'Test City',
            country: 'US',
          },
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-123');
      expect(mockJob.progress).toHaveBeenCalled(); // Verifica que progress fue llamado
    });

    it('should update progress correctly', async () => {
      const mockJob: Partial<Job> = {
        id: '2',
        name: 'create-order',
        data: {
          jobId: 'order-456',
          orderId: 'order-456',
          sagaId: 'saga-456',
          userId: 'user-789',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      // Verificar que el job se completó exitosamente
      expect(result.success).toBe(true);
      // Verificar que progress se llamó al menos una vez
      expect(mockJob.progress).toHaveBeenCalled();
    });
  });

  describe('handleJob - confirm-order', () => {
    it('should process order confirmation successfully', async () => {
      const mockJob: Partial<Job> = {
        id: '3',
        name: 'confirm-order',
        data: {
          jobId: 'confirm-order-123',
          orderId: 'order-123',
          sagaId: 'saga-confirm-123',
          userId: 'user-456',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          paymentId: 'payment-456',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-confirm-123');
    });
  });

  describe('handleJob - cancel-order', () => {
    it('should process order cancellation successfully', async () => {
      const mockJob: Partial<Job> = {
        id: '4',
        name: 'cancel-order',
        data: {
          jobId: 'cancel-order-123',
          orderId: 'order-123',
          sagaId: 'saga-cancel-123',
          userId: 'user-456',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          reason: 'Customer requested cancellation',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-cancel-123');
    });
  });

  describe('processor integration', () => {
    it('should process jobs with various data configurations', async () => {
      // Test with minimal valid data to verify processor flexibility
      const mockJob: Partial<Job> = {
        id: '6',
        name: 'create-order',
        data: {
          jobId: 'order-flexible',
          orderId: 'order-flexible',
          sagaId: 'saga-flexible',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      // Test the public interface with valid data
      const result = await processor.handleJob(mockJob as Job);

      // Verify successful processing
      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-flexible');
    });
  });

  describe('Direct Handler Methods', () => {
    it('should call handleCreateOrder directly', async () => {
      const mockJob: Partial<Job> = {
        id: '7',
        name: 'create-order',
        data: {
          jobId: 'direct-create',
          orderId: 'order-direct-create',
          sagaId: 'saga-direct-create',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleCreateOrder(mockJob as Job);

      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-direct-create');
    });

    it('should call handleConfirmOrder directly', async () => {
      const mockJob: Partial<Job> = {
        id: '8',
        name: 'confirm-order',
        data: {
          jobId: 'direct-confirm',
          orderId: 'order-direct-confirm',
          sagaId: 'saga-direct-confirm',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleConfirmOrder(mockJob as Job);

      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-direct-confirm');
    });

    it('should call handleCancelOrder directly', async () => {
      const mockJob: Partial<Job> = {
        id: '9',
        name: 'cancel-order',
        data: {
          jobId: 'direct-cancel',
          orderId: 'order-direct-cancel',
          sagaId: 'saga-direct-cancel',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleCancelOrder(mockJob as Job);

      expect(result.success).toBe(true);
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-direct-cancel');
    });
  });

  describe('Error Handling', () => {
    it('should handle processing without sagaId (backwards compatibility)', async () => {
      const mockJob: Partial<Job> = {
        id: '10',
        name: 'create-order',
        data: {
          jobId: 'order-no-saga',
          orderId: 'order-no-saga',
          // sagaId is missing - should process without saga pattern
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        } as any,
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      // Call handleCreateOrder - should succeed without saga
      const result = await processor.handleCreateOrder(mockJob as Job);

      // Verify warning was logged and job succeeded
      expect(Logger.prototype.warn).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect((result.data as any).status).toBe('COMPLETED');
    });

    it('should handle saga execution failure', async () => {
      mockSagaService.executeSaga.mockRejectedValueOnce(new Error('Saga execution failed'));

      const mockJob: Partial<Job> = {
        id: '11',
        name: 'create-order',
        data: {
          jobId: 'order-fail',
          orderId: 'order-fail',
          sagaId: 'saga-fail',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 1,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      // When saga throws, processJob catches and returns error result
      // BaseProcessor logs the error
      await processor.handleCreateOrder(mockJob as Job);

      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });

  describe('Saga Compensation Scenarios', () => {
    it('should handle saga with compensation executed', async () => {
      mockSagaService.executeSaga.mockResolvedValueOnce({
        finalStatus: 'COMPENSATED',
        totalDurationMs: 2500,
        compensationExecuted: true,
        orderId: 'order-compensated',
        stepMetrics: [
          { step: 'STOCK_VERIFIED', success: true, durationMs: 100, retryCount: 0 },
          { step: 'STOCK_RESERVED', success: true, durationMs: 150, retryCount: 0 },
          { step: 'PAYMENT_PROCESSING', success: false, durationMs: 300, retryCount: 2 },
          { step: 'COMPENSATION', success: true, durationMs: 200, retryCount: 0 },
        ],
      });

      const mockJob: Partial<Job> = {
        id: '12',
        name: 'create-order',
        data: {
          jobId: 'order-compensate',
          orderId: 'order-compensate',
          sagaId: 'saga-compensate',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleCreateOrder(mockJob as Job);

      // Verify job was processed
      expect(result).toBeDefined();
      expect(result.processedAt).toBeDefined();
      // Verify saga completed with compensation
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-compensate');
    });

    it('should handle saga with FAILED status', async () => {
      mockSagaService.executeSaga.mockResolvedValueOnce({
        finalStatus: 'FAILED',
        totalDurationMs: 1800,
        compensationExecuted: false,
        orderId: 'order-failed',
        stepMetrics: [
          { step: 'STOCK_VERIFIED', success: true, durationMs: 100, retryCount: 0 },
          { step: 'STOCK_RESERVED', success: false, durationMs: 200, retryCount: 3 },
        ],
      });

      const mockJob: Partial<Job> = {
        id: '13',
        name: 'create-order',
        data: {
          jobId: 'order-failed',
          orderId: 'order-failed',
          sagaId: 'saga-failed',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 2,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleCreateOrder(mockJob as Job);

      // Verify job was processed
      expect(result).toBeDefined();
      expect(result.processedAt).toBeDefined();
      expect(mockSagaService.executeSaga).toHaveBeenCalledWith('saga-failed');
    });
  });

  describe('Circuit Breaker Stats Logging', () => {
    it('should log saga metrics including circuit breaker stats', async () => {
      const mockJob: Partial<Job> = {
        id: '14',
        name: 'create-order',
        data: {
          jobId: 'order-metrics',
          orderId: 'order-metrics',
          sagaId: 'saga-metrics',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      // Verify job completed successfully
      expect(result.success).toBe(true);
      // Verify logging was called (logSagaMetrics is private and calls getCircuitBreakerStats)
      expect(Logger.prototype.debug).toHaveBeenCalled();
    });

    it('should handle different circuit breaker states', async () => {
      mockSagaService.getCircuitBreakerStats.mockReturnValueOnce({
        payment: { state: 'OPEN', failureCount: 5, successCount: 2, lastFailureTime: new Date() },
        inventory: {
          state: 'HALF_OPEN',
          failureCount: 3,
          successCount: 8,
          lastFailureTime: new Date(),
        },
        notification: { state: 'CLOSED', failureCount: 0, successCount: 10, lastFailureTime: null },
      });

      const mockJob: Partial<Job> = {
        id: '15',
        name: 'create-order',
        data: {
          jobId: 'order-cb-open',
          orderId: 'order-cb-open',
          sagaId: 'saga-cb-open',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      // Verify job completed
      expect(result.success).toBe(true);
      expect(Logger.prototype.debug).toHaveBeenCalled();
    });
  });

  describe('Progress Tracking Details', () => {
    it('should track progress with step details', async () => {
      const mockJob: Partial<Job> = {
        id: '16',
        name: 'create-order',
        data: {
          jobId: 'order-progress',
          orderId: 'order-progress',
          sagaId: 'saga-progress',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 2 }],
          totalAmount: 199.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      await processor.handleJob(mockJob as Job);

      // Verify saga-start progress (called by processJob)
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 10,
          message: 'Starting order processing saga',
          currentStep: 'saga-start',
        }),
      );

      // Progress is also called by BaseProcessor for 0% and 100%
      expect(mockJob.progress).toHaveBeenCalled();
    });
  });

  describe('Saga Metrics Logging Details', () => {
    it('should log detailed step metrics with retries', async () => {
      mockSagaService.executeSaga.mockResolvedValueOnce({
        finalStatus: 'COMPLETED',
        totalDurationMs: 3500,
        compensationExecuted: false,
        orderId: 'order-detailed',
        stepMetrics: [
          { step: 'STOCK_VERIFIED', success: true, durationMs: 150, retryCount: 0 },
          { step: 'STOCK_RESERVED', success: true, durationMs: 250, retryCount: 1 },
          { step: 'PAYMENT_PROCESSING', success: true, durationMs: 500, retryCount: 2 },
          { step: 'PAYMENT_COMPLETED', success: true, durationMs: 200, retryCount: 0 },
        ],
      });

      const mockJob: Partial<Job> = {
        id: '17',
        name: 'create-order',
        data: {
          jobId: 'order-detailed',
          orderId: 'order-detailed',
          sagaId: 'saga-detailed',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      await processor.handleJob(mockJob as Job);

      // Verify detailed logging was called
      expect(Logger.prototype.debug).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple retry attempts', async () => {
      const mockJob: Partial<Job> = {
        id: '18',
        name: 'create-order',
        data: {
          jobId: 'order-retry',
          orderId: 'order-retry',
          sagaId: 'saga-retry',
          userId: 'user-123',
          items: [{ productId: 'prod-1', quantity: 1 }],
          totalAmount: 99.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 5,
        opts: { attempts: 10 },
        progress: jest.fn(),
      };

      const result = await processor.handleJob(mockJob as Job);

      expect(result.success).toBe(true);
      expect(result.attemptsMade).toBe(6);
    });

    it('should handle large order amounts', async () => {
      const mockJob: Partial<Job> = {
        id: '19',
        name: 'create-order',
        data: {
          jobId: 'order-large',
          orderId: 'order-large',
          sagaId: 'saga-large',
          userId: 'user-123',
          items: [
            { productId: 'prod-1', quantity: 100 },
            { productId: 'prod-2', quantity: 200 },
          ],
          totalAmount: 99999.99,
          currency: 'USD',
          createdAt: new Date(),
        },
        attemptsMade: 0,
        opts: { attempts: 3 },
        progress: jest.fn(),
      };

      const result = await processor.handleCreateOrder(mockJob as Job);

      // Verify job was processed
      expect(result).toBeDefined();
      expect(result.processedAt).toBeDefined();
      expect(mockSagaService.executeSaga).toHaveBeenCalled();
    });

    it('should handle different currencies', async () => {
      const currencies = ['EUR', 'GBP', 'JPY', 'CAD'];

      for (const currency of currencies) {
        const mockJob: Partial<Job> = {
          id: `currency-${currency}`,
          name: 'create-order',
          data: {
            jobId: `order-${currency}`,
            orderId: `order-${currency}`,
            sagaId: `saga-${currency}`,
            userId: 'user-123',
            items: [{ productId: 'prod-1', quantity: 1 }],
            totalAmount: 99.99,
            currency,
            createdAt: new Date(),
          },
          attemptsMade: 0,
          opts: { attempts: 3 },
          progress: jest.fn(),
        };

        const result = await processor.handleJob(mockJob as Job);
        expect(result.success).toBe(true);
      }
    });
  });
});
