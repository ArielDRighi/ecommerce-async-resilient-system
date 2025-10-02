import { BaseEventHandler } from './base.event-handler';
import { DomainEvent } from '../interfaces/event.interface';

// Mock concrete implementation for testing
class TestEventHandler extends BaseEventHandler<DomainEvent> {
  get eventType(): string {
    return 'TestEvent';
  }

  async handle(event: DomainEvent): Promise<void> {
    // Test implementation
    if (event.aggregateId === 'fail') {
      throw new Error('Test error');
    }
  }
}

describe('BaseEventHandler', () => {
  let handler: TestEventHandler;

  beforeEach(() => {
    handler = new TestEventHandler('TestContext');
  });

  describe('canHandle', () => {
    it('should return true when event type matches', () => {
      // Arrange & Act
      const result = handler.canHandle('TestEvent');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when event type does not match', () => {
      // Arrange & Act
      const result = handler.canHandle('OtherEvent');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute handler successfully when valid event provided', async () => {
      // Arrange
      const event: DomainEvent = {
        eventId: 'test-1',
        eventType: 'TestEvent',
        aggregateType: 'Test',
        aggregateId: 'test-123',
        version: 1,
        timestamp: new Date(),
        userId: 'user-1',
      };

      // Act & Assert
      await expect(handler.execute(event)).resolves.toBeUndefined();
    });

    it('should handle errors and rethrow when handler fails', async () => {
      // Arrange
      const event: DomainEvent = {
        eventId: 'test-2',
        eventType: 'TestEvent',
        aggregateType: 'Test',
        aggregateId: 'fail',
        version: 1,
        timestamp: new Date(),
        userId: 'user-1',
      };

      // Act & Assert
      await expect(handler.execute(event)).rejects.toThrow('Test error');
    });
  });

  describe('eventType getter', () => {
    it('should return correct event type when accessed', () => {
      // Arrange & Act
      const result = handler.eventType;

      // Assert
      expect(result).toBe('TestEvent');
    });
  });
});
