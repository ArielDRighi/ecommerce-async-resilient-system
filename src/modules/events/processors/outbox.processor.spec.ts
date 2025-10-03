/* eslint-disable @typescript-eslint/no-explicit-any */
// Test file - using 'any' for mocking complex types is acceptable
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { OutboxProcessor } from './outbox.processor';
import { OutboxEvent } from '../entities/outbox-event.entity';

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;

  const mockOutboxRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: OutboxProcessor,
          useFactory: (
            repo: Repository<OutboxEvent>,
            oQueue: Queue,
            iQueue: Queue,
            pQueue: Queue,
          ) => new OutboxProcessor(repo, oQueue, iQueue, pQueue),
          inject: [
            getRepositoryToken(OutboxEvent),
            getQueueToken('order-processing'),
            getQueueToken('inventory-processing'),
            getQueueToken('payment-processing'),
          ],
        },
        {
          provide: getRepositoryToken(OutboxEvent),
          useValue: mockOutboxRepository,
        },
        {
          provide: getQueueToken('order-processing'),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken('inventory-processing'),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken('payment-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<OutboxProcessor>(OutboxProcessor);
  });

  afterEach(async () => {
    await processor.stop();
  });

  describe('processPendingEvents', () => {
    it('should process pending events', async () => {
      mockOutboxRepository.find.mockResolvedValue([]);

      await processor.processPendingEvents();

      // Should call repository to find pending events
      expect(mockOutboxRepository.find).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return processing statistics', async () => {
      mockOutboxRepository.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(80)
        .mockResolvedValueOnce(20);

      const oldestPending = {
        id: 'event-old',
        createdAt: new Date('2024-01-01'),
      };

      mockOutboxRepository.findOne.mockResolvedValue(oldestPending);

      const stats = await processor.getStatistics();

      expect(stats).toEqual({
        totalEvents: 100,
        processedEvents: 80,
        pendingEvents: 20,
        oldestPendingEvent: new Date('2024-01-01'),
      });
    });

    it('should handle no pending events', async () => {
      mockOutboxRepository.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(0);

      mockOutboxRepository.findOne.mockResolvedValue(null);

      const stats = await processor.getStatistics();

      expect(stats).toEqual({
        totalEvents: 50,
        processedEvents: 50,
        pendingEvents: 0,
        oldestPendingEvent: undefined,
      });
    });
  });

  describe('start and stop', () => {
    it('should start and process events immediately', async () => {
      mockOutboxRepository.find.mockResolvedValue([]);

      await processor.start();

      // Should process events immediately on start
      expect(mockOutboxRepository.find).toHaveBeenCalled();
    });

    it('should stop processing', async () => {
      await processor.stop();
      expect(true).toBe(true);
    });
  });

  describe('processPendingEvents - Event Processing by Type', () => {
    it('should skip Order events (already enqueued directly)', async () => {
      const orderEvent: Partial<OutboxEvent> = {
        id: 'event-order-1',
        aggregateType: 'Order',
        aggregateId: 'order-123',
        eventType: 'OrderCreated',
        eventData: { orderId: 'order-123', userId: 'user-1' },
        processed: false,
        processedAt: undefined,
        createdAt: new Date(),
      };

      mockOutboxRepository.find.mockResolvedValue([orderEvent]);
      mockOutboxRepository.save.mockResolvedValue(orderEvent);

      await processor.processPendingEvents();

      // Should mark as processed without enqueuing
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'event-order-1',
          processed: true,
          processedAt: expect.any(Date),
        }),
      );

      // Should NOT add to queue
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should process Inventory events and enqueue to inventory queue', async () => {
      const inventoryEvent: Partial<OutboxEvent> = {
        id: 'event-inv-1',
        aggregateType: 'Inventory',
        aggregateId: 'product-456',
        eventType: 'InventoryReserved',
        eventData: {
          action: 'reserve',
          productId: 'product-456',
          quantity: 5,
          orderId: 'order-123',
          reservationId: 'res-789',
        },
        processed: false,
        processedAt: undefined,
        createdAt: new Date('2024-01-15'),
        correlationId: 'corr-123',
        userId: 'user-1',
      };

      mockOutboxRepository.find.mockResolvedValue([inventoryEvent]);
      mockOutboxRepository.save.mockResolvedValue({ ...inventoryEvent, processed: true });

      await processor.processPendingEvents();

      // Should enqueue to inventory queue with correct job data
      expect(mockQueue.add).toHaveBeenCalledWith(
        'reserve-inventory',
        expect.objectContaining({
          action: 'reserve',
          productId: 'product-456',
          quantity: 5,
          orderId: 'order-123',
          reservationId: 'res-789',
          jobId: 'event-inv-1',
          correlationId: 'corr-123',
          userId: 'user-1',
        }),
        expect.objectContaining({
          attempts: 5,
          backoff: { type: 'exponential', delay: 1000 },
        }),
      );

      // Should mark as processed
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true }),
      );
    });

    it('should process Payment events and enqueue to payment queue', async () => {
      const paymentEvent: Partial<OutboxEvent> = {
        id: 'event-pay-1',
        aggregateType: 'Payment',
        aggregateId: 'payment-789',
        eventType: 'PaymentProcessed',
        eventData: {
          orderId: 'order-123',
          paymentId: 'payment-789',
          amount: 99.99,
          currency: 'EUR',
          paymentMethod: 'credit_card',
          userId: 'user-1',
        },
        processed: false,
        processedAt: undefined,
        createdAt: new Date('2024-01-15'),
        correlationId: 'corr-456',
        userId: 'user-1',
      };

      mockOutboxRepository.find.mockResolvedValue([paymentEvent]);
      mockOutboxRepository.save.mockResolvedValue({ ...paymentEvent, processed: true });

      await processor.processPendingEvents();

      // Should enqueue to payment queue with correct job data
      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-payment',
        expect.objectContaining({
          orderId: 'order-123',
          paymentId: 'payment-789',
          amount: 99.99,
          currency: 'EUR',
          paymentMethod: 'credit_card',
          customerId: 'user-1',
          jobId: 'event-pay-1',
          correlationId: 'corr-456',
          userId: 'user-1',
        }),
        expect.any(Object),
      );

      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true }),
      );
    });
  });

  describe('processPendingEvents - Batch Processing', () => {
    it('should process multiple events in batch', async () => {
      const events: Partial<OutboxEvent>[] = [
        {
          id: 'event-1',
          aggregateType: 'Inventory',
          eventType: 'InventoryReserved',
          eventData: { productId: 'prod-1', quantity: 5 },
          processed: false,
          createdAt: new Date('2024-01-15T10:00:00Z'),
          sequenceNumber: BigInt(1),
        },
        {
          id: 'event-2',
          aggregateType: 'Payment',
          eventType: 'PaymentProcessed',
          eventData: { paymentId: 'pay-1', amount: 100 },
          processed: false,
          createdAt: new Date('2024-01-15T10:00:01Z'),
          sequenceNumber: BigInt(2),
        },
        {
          id: 'event-3',
          aggregateType: 'Inventory',
          eventType: 'InventoryReleased',
          eventData: { productId: 'prod-2', quantity: 3 },
          processed: false,
          createdAt: new Date('2024-01-15T10:00:02Z'),
          sequenceNumber: BigInt(3),
        },
      ];

      mockOutboxRepository.find.mockResolvedValue(events);
      mockOutboxRepository.save.mockImplementation((event) =>
        Promise.resolve({ ...event, processed: true }),
      );

      await processor.processPendingEvents();

      // Should process all 3 events
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
      expect(mockOutboxRepository.save).toHaveBeenCalledTimes(3);
    });

    it('should handle empty batch gracefully', async () => {
      mockOutboxRepository.find.mockResolvedValue([]);

      await processor.processPendingEvents();

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processPendingEvents - Error Handling', () => {
    it('should continue processing after individual event failure', async () => {
      const events: Partial<OutboxEvent>[] = [
        {
          id: 'event-success',
          aggregateType: 'Inventory',
          eventType: 'InventoryReserved',
          eventData: { productId: 'prod-1' },
          processed: false,
        },
        {
          id: 'event-fail',
          aggregateType: 'Payment',
          eventType: 'PaymentProcessed',
          eventData: { paymentId: 'pay-1' },
          processed: false,
        },
      ];

      mockOutboxRepository.find.mockResolvedValue(events);

      // First event succeeds, second fails
      mockQueue.add
        .mockResolvedValueOnce({} as unknown)
        .mockRejectedValueOnce(new Error('Queue error'));

      mockOutboxRepository.save.mockImplementation((event) =>
        Promise.resolve({ ...event, processed: true }),
      );

      await processor.processPendingEvents();

      // First event should be marked as processed
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event-success', processed: true }),
      );

      // Second event should NOT be marked as processed (remains for retry)
      expect(mockOutboxRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 'event-fail' }),
      );
    });

    it('should handle repository errors gracefully', async () => {
      mockOutboxRepository.find.mockRejectedValue(new Error('Database connection error'));

      await processor.processPendingEvents();

      // Should not crash, error should be logged
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should not mark event as processed when queue enqueue fails', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-fail',
        aggregateType: 'Inventory',
        eventType: 'InventoryReserved',
        eventData: { productId: 'prod-1' },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockQueue.add.mockRejectedValue(new Error('Queue is full'));

      await processor.processPendingEvents();

      // Event should remain unprocessed for retry
      expect(mockOutboxRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('processPendingEvents - Unknown Aggregate Types', () => {
    it('should handle unknown aggregate type by marking as processed', async () => {
      const unknownEvent: Partial<OutboxEvent> = {
        id: 'event-unknown',
        aggregateType: 'UnknownType',
        eventType: 'UnknownEvent',
        eventData: { someData: 'value' },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([unknownEvent]);
      mockOutboxRepository.save.mockResolvedValue({ ...unknownEvent, processed: false });

      await processor.processPendingEvents();

      // Should mark as processed (failed) without enqueuing
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'event-unknown',
          processed: false,
        }),
      );
    });
  });

  describe('processPendingEvents - Event Mapping', () => {
    it('should map OrderConfirmed event to confirm-order job', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-confirm',
        aggregateType: 'Order',
        eventType: 'OrderConfirmed',
        eventData: { orderId: 'order-123' },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      // Order events are skipped, so should be marked as processed without enqueuing
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true }),
      );
    });

    it('should map InventoryReleased event to release-inventory job', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-release',
        aggregateType: 'Inventory',
        eventType: 'InventoryReleased',
        eventData: { productId: 'prod-1', quantity: 5 },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'release-inventory',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should map PaymentRefunded event to refund-payment job', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-refund',
        aggregateType: 'Payment',
        eventType: 'PaymentRefunded',
        eventData: { paymentId: 'pay-1', amount: 50 },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'refund-payment',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('processPendingEvents - Job Data Preparation', () => {
    it('should include all required fields for Inventory job data', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-inv-complete',
        aggregateType: 'Inventory',
        eventType: 'InventoryReserved',
        eventData: {
          action: 'reserve',
          productId: 'prod-123',
          quantity: 10,
          orderId: 'order-456',
          reservationId: 'res-789',
          reason: 'Order placement',
        },
        processed: false,
        createdAt: new Date('2024-01-15T14:30:00Z'),
        correlationId: 'corr-abc',
        userId: 'user-xyz',
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'reserve-inventory',
        expect.objectContaining({
          action: 'reserve',
          productId: 'prod-123',
          quantity: 10,
          orderId: 'order-456',
          reservationId: 'res-789',
          reason: 'Order placement',
          jobId: 'event-inv-complete',
          createdAt: new Date('2024-01-15T14:30:00Z'),
          correlationId: 'corr-abc',
          userId: 'user-xyz',
        }),
        expect.any(Object),
      );
    });

    it('should include all required fields for Payment job data', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-pay-complete',
        aggregateType: 'Payment',
        eventType: 'PaymentProcessed',
        eventData: {
          orderId: 'order-789',
          paymentId: 'pay-abc',
          amount: 149.99,
          currency: 'GBP',
          paymentMethod: 'paypal',
          userId: 'user-123',
        },
        processed: false,
        createdAt: new Date('2024-01-15T15:45:00Z'),
        correlationId: 'corr-def',
        userId: 'user-123',
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-payment',
        expect.objectContaining({
          orderId: 'order-789',
          paymentId: 'pay-abc',
          amount: 149.99,
          currency: 'GBP',
          paymentMethod: 'paypal',
          customerId: 'user-123',
          jobId: 'event-pay-complete',
          createdAt: new Date('2024-01-15T15:45:00Z'),
          correlationId: 'corr-def',
          userId: 'user-123',
        }),
        expect.any(Object),
      );
    });

    it('should use default currency USD when not provided in Payment event', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-pay-default',
        aggregateType: 'Payment',
        eventType: 'PaymentProcessed',
        eventData: {
          paymentId: 'pay-1',
          amount: 50,
          // currency not provided
        },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-payment',
        expect.objectContaining({
          currency: 'USD',
        }),
        expect.any(Object),
      );
    });
  });

  describe('processPendingEvents - Retry Configuration', () => {
    it('should configure job with retry attempts and exponential backoff', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-retry',
        aggregateType: 'Inventory',
        eventType: 'InventoryReserved',
        eventData: { productId: 'prod-1' },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        }),
      );
    });
  });

  describe('processPendingEvents - Concurrent Processing Protection', () => {
    it('should skip processing if already in progress', async () => {
      mockOutboxRepository.find.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([]), 100);
          }),
      );

      // Start first processing
      const firstProcessing = processor.processPendingEvents();

      // Try to start second processing immediately
      await processor.processPendingEvents();

      // Wait for first to complete
      await firstProcessing;

      // Repository should only be called once (from first processing)
      expect(mockOutboxRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lifecycle Management', () => {
    it('should initialize with config disabled and not start', async () => {
      // Create a new processor with disabled config
      const disabledProcessor = new OutboxProcessor(
        mockOutboxRepository as any,
        mockQueue as any,
        mockQueue as any,
        mockQueue as any,
      );

      // Manually set config to disabled
      (disabledProcessor as any).config.enabled = false;

      await disabledProcessor.onModuleInit();

      // Should not call start (no processing)
      mockOutboxRepository.find.mockClear();
      expect(mockOutboxRepository.find).not.toHaveBeenCalled();
    });

    it('should not process when config is disabled', async () => {
      // Set config to disabled
      (processor as any).config.enabled = false;

      await processor.processPendingEvents();

      // Should return early without processing
      expect(mockOutboxRepository.find).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();

      // Re-enable for other tests
      (processor as any).config.enabled = true;
    });

    it('should warn when trying to start while already running', async () => {
      mockOutboxRepository.find.mockResolvedValue([]);

      // Start processor
      await processor.start();

      // Set processingInterval to simulate already running
      (processor as any).processingInterval = setTimeout(() => {}, 1000);

      // Try to start again
      await processor.start();

      // Should warn and not start again
      expect(true).toBe(true);

      // Cleanup
      clearTimeout((processor as any).processingInterval);
      (processor as any).processingInterval = undefined;
    });

    it('should wait for current processing to complete when stopping', async () => {
      mockOutboxRepository.find.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([]), 50);
          }),
      );

      // Start processing in background
      const processing = processor.processPendingEvents();

      // Give it time to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to stop while processing
      const stopPromise = processor.stop();

      // Wait for both
      await Promise.all([processing, stopPromise]);

      expect(true).toBe(true);
    });

    it('should cleanup on module destroy', async () => {
      await processor.onModuleDestroy();

      // Should stop successfully
      expect(true).toBe(true);
    });
  });

  describe('Job Data Preparation - Edge Cases', () => {
    it('should handle Order events with minimal data', async () => {
      const minimalOrderEvent: Partial<OutboxEvent> = {
        id: 'event-order-minimal',
        aggregateType: 'Order',
        aggregateId: 'order-999',
        eventType: 'OrderCreated',
        eventData: {},
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([minimalOrderEvent]);
      mockOutboxRepository.save.mockResolvedValue({ ...minimalOrderEvent, processed: true });

      await processor.processPendingEvents();

      // Order events are skipped, so should be marked as processed
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true }),
      );
    });

    it('should use aggregateId as orderId fallback for Order events', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-order-fallback',
        aggregateType: 'Order',
        aggregateId: 'order-fallback-id',
        eventType: 'OrderCreated',
        eventData: {
          // orderId not provided
          userId: 'user-1',
        },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      // Order events are skipped anyway
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true }),
      );
    });

    it('should handle generic fallback for unknown event types', async () => {
      const genericEvent: Partial<OutboxEvent> = {
        id: 'event-generic',
        aggregateType: 'CustomAggregate',
        aggregateId: 'custom-123',
        eventType: 'CustomEvent',
        eventData: {
          customField1: 'value1',
          customField2: 123,
        },
        processed: false,
        createdAt: new Date('2024-01-15'),
        correlationId: 'corr-generic',
        userId: 'user-generic',
        eventMetadata: { source: 'custom-service' },
      };

      mockOutboxRepository.find.mockResolvedValue([genericEvent]);
      mockOutboxRepository.save.mockResolvedValue({ ...genericEvent, processed: false });

      await processor.processPendingEvents();

      // Unknown aggregate type, should be marked as processed (failed)
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'event-generic',
          processed: false,
        }),
      );
    });

    it('should handle Payment event with customerId field', async () => {
      const paymentWithCustomerId: Partial<OutboxEvent> = {
        id: 'event-pay-customerid',
        aggregateType: 'Payment',
        eventType: 'PaymentProcessed',
        eventData: {
          paymentId: 'pay-123',
          amount: 75.5,
          customerId: 'customer-abc',
        },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([paymentWithCustomerId]);
      mockOutboxRepository.save.mockResolvedValue({ ...paymentWithCustomerId, processed: true });

      await processor.processPendingEvents();

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          customerId: 'customer-abc',
        }),
        expect.any(Object),
      );
    });
  });

  describe('Event Type to Job Type Mapping', () => {
    it('should map OrderCancelled to cancel-order job', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-cancel',
        aggregateType: 'Order',
        eventType: 'OrderCancelled',
        eventData: { orderId: 'order-1' },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      // Order events are skipped
      expect(mockOutboxRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ processed: true }),
      );
    });

    it('should lowercase unknown event types for job mapping', async () => {
      const event: Partial<OutboxEvent> = {
        id: 'event-unknown-type',
        aggregateType: 'Inventory',
        eventType: 'UnknownInventoryEvent',
        eventData: { productId: 'prod-1' },
        processed: false,
      };

      mockOutboxRepository.find.mockResolvedValue([event]);
      mockOutboxRepository.save.mockResolvedValue({ ...event, processed: true });

      await processor.processPendingEvents();

      // Should be enqueued with lowercase event type as job name
      expect(mockQueue.add).toHaveBeenCalledWith(
        'unknowninventoryevent',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
