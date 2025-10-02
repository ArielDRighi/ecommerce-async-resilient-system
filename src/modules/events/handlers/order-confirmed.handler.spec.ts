import { Test, TestingModule } from '@nestjs/testing';
import { OrderConfirmedHandler } from './order-confirmed.handler';
import { OrderConfirmedEvent } from '../types/order.events';

describe('OrderConfirmedHandler', () => {
  let handler: OrderConfirmedHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrderConfirmedHandler],
    }).compile();

    handler = module.get<OrderConfirmedHandler>(OrderConfirmedHandler);
  });

  describe('eventType', () => {
    it('should return OrderConfirmed when accessed', () => {
      // Arrange & Act
      const result = handler.eventType;

      // Assert
      expect(result).toBe('OrderConfirmed');
    });
  });

  describe('canHandle', () => {
    it('should return true when OrderConfirmed event provided', () => {
      // Arrange & Act
      const result = handler.canHandle('OrderConfirmed');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when other event type provided', () => {
      // Arrange & Act
      const result = handler.canHandle('OrderCreated');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('handle', () => {
    it('should process event successfully when valid OrderConfirmed event provided', async () => {
      // Arrange
      const event: OrderConfirmedEvent = {
        eventId: 'evt-456',
        eventType: 'OrderConfirmed',
        aggregateType: 'Order',
        aggregateId: 'order-456',
        orderId: 'order-456',
        userId: 'user-456',
        version: 1,
        timestamp: new Date(),
        paymentId: 'pay-789',
        confirmedAt: new Date(),
      };

      // Act & Assert
      await expect(handler.handle(event)).resolves.toBeUndefined();
    });

    it('should handle event successfully when correlation data provided', async () => {
      // Arrange
      const event: OrderConfirmedEvent = {
        eventId: 'evt-457',
        eventType: 'OrderConfirmed',
        aggregateType: 'Order',
        aggregateId: 'order-457',
        orderId: 'order-457',
        userId: 'user-457',
        version: 1,
        timestamp: new Date(),
        correlationId: 'corr-123',
        causationId: 'cause-456',
        paymentId: 'pay-790',
        confirmedAt: new Date(),
      };

      // Act & Assert
      await expect(handler.handle(event)).resolves.toBeUndefined();
    });
  });
});
