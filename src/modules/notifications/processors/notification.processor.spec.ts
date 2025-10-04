import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { NotificationProcessor } from './notification.processor';
import { NotificationsService } from '../notifications.service';
import { NotificationPriority } from '../enums';
import { SendOrderConfirmationDto, SendPaymentFailureDto, SendShippingUpdateDto } from '../dto';

describe('NotificationProcessor (modules/notifications)', () => {
  let processor: NotificationProcessor;
  let notificationsService: jest.Mocked<NotificationsService>;

  beforeEach(async () => {
    const mockNotificationsService = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendPaymentFailure: jest.fn().mockResolvedValue(undefined),
      sendShippingUpdate: jest.fn().mockResolvedValue(undefined),
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
    notificationsService = module.get(NotificationsService);

    // Suppress logger output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Order Confirmation Notifications', () => {
    it('should process order-confirmation job successfully', async () => {
      const orderData: SendOrderConfirmationDto = {
        orderId: 'order-456',
        orderNumber: 'ORD-123',
        items: [
          {
            productId: 'prod-123',
            quantity: 2,
            price: 29.99,
          },
        ],
        totalAmount: 59.98,
        currency: 'USD',
      };

      const mockJob = {
        id: '1',
        data: {
          type: 'order-confirmation' as const,
          data: orderData,
          priority: NotificationPriority.HIGH,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result).toEqual({
        success: true,
        jobId: '1',
      });

      expect(notificationsService.sendOrderConfirmation).toHaveBeenCalledWith(orderData);
      expect(notificationsService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
    });

    it('should log processing start for order-confirmation', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      const mockJob = {
        id: '2',
        data: {
          type: 'order-confirmation' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-456',
            orderNumber: 'ORD-123',
            items: [],
            total: 0,
            estimatedDelivery: new Date(),
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      await processor.handleNotification(mockJob);

      expect(logSpy).toHaveBeenCalledWith(
        'Processing notification job 2 of type order-confirmation',
      );
    });

    it('should log success after processing order-confirmation', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');

      const mockJob = {
        id: '3',
        data: {
          type: 'order-confirmation' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-456',
            orderNumber: 'ORD-123',
            items: [],
            total: 0,
            estimatedDelivery: new Date(),
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      await processor.handleNotification(mockJob);

      expect(logSpy).toHaveBeenCalledWith('Successfully processed notification job 3');
    });
  });

  describe('Payment Failure Notifications', () => {
    it('should process payment-failure job successfully', async () => {
      const paymentData: SendPaymentFailureDto = {
        orderId: 'order-111',
        orderNumber: 'ORD-789',
        reason: 'Insufficient funds',
      };

      const mockJob = {
        id: '4',
        data: {
          type: 'payment-failure' as const,
          data: paymentData,
          priority: NotificationPriority.HIGH,
          userId: 'user-789',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result).toEqual({
        success: true,
        jobId: '4',
      });

      expect(notificationsService.sendPaymentFailure).toHaveBeenCalledWith(paymentData);
      expect(notificationsService.sendPaymentFailure).toHaveBeenCalledTimes(1);
    });

    it('should handle high priority payment failures', async () => {
      const mockJob = {
        id: '5',
        data: {
          type: 'payment-failure' as const,
          data: {
            userId: 'user-urgent',
            orderId: 'order-urgent',
            orderNumber: 'ORD-URGENT',
            amount: 999.99,
            failureReason: 'Card declined',
            attemptNumber: 3,
          },
          priority: NotificationPriority.HIGH,
          userId: 'user-urgent',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result.success).toBe(true);
      expect(notificationsService.sendPaymentFailure).toHaveBeenCalled();
    });
  });

  describe('Shipping Update Notifications', () => {
    it('should process shipping-update job successfully', async () => {
      const shippingData: SendShippingUpdateDto = {
        orderId: 'order-666',
        orderNumber: 'ORD-555',
        trackingNumber: 'TRACK-123456',
        carrier: 'UPS',
      };

      const mockJob = {
        id: '6',
        data: {
          type: 'shipping-update' as const,
          data: shippingData,
          priority: NotificationPriority.NORMAL,
          userId: 'user-555',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result).toEqual({
        success: true,
        jobId: '6',
      });

      expect(notificationsService.sendShippingUpdate).toHaveBeenCalledWith(shippingData);
      expect(notificationsService.sendShippingUpdate).toHaveBeenCalledTimes(1);
    });

    it('should handle different shipping statuses', async () => {
      const statuses = ['shipped', 'in_transit', 'out_for_delivery', 'delivered'];

      for (const status of statuses) {
        const mockJob = {
          id: `job-${status}`,
          data: {
            type: 'shipping-update' as const,
            data: {
              userId: 'user-123',
              orderId: 'order-123',
              orderNumber: 'ORD-123',
              trackingNumber: 'TRACK-123',
              carrier: 'FedEx',
              status,
              estimatedDelivery: new Date(),
            },
            priority: NotificationPriority.NORMAL,
            userId: 'user-123',
          },
        } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

        const result = await processor.handleNotification(mockJob);

        expect(result.success).toBe(true);
      }

      expect(notificationsService.sendShippingUpdate).toHaveBeenCalledTimes(statuses.length);
    });
  });

  describe('Welcome Email Notifications', () => {
    it('should process welcome job successfully', async () => {
      const mockJob = {
        id: '7',
        data: {
          type: 'welcome' as const,
          data: { userName: 'John Doe' },
          priority: NotificationPriority.LOW,
          userId: 'user-welcome',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result).toEqual({
        success: true,
        jobId: '7',
      });

      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledWith('user-welcome');
      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle welcome emails with different user IDs', async () => {
      const userIds = ['user-1', 'user-2', 'user-3'];

      for (const userId of userIds) {
        const mockJob = {
          id: `job-${userId}`,
          data: {
            type: 'welcome' as const,
            data: {},
            priority: NotificationPriority.LOW,
            userId,
          },
        } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

        await processor.handleNotification(mockJob);
      }

      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledTimes(userIds.length);
      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledWith('user-1');
      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledWith('user-2');
      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledWith('user-3');
    });
  });

  describe('Error Handling', () => {
    it('should rethrow errors for Bull to handle retries', async () => {
      const error = new Error('Service unavailable');
      notificationsService.sendOrderConfirmation.mockRejectedValue(error);

      const mockJob = {
        id: '8',
        data: {
          type: 'order-confirmation' as const,
          data: {
            userId: 'user-error',
            orderId: 'order-error',
            orderNumber: 'ORD-ERROR',
            items: [],
            total: 0,
            estimatedDelivery: new Date(),
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-error',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      await expect(processor.handleNotification(mockJob)).rejects.toThrow('Service unavailable');
    });

    it('should log error when notification fails', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');
      const error = new Error('Network timeout');
      notificationsService.sendPaymentFailure.mockRejectedValue(error);

      const mockJob = {
        id: '9',
        data: {
          type: 'payment-failure' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-123',
            orderNumber: 'ORD-123',
            amount: 100,
            failureReason: 'Test',
            attemptNumber: 1,
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      try {
        await processor.handleNotification(mockJob);
      } catch (e) {
        // Expected
      }

      expect(errorSpy).toHaveBeenCalledWith('Failed to process notification job 9:', error);
    });

    it('should handle errors in shipping updates', async () => {
      const error = new Error('Carrier API down');
      notificationsService.sendShippingUpdate.mockRejectedValue(error);

      const mockJob = {
        id: '10',
        data: {
          type: 'shipping-update' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-123',
            orderNumber: 'ORD-123',
            trackingNumber: 'TRACK-123',
            carrier: 'USPS',
            status: 'shipped',
            estimatedDelivery: new Date(),
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      await expect(processor.handleNotification(mockJob)).rejects.toThrow('Carrier API down');
    });

    it('should handle errors in welcome emails', async () => {
      const error = new Error('Template not found');
      notificationsService.sendWelcomeEmail.mockRejectedValue(error);

      const mockJob = {
        id: '11',
        data: {
          type: 'welcome' as const,
          data: {},
          priority: NotificationPriority.LOW,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      await expect(processor.handleNotification(mockJob)).rejects.toThrow('Template not found');
    });
  });

  describe('Priority Levels', () => {
    it('should handle HIGH priority notifications', async () => {
      const mockJob = {
        id: '12',
        data: {
          type: 'payment-failure' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-123',
            orderNumber: 'ORD-123',
            amount: 100,
            failureReason: 'Test',
            attemptNumber: 1,
          },
          priority: NotificationPriority.HIGH,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result.success).toBe(true);
    });

    it('should handle NORMAL priority notifications', async () => {
      const mockJob = {
        id: '13',
        data: {
          type: 'shipping-update' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-123',
            orderNumber: 'ORD-123',
            trackingNumber: 'TRACK-123',
            carrier: 'DHL',
            status: 'in_transit',
            estimatedDelivery: new Date(),
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result.success).toBe(true);
    });

    it('should handle LOW priority notifications', async () => {
      const mockJob = {
        id: '14',
        data: {
          type: 'welcome' as const,
          data: {},
          priority: NotificationPriority.LOW,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result.success).toBe(true);
    });
  });

  describe('Job Result Structure', () => {
    it('should return consistent result structure', async () => {
      const mockJob = {
        id: '15',
        data: {
          type: 'order-confirmation' as const,
          data: {
            userId: 'user-123',
            orderId: 'order-123',
            orderNumber: 'ORD-123',
            items: [],
            total: 0,
            estimatedDelivery: new Date(),
          },
          priority: NotificationPriority.NORMAL,
          userId: 'user-123',
        },
      } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await processor.handleNotification(mockJob);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('jobId');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.jobId).toBe('string');
    });

    it('should include correct job ID in result', async () => {
      const jobIds = ['job-a', 'job-b', 'job-c'];

      for (const jobId of jobIds) {
        const mockJob = {
          id: jobId,
          data: {
            type: 'welcome' as const,
            data: {},
            priority: NotificationPriority.LOW,
            userId: 'user-123',
          },
        } as Job; // eslint-disable-line @typescript-eslint/no-explicit-any

        const result = await processor.handleNotification(mockJob);

        expect(result.jobId).toBe(jobId);
      }
    });
  });

  describe('Concurrent Job Processing', () => {
    it('should handle multiple concurrent jobs', async () => {
      const jobs = [
        {
          id: '16',
          data: {
            type: 'order-confirmation' as const,
            data: {
              userId: 'user-1',
              orderId: 'order-1',
              orderNumber: 'ORD-1',
              items: [],
              total: 100,
              estimatedDelivery: new Date(),
            },
            priority: NotificationPriority.NORMAL,
            userId: 'user-1',
          },
        },
        {
          id: '17',
          data: {
            type: 'payment-failure' as const,
            data: {
              userId: 'user-2',
              orderId: 'order-2',
              orderNumber: 'ORD-2',
              amount: 200,
              failureReason: 'Test',
              attemptNumber: 1,
            },
            priority: NotificationPriority.HIGH,
            userId: 'user-2',
          },
        },
        {
          id: '18',
          data: {
            type: 'welcome' as const,
            data: {},
            priority: NotificationPriority.LOW,
            userId: 'user-3',
          },
        },
      ] as Job[]; // eslint-disable-line @typescript-eslint/no-explicit-any

      const results = await Promise.all(jobs.map((job) => processor.handleNotification(job)));

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      expect(notificationsService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
      expect(notificationsService.sendPaymentFailure).toHaveBeenCalledTimes(1);
      expect(notificationsService.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    });
  });
});
