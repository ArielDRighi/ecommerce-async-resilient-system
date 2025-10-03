/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PaymentProcessingProcessor } from './payment.processor';
import { PaymentProcessingJobData, JobResult } from '../../common/interfaces/queue-job.interface';

describe('PaymentProcessingProcessor', () => {
  let processor: PaymentProcessingProcessor;

  const createMockJob = (
    data: Partial<PaymentProcessingJobData> = {},
    options: Partial<Job> = {},
  ): Partial<Job<PaymentProcessingJobData>> => ({
    id: options.id || '1',
    name: options.name || 'authorize-payment',
    data: {
      jobId: 'job-1',
      createdAt: new Date(),
      orderId: 'order-123',
      paymentId: 'pay-456',
      amount: 99.99,
      currency: 'USD',
      paymentMethod: 'credit_card',
      customerId: 'cust-789',
      ...data,
    } as PaymentProcessingJobData,
    attemptsMade: options.attemptsMade || 0,
    opts: { attempts: 3, ...options.opts },
    progress: jest.fn().mockResolvedValue(undefined),
    ...options,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentProcessingProcessor],
    }).compile();

    processor = module.get<PaymentProcessingProcessor>(PaymentProcessingProcessor);

    // Mock logger to avoid console spam
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(processor).toBeDefined();
    });

    it('should have correct processor name', () => {
      expect((processor as any).processorName).toBe('PaymentProcessingProcessor');
    });

    it('should have logger instance', () => {
      expect((processor as any).logger).toBeDefined();
      expect((processor as any).logger).toBeInstanceOf(Logger);
    });
  });

  describe('handleAuthorizePayment', () => {
    it('should process payment authorization successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        orderId: 'order-001',
        paymentId: 'pay-001',
        amount: 150.0,
        currency: 'USD',
        paymentMethod: 'credit_card',
        customerId: 'customer-001',
      });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.paymentId).toBe('pay-001');
      expect((result.data as any)?.orderId).toBe('order-001');
      expect((result.data as any)?.status).toBe('processed');
      expect((result.data as any)?.transactionId).toMatch(/^txn_\d+$/);
    });

    it('should update progress during authorization', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 0,
        message: 'Job started',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 20,
        message: 'Validating payment method',
        currentStep: 'validation',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 40,
        message: 'Contacting payment gateway',
        currentStep: 'gateway-communication',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 70,
        message: 'Processing transaction',
        currentStep: 'transaction-processing',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 90,
        message: 'Verifying result',
        currentStep: 'verification',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 100,
        message: 'Job completed',
      });
    });

    it('should log payment authorization details', async () => {
      // Arrange
      const mockJob = createMockJob({
        paymentId: 'pay-log-1',
        orderId: 'order-log-1',
        amount: 250.5,
        currency: 'EUR',
      });

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('Processing payment pay-log-1'),
        expect.objectContaining({
          paymentId: 'pay-log-1',
          orderId: 'order-log-1',
          amount: 250.5,
          currency: 'EUR',
        }),
      );
    });

    it('should handle large payment amounts', async () => {
      // Arrange
      const mockJob = createMockJob({
        amount: 9999.99,
      });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          amount: 9999.99,
        }),
      );
    });

    it('should handle different payment methods', async () => {
      // Arrange
      const paymentMethods: Array<'credit_card' | 'debit_card' | 'bank_transfer' | 'paypal'> = [
        'credit_card',
        'debit_card',
        'bank_transfer',
        'paypal',
      ];

      // Act & Assert
      for (const method of paymentMethods) {
        const mockJob = createMockJob({ paymentMethod: method });
        const result = await processor.handleAuthorizePayment(
          mockJob as Job<PaymentProcessingJobData>,
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('handleCapturePayment', () => {
    it('should process payment capture successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        orderId: 'order-002',
        paymentId: 'pay-002',
        amount: 75.0,
        currency: 'GBP',
      });

      // Act
      const result = await processor.handleCapturePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.paymentId).toBe('pay-002');
      expect((result.data as any)?.orderId).toBe('order-002');
      expect((result.data as any)?.status).toBe('processed');
    });

    it('should update progress during capture', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleCapturePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 40,
          message: 'Contacting payment gateway',
        }),
      );
    });

    it('should log capture operation', async () => {
      // Arrange
      const mockJob = createMockJob({
        paymentId: 'pay-capture-1',
      });

      // Act
      await processor.handleCapturePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('pay-capture-1'),
        expect.any(Object),
      );
    });

    it('should handle captures with different currencies', async () => {
      // Arrange
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

      // Act & Assert
      for (const currency of currencies) {
        const mockJob = createMockJob({ currency });
        const result = await processor.handleCapturePayment(
          mockJob as Job<PaymentProcessingJobData>,
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('handleRefundPayment', () => {
    it('should process payment refund successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        orderId: 'order-003',
        paymentId: 'pay-003',
        amount: 50.0,
        currency: 'USD',
      });

      // Act
      const result = await processor.handleRefundPayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.paymentId).toBe('pay-003');
      expect((result.data as any)?.status).toBe('processed');
    });

    it('should update progress during refund', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleRefundPayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 70,
          message: 'Processing transaction',
        }),
      );
    });

    it('should handle partial refunds', async () => {
      // Arrange
      const mockJob = createMockJob({
        amount: 25.0, // Partial refund of original 99.99
      });

      // Act
      const result = await processor.handleRefundPayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should log refund details', async () => {
      // Arrange
      const mockJob = createMockJob({
        paymentId: 'pay-refund-1',
        amount: 100.0,
      });

      // Act
      await processor.handleRefundPayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('pay-refund-1'),
        expect.objectContaining({
          amount: 100.0,
        }),
      );
    });
  });

  describe('Transaction ID Generation', () => {
    it('should generate unique transaction IDs', async () => {
      // Arrange
      const jobs = [
        createMockJob({ paymentId: 'pay-1' }),
        createMockJob({ paymentId: 'pay-2' }),
        createMockJob({ paymentId: 'pay-3' }),
      ];

      // Act - Execute sequentially to ensure different timestamps
      const results: JobResult[] = [];
      for (const job of jobs) {
        const result = await processor.handleAuthorizePayment(job as Job<PaymentProcessingJobData>);
        results.push(result);
      }

      // Assert
      const transactionIds = results.map((r) => (r.data as any)?.transactionId);
      const uniqueIds = new Set(transactionIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should include timestamp in transaction ID', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect((result.data as any)?.transactionId).toMatch(/^txn_\d+$/);
      const timestamp = parseInt((result.data as any)?.transactionId.replace('txn_', ''));
      expect(timestamp).toBeGreaterThan(Date.now() - 10000); // Within last 10 seconds
    });
  });

  describe('Payment Status', () => {
    it('should mark all payments as processed on success', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect((result.data as any)?.status).toBe('processed');
    });

    it('should include processedAt timestamp', async () => {
      // Arrange
      const mockJob = createMockJob();
      const beforeTime = new Date();

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect((result.data as any)?.processedAt).toBeInstanceOf(Date);
      expect((result.data as any)?.processedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
    });
  });

  describe('isRetryableError - Payment-Specific Logic', () => {
    it('should identify GATEWAY_TIMEOUT as retryable', () => {
      // Arrange
      const error = new Error('GATEWAY_TIMEOUT: Payment gateway timed out');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should identify INSUFFICIENT_FUNDS_TEMP as retryable', () => {
      // Arrange
      const error = new Error('INSUFFICIENT_FUNDS_TEMP: Temporary insufficient funds');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should identify CARD_ISSUER_UNAVAILABLE as retryable', () => {
      // Arrange
      const error = new Error('CARD_ISSUER_UNAVAILABLE: Card issuer is temporarily unavailable');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should treat network errors as retryable', () => {
      // Arrange
      const error = new Error('ECONNRESET: Connection reset');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should treat unknown payment errors as non-retryable by default', () => {
      // Arrange
      const error = new Error('INVALID_CARD: Card is invalid');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(false);
    });

    it('should handle non-Error objects', () => {
      // Arrange
      const error = { message: 'Not an Error instance' };

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(false);
    });
  });

  describe('Progress Tracking', () => {
    it('should track all progress steps in order', async () => {
      // Arrange
      const mockJob = createMockJob();
      const progressCalls: any[] = [];
      (mockJob.progress as jest.Mock).mockImplementation((progress) => {
        progressCalls.push(progress);
        return Promise.resolve();
      });

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(progressCalls).toHaveLength(6);
      expect(progressCalls[0].percentage).toBe(0);
      expect(progressCalls[1].percentage).toBe(20);
      expect(progressCalls[2].percentage).toBe(40);
      expect(progressCalls[3].percentage).toBe(70);
      expect(progressCalls[4].percentage).toBe(90);
      expect(progressCalls[5].percentage).toBe(100);
    });

    it('should include step names in progress', async () => {
      // Arrange
      const mockJob = createMockJob();
      const progressCalls: any[] = [];
      (mockJob.progress as jest.Mock).mockImplementation((progress) => {
        progressCalls.push(progress);
        return Promise.resolve();
      });

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      const stepsWithNames = progressCalls.filter((p) => p.currentStep);
      expect(stepsWithNames).toHaveLength(4);
      expect(stepsWithNames[0].currentStep).toBe('validation');
      expect(stepsWithNames[1].currentStep).toBe('gateway-communication');
      expect(stepsWithNames[2].currentStep).toBe('transaction-processing');
      expect(stepsWithNames[3].currentStep).toBe('verification');
    });
  });

  describe('Job Metrics', () => {
    it('should log metrics after successful payment processing', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);

      // Assert
      expect(Logger.prototype.debug).toHaveBeenCalledWith(
        expect.stringContaining('Job metrics'),
        expect.objectContaining({
          processorName: 'PaymentProcessingProcessor',
          success: true,
        }),
      );
    });

    it('should include duration in metrics', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should track processing time accurately', async () => {
      // Arrange
      const mockJob = createMockJob();
      const startTime = Date.now();

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);
      const endTime = Date.now();

      // Assert
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThan(4800); // 800 + 2000 + 1500 + 500 = 4800ms minimum
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero amount payments', async () => {
      // Arrange
      const mockJob = createMockJob({
        amount: 0,
      });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle very small amounts', async () => {
      // Arrange
      const mockJob = createMockJob({
        amount: 0.01,
      });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle decimal precision', async () => {
      // Arrange
      const mockJob = createMockJob({
        amount: 99.999,
      });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle concurrent payment processing', async () => {
      // Arrange
      const jobs = Array.from({ length: 3 }, (_, i) =>
        createMockJob({ paymentId: `pay-concurrent-${i}` }),
      );

      // Act
      const results = await Promise.all(
        jobs.map((job) => processor.handleAuthorizePayment(job as Job<PaymentProcessingJobData>)),
      );

      // Assert
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle progress update failure gracefully', async () => {
      // Arrange
      const mockJob = createMockJob();
      (mockJob.progress as jest.Mock).mockRejectedValueOnce(new Error('Progress update failed'));

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true); // Job should still succeed
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('should handle missing optional fields', async () => {
      // Arrange
      const mockJob = createMockJob();
      delete (mockJob.data as any).metadata;

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Different Currencies', () => {
    it('should process payments in USD', async () => {
      // Arrange
      const mockJob = createMockJob({ currency: 'USD', amount: 100.0 });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should process payments in EUR', async () => {
      // Arrange
      const mockJob = createMockJob({ currency: 'EUR', amount: 85.0 });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should process payments in GBP', async () => {
      // Arrange
      const mockJob = createMockJob({ currency: 'GBP', amount: 75.0 });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should process payments in JPY', async () => {
      // Arrange
      const mockJob = createMockJob({ currency: 'JPY', amount: 10000 });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Customer Tracking', () => {
    it('should include customer ID in processing', async () => {
      // Arrange
      const mockJob = createMockJob({
        customerId: 'customer-special-123',
      });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle different customer IDs', async () => {
      // Arrange
      const customerIds = ['cust-1', 'cust-2', 'cust-3'];

      // Act & Assert
      for (const customerId of customerIds) {
        const mockJob = createMockJob({ customerId });
        const result = await processor.handleAuthorizePayment(
          mockJob as Job<PaymentProcessingJobData>,
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Attempt Tracking', () => {
    it('should increment attemptsMade on first attempt', async () => {
      // Arrange
      const mockJob = createMockJob({}, { attemptsMade: 0 });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.attemptsMade).toBe(1);
    });

    it('should track multiple retry attempts', async () => {
      // Arrange
      const mockJob = createMockJob({}, { attemptsMade: 2 });

      // Act
      const result = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(result.attemptsMade).toBe(3);
    });
  });

  describe('All Operation Types', () => {
    it('should handle authorize, capture, and refund operations', async () => {
      // Arrange
      const mockJob = createMockJob({
        paymentId: 'pay-all-ops',
      });

      // Act
      const authorizeResult = await processor.handleAuthorizePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );
      const captureResult = await processor.handleCapturePayment(
        mockJob as Job<PaymentProcessingJobData>,
      );
      const refundResult = await processor.handleRefundPayment(
        mockJob as Job<PaymentProcessingJobData>,
      );

      // Assert
      expect(authorizeResult.success).toBe(true);
      expect(captureResult.success).toBe(true);
      expect(refundResult.success).toBe(true);
    });
  });

  describe('Timing and Performance', () => {
    it('should complete payment processing within reasonable time', async () => {
      // Arrange
      const mockJob = createMockJob();
      const startTime = Date.now();

      // Act
      await processor.handleAuthorizePayment(mockJob as Job<PaymentProcessingJobData>);
      const endTime = Date.now();

      // Assert
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThan(4800); // Minimum delays
      expect(duration).toBeLessThan(6000); // Should not take too long
    });
  });
});
