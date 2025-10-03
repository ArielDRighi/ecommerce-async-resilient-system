/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationProcessor } from './notification.processor';
import { NotificationSendingJobData, JobResult } from '../../common/interfaces/queue-job.interface';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;

  const createMockJob = (
    data: Partial<NotificationSendingJobData> = {},
    options: Partial<Job> = {},
  ): Partial<Job<NotificationSendingJobData>> => ({
    id: options.id || '1',
    name: options.name || 'send-email',
    data: {
      jobId: 'job-1',
      createdAt: new Date(),
      type: 'email',
      recipient: 'test@example.com',
      template: 'welcome-email',
      data: { name: 'Test User' },
      ...data,
    } as NotificationSendingJobData,
    attemptsMade: options.attemptsMade || 0,
    opts: { attempts: 3, ...options.opts },
    progress: jest.fn().mockResolvedValue(undefined),
    ...options,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationProcessor],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);

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
      expect((processor as any).processorName).toBe('NotificationProcessor');
    });

    it('should have logger instance', () => {
      expect((processor as any).logger).toBeDefined();
      expect((processor as any).logger).toBeInstanceOf(Logger);
    });
  });

  describe('handleSendEmail', () => {
    it('should process email notification successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'email',
        recipient: 'user@example.com',
        template: 'order-confirmation',
        subject: 'Your Order Confirmation',
        data: { orderNumber: '12345' },
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.type).toBe('email');
      expect((result.data as any)?.recipient).toBe('user@example.com');
      expect((result.data as any)?.template).toBe('order-confirmation');
      expect((result.data as any)?.status).toBe('delivered');
      expect((result.data as any)?.messageId).toMatch(/^msg_\d+$/);
    });

    it('should update progress during email sending', async () => {
      // Arrange
      const mockJob = createMockJob({ type: 'email' });

      // Act
      await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 0,
        message: 'Job started',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 20,
        message: 'Preparing notification',
        currentStep: 'preparation',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 40,
        message: 'Rendering template',
        currentStep: 'rendering',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 70,
        message: 'Sending via email',
        currentStep: 'sending',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 90,
        message: 'Verifying delivery',
        currentStep: 'verification',
      });
      expect(mockJob.progress).toHaveBeenCalledWith({
        percentage: 100,
        message: 'Job completed',
      });
    });

    it('should log email notification details', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'email',
        recipient: 'test@example.com',
        template: 'welcome-email',
        priority: 'high',
      });

      // Act
      await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('Sending email notification'),
        expect.objectContaining({
          type: 'email',
          recipient: 'test@example.com',
          template: 'welcome-email',
          priority: 'high',
        }),
      );
    });

    it('should take longer for email than other notification types', async () => {
      // Arrange
      const mockJob = createMockJob({ type: 'email' });
      const startTime = Date.now();

      // Act
      await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeGreaterThan(2600); // 300 + 500 + 1500 + 300 = 2600ms minimum
    });

    it('should include subject when provided', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'email',
        subject: 'Important Notification',
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('handleSendSms', () => {
    it('should process SMS notification successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'sms',
        recipient: '+1234567890',
        template: 'order-shipped',
        data: { trackingNumber: 'TRACK123' },
      });

      // Act
      const result = await processor.handleSendSms(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.type).toBe('sms');
      expect((result.data as any)?.recipient).toBe('+1234567890');
      expect((result.data as any)?.status).toBe('delivered');
    });

    it('should update progress during SMS sending', async () => {
      // Arrange
      const mockJob = createMockJob({ type: 'sms' });

      // Act
      await processor.handleSendSms(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 70,
          message: 'Sending via sms',
        }),
      );
    });

    it('should be faster than email notifications', async () => {
      // Arrange
      const mockJob = createMockJob({ type: 'sms' });
      const startTime = Date.now();

      // Act
      await processor.handleSendSms(mockJob as Job<NotificationSendingJobData>);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeGreaterThan(1900); // 300 + 500 + 800 + 300 = 1900ms minimum
      expect(duration).toBeLessThan(2600); // Less than email
    });

    it('should log SMS notification with phone number', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'sms',
        recipient: '+9876543210',
      });

      // Act
      await processor.handleSendSms(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.stringContaining('Sending sms notification'),
        expect.objectContaining({
          type: 'sms',
          recipient: '+9876543210',
        }),
      );
    });

    it('should handle international phone numbers', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'sms',
        recipient: '+44 20 1234 5678',
      });

      // Act
      const result = await processor.handleSendSms(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.recipient).toBe('+44 20 1234 5678');
    });
  });

  describe('handleSendPush', () => {
    it('should process push notification successfully', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'push',
        recipient: 'device-token-abc123',
        template: 'new-message',
        data: { message: 'You have a new message' },
      });

      // Act
      const result = await processor.handleSendPush(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.type).toBe('push');
      expect((result.data as any)?.recipient).toBe('device-token-abc123');
      expect((result.data as any)?.status).toBe('delivered');
    });

    it('should be fastest notification type', async () => {
      // Arrange
      const mockJob = createMockJob({ type: 'push' });
      const startTime = Date.now();

      // Act
      await processor.handleSendPush(mockJob as Job<NotificationSendingJobData>);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeGreaterThan(1500); // 300 + 500 + 400 + 300 = 1500ms minimum
      expect(duration).toBeLessThan(1900); // Faster than SMS
    });

    it('should update progress with push-specific message', async () => {
      // Arrange
      const mockJob = createMockJob({ type: 'push' });

      // Act
      await processor.handleSendPush(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(mockJob.progress).toHaveBeenCalledWith(
        expect.objectContaining({
          percentage: 70,
          message: 'Sending via push',
        }),
      );
    });

    it('should handle device tokens', async () => {
      // Arrange
      const mockJob = createMockJob({
        type: 'push',
        recipient: 'expo-push-token[xyz789]',
      });

      // Act
      const result = await processor.handleSendPush(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect((result.data as any)?.recipient).toBe('expo-push-token[xyz789]');
    });
  });

  describe('Priority Handling', () => {
    it('should process high priority notifications', async () => {
      // Arrange
      const mockJob = createMockJob({
        priority: 'high',
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          priority: 'high',
        }),
      );
    });

    it('should process normal priority notifications', async () => {
      // Arrange
      const mockJob = createMockJob({
        priority: 'normal',
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should process low priority notifications', async () => {
      // Arrange
      const mockJob = createMockJob({
        priority: 'low',
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle notifications without priority', async () => {
      // Arrange
      const mockJob = createMockJob();
      delete (mockJob.data as any).priority;

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Template Handling', () => {
    it('should process different templates correctly', async () => {
      // Arrange
      const templates = ['welcome-email', 'order-confirmation', 'password-reset', 'newsletter'];
      const results: JobResult[] = [];

      // Act
      for (const template of templates) {
        const mockJob = createMockJob({ template });
        const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);
        results.push(result);
      }

      // Assert
      expect(results).toHaveLength(4);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should pass template data correctly', async () => {
      // Arrange
      const mockJob = createMockJob({
        template: 'order-confirmation',
        data: {
          orderNumber: 'ORD-12345',
          total: 99.99,
          items: ['Item 1', 'Item 2'],
        },
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  describe('Message ID Generation', () => {
    it('should generate unique message IDs', async () => {
      // Arrange
      const jobs = [
        createMockJob({ recipient: 'user1@example.com' }),
        createMockJob({ recipient: 'user2@example.com' }),
        createMockJob({ recipient: 'user3@example.com' }),
      ];

      // Act - Execute sequentially to ensure different timestamps
      const results: JobResult[] = [];
      for (const job of jobs) {
        const result = await processor.handleSendEmail(job as Job<NotificationSendingJobData>);
        results.push(result);
      }

      // Assert
      const messageIds = results.map((r) => (r.data as any)?.messageId);
      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should include timestamp in message ID', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect((result.data as any)?.messageId).toMatch(/^msg_\d+$/);
      const timestamp = parseInt((result.data as any)?.messageId.replace('msg_', ''));
      expect(timestamp).toBeGreaterThan(Date.now() - 10000); // Within last 10 seconds
    });
  });

  describe('Delivery Status', () => {
    it('should mark all notifications as delivered on success', async () => {
      // Arrange
      const types: Array<'email' | 'sms' | 'push'> = ['email', 'sms', 'push'];

      // Act & Assert
      for (const type of types) {
        const mockJob = createMockJob({ type });
        let result: JobResult;

        switch (type) {
          case 'email':
            result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);
            break;
          case 'sms':
            result = await processor.handleSendSms(mockJob as Job<NotificationSendingJobData>);
            break;
          case 'push':
            result = await processor.handleSendPush(mockJob as Job<NotificationSendingJobData>);
            break;
        }

        expect((result.data as any)?.status).toBe('delivered');
      }
    });

    it('should include deliveredAt timestamp', async () => {
      // Arrange
      const mockJob = createMockJob();
      const beforeTime = new Date();

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect((result.data as any)?.deliveredAt).toBeInstanceOf(Date);
      expect((result.data as any)?.deliveredAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
    });
  });

  describe('isRetryableError - Custom Logic', () => {
    it('should identify INVALID_RECIPIENT as non-retryable', () => {
      // Arrange
      const error = new Error('INVALID_RECIPIENT: Email format is invalid');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(false);
    });

    it('should identify INVALID_TEMPLATE as non-retryable', () => {
      // Arrange
      const error = new Error('INVALID_TEMPLATE: Template not found');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(false);
    });

    it('should identify UNSUBSCRIBED as non-retryable', () => {
      // Arrange
      const error = new Error('UNSUBSCRIBED: User has unsubscribed from emails');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(false);
    });

    it('should treat network errors as retryable', () => {
      // Arrange
      const error = new Error('Network timeout occurred');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should treat service unavailable as retryable', () => {
      // Arrange
      const error = new Error('Service temporarily unavailable');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should treat rate limit errors as retryable', () => {
      // Arrange
      const error = new Error('Rate limit exceeded');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
    });

    it('should treat unknown errors as retryable by default', () => {
      // Arrange
      const error = new Error('Unknown error occurred');

      // Act
      const isRetryable = (processor as any).isRetryableError(error);

      // Assert
      expect(isRetryable).toBe(true);
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
      await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

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
      await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      const stepsWithNames = progressCalls.filter((p) => p.currentStep);
      expect(stepsWithNames).toHaveLength(4);
      expect(stepsWithNames[0].currentStep).toBe('preparation');
      expect(stepsWithNames[1].currentStep).toBe('rendering');
      expect(stepsWithNames[2].currentStep).toBe('sending');
      expect(stepsWithNames[3].currentStep).toBe('verification');
    });
  });

  describe('Job Metrics', () => {
    it('should log metrics after successful delivery', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(Logger.prototype.debug).toHaveBeenCalledWith(
        expect.stringContaining('Job metrics'),
        expect.objectContaining({
          processorName: 'NotificationProcessor',
          success: true,
        }),
      );
    });

    it('should include duration in metrics', async () => {
      // Arrange
      const mockJob = createMockJob();

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data object', async () => {
      // Arrange
      const mockJob = createMockJob({
        data: {},
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle very long recipient strings', async () => {
      // Arrange
      const mockJob = createMockJob({
        recipient: 'a'.repeat(100) + '@example.com',
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle special characters in templates', async () => {
      // Arrange
      const mockJob = createMockJob({
        template: 'special-template-2024_v1',
      });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true);
    });

    it('should handle concurrent notifications', async () => {
      // Arrange
      const jobs = Array.from({ length: 5 }, (_, i) =>
        createMockJob({ recipient: `user${i}@example.com` }),
      );

      // Act
      const results = await Promise.all(
        jobs.map((job) => processor.handleSendEmail(job as Job<NotificationSendingJobData>)),
      );

      // Assert
      expect(results).toHaveLength(5);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle progress update failure gracefully', async () => {
      // Arrange
      const mockJob = createMockJob();
      (mockJob.progress as jest.Mock).mockRejectedValueOnce(new Error('Progress update failed'));

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.success).toBe(true); // Job should still succeed
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  describe('Attempt Tracking', () => {
    it('should increment attemptsMade', async () => {
      // Arrange
      const mockJob = createMockJob({}, { attemptsMade: 0 });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.attemptsMade).toBe(1);
    });

    it('should track multiple attempts', async () => {
      // Arrange
      const mockJob = createMockJob({}, { attemptsMade: 2 });

      // Act
      const result = await processor.handleSendEmail(mockJob as Job<NotificationSendingJobData>);

      // Assert
      expect(result.attemptsMade).toBe(3);
    });
  });
});
