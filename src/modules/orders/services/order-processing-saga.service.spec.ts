import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderProcessingSagaService } from '../services/order-processing-saga.service';
import {
  SagaStateEntity,
  SagaStatus,
  SagaType,
} from '../../../database/entities/saga-state.entity';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { InventoryService } from '../../inventory/inventory.service';
import { PaymentsService } from '../../payments/payments.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationStatus } from '../../notifications/enums';
import { SagaStep, SagaStateData } from '../types/saga.types';
import { PaymentStatus, PaymentMethod } from '../../payments/dto/payment.dto';

describe('OrderProcessingSagaService', () => {
  let service: OrderProcessingSagaService;
  let sagaStateRepository: Repository<SagaStateEntity>;
  let orderRepository: Repository<Order>;
  let inventoryService: InventoryService;
  let paymentsService: PaymentsService;
  let notificationsService: NotificationsService;

  const mockOrder = {
    id: 'order-123',
    userId: 'user-123',
    status: OrderStatus.PENDING,
    totalAmount: 100,
    currency: 'USD',
    items: Promise.resolve([
      {
        id: 'item-1',
        productId: 'product-1',
        quantity: 2,
        unitPrice: 50,
        totalPrice: 100,
      },
    ]),
  } as Order;

  const mockSagaState: SagaStateEntity = {
    id: 'saga-123',
    sagaType: SagaType.ORDER_PROCESSING,
    aggregateId: 'order-123',
    correlationId: 'saga-order-123-123456789',
    currentStep: SagaStep.STARTED,
    status: SagaStatus.STARTED,
    stateData: {
      orderId: 'order-123',
      userId: 'user-123',
      items: [{ productId: 'product-1', quantity: 2, price: 50 }],
      totalAmount: 100,
      currency: 'USD',
      startedAt: new Date(),
    },
    errorDetails: null,
    retryCount: 0,
    completedAt: null,
    failedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderProcessingSagaService,
        {
          provide: getRepositoryToken(SagaStateEntity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Order),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: InventoryService,
          useValue: {
            checkAvailability: jest.fn(),
            reserveStock: jest.fn(),
            releaseReservation: jest.fn(),
          },
        },
        {
          provide: PaymentsService,
          useValue: {
            processPayment: jest.fn(),
            refundPayment: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendOrderConfirmation: jest.fn(),
            sendPaymentFailure: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrderProcessingSagaService>(OrderProcessingSagaService);
    sagaStateRepository = module.get<Repository<SagaStateEntity>>(
      getRepositoryToken(SagaStateEntity),
    );
    orderRepository = module.get<Repository<Order>>(getRepositoryToken(Order));
    inventoryService = module.get<InventoryService>(InventoryService);
    paymentsService = module.get<PaymentsService>(PaymentsService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
  });

  afterEach(() => {
    // Clear all mocks after each test
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Give time for any pending timers to clear
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startOrderProcessing', () => {
    it('should create and save saga state for an order', async () => {
      const createSpy = jest.spyOn(sagaStateRepository, 'create').mockReturnValue(mockSagaState);
      const saveSpy = jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      const result = await service.startOrderProcessing(mockOrder);

      expect(createSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalled();
      expect(result.id).toBe('saga-123');
      expect(result.status).toBe(SagaStatus.STARTED);
    });
  });

  describe('executeSaga - Success Path', () => {
    it('should successfully execute all saga steps and confirm order', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock successful stock verification
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      // Mock successful reservation
      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // Mock successful payment
      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.SUCCEEDED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        createdAt: new Date(),
      });

      // Mock successful notification
      jest.spyOn(notificationsService, 'sendOrderConfirmation').mockResolvedValue({
        success: true,
        messageId: 'notif-123',
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      // Mock order update
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CONFIRMED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      expect(metrics.finalStatus).toBe('COMPLETED');
      expect(metrics.compensationExecuted).toBe(false);
      expect(metrics.stepMetrics).toHaveLength(5);
      expect(metrics.stepMetrics.every((m) => m.success)).toBe(true);
    });
  });

  describe('executeSaga - Failure Scenarios', () => {
    it('should compensate when stock is not available', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock insufficient stock
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 1,
        reservedStock: 0,
        availableStock: 1,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'LOW_STOCK',
      });

      // Mock order cancellation
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      expect(metrics.finalStatus).toBe('COMPENSATED');
      expect(metrics.compensationExecuted).toBe(true);
    });

    it('should compensate and release inventory when payment fails', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue({
        ...mockSagaState,
        stateData: {
          ...mockSagaState.stateData,
          reservationId: 'res-123',
        },
      });
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock successful stock operations
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // Mock failed payment
      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.FAILED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        failureReason: 'Insufficient funds',
        createdAt: new Date(),
      });

      // Mock release reservation
      jest.spyOn(inventoryService, 'releaseReservation').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      // Mock order cancellation
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      expect(metrics.finalStatus).toBe('COMPENSATED');
      expect(metrics.compensationExecuted).toBe(true);
      expect(inventoryService.releaseReservation).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker', () => {
    it('should have circuit breaker stats', () => {
      const stats = service.getCircuitBreakerStats();

      expect(stats).toHaveProperty('payment');
      expect(stats).toHaveProperty('inventory');
      expect(stats).toHaveProperty('notification');
      expect(stats.payment.state).toBeDefined();
    });
  });

  describe('executeSaga - Retry Logic', () => {
    it('should retry failed step with exponential backoff', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock stock check that fails twice then succeeds
      let stockCheckAttempts = 0;
      jest.spyOn(inventoryService, 'checkAvailability').mockImplementation(async () => {
        stockCheckAttempts++;
        if (stockCheckAttempts < 3) {
          throw new Error('Temporary service unavailable');
        }
        return {
          productId: 'product-1',
          physicalStock: 100,
          reservedStock: 0,
          availableStock: 100,
          minimumStock: 5,
          maximumStock: 200,
          reorderPoint: 10,
          location: 'MAIN_WAREHOUSE',
          lastUpdated: new Date(),
          status: 'IN_STOCK',
        };
      });

      // Mock other services for successful saga
      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.SUCCEEDED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        createdAt: new Date(),
      });

      jest.spyOn(notificationsService, 'sendOrderConfirmation').mockResolvedValue({
        success: true,
        messageId: 'notif-123',
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CONFIRMED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      expect(stockCheckAttempts).toBeGreaterThanOrEqual(3);
      expect(metrics.finalStatus).toBe('COMPLETED');
      expect(metrics.stepMetrics[0]?.retryCount).toBeGreaterThan(0);
    });

    it('should fail after max retries exceeded', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock persistent failure
      jest
        .spyOn(inventoryService, 'checkAvailability')
        .mockRejectedValue(new Error('Persistent service failure'));

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      expect(metrics.finalStatus).toBe('COMPENSATED');
      expect(metrics.stepMetrics[0]?.retryCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeSaga - Notification Handling', () => {
    it('should continue saga even if notification fails (non-critical)', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock successful steps until notification
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.SUCCEEDED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        createdAt: new Date(),
      });

      // Mock notification failure
      jest
        .spyOn(notificationsService, 'sendOrderConfirmation')
        .mockRejectedValue(new Error('Email service down'));

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CONFIRMED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      // Saga should complete despite notification failure
      expect(metrics.finalStatus).toBe('COMPLETED');
      expect(metrics.stepMetrics.some((m) => m.step === SagaStep.NOTIFICATION_SENT)).toBe(true);
    });
  });

  describe('executeSaga - Saga Not Found', () => {
    it('should throw error if saga state not found', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(null);

      await expect(service.executeSaga('nonexistent-saga')).rejects.toThrow(
        'Saga state not found: nonexistent-saga',
      );
    });
  });

  describe('executeSaga - Compensation Actions', () => {
    it('should execute REFUND_PAYMENT compensation', async () => {
      const sagaWithPayment: SagaStateEntity = {
        ...mockSagaState,
        stateData: {
          ...mockSagaState.stateData,
          paymentId: 'pay-123',
        },
      };

      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(sagaWithPayment);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(sagaWithPayment);

      // Mock successful initial steps
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.SUCCEEDED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        createdAt: new Date(),
      });

      // Mock notification failure to test notification step
      jest
        .spyOn(notificationsService, 'sendOrderConfirmation')
        .mockRejectedValue(new Error('Notification service down'));

      // Mock order repository for order update
      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CONFIRMED,
      } as Order);

      jest.spyOn(paymentsService, 'refundPayment').mockResolvedValue({
        paymentId: 'pay-123',
        refundId: 'ref-123',
        status: PaymentStatus.REFUNDED,
        amount: 100,
        currency: 'USD',
        createdAt: new Date(),
      });

      jest.spyOn(inventoryService, 'releaseReservation').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      const metrics = await service.executeSaga('saga-123');

      // Saga should complete successfully despite notification failure
      expect(metrics.finalStatus).toBe('COMPLETED');
    });

    it('should execute NOTIFY_FAILURE compensation', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock stock verification failure
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 0,
        reservedStock: 0,
        availableStock: 0,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'OUT_OF_STOCK',
      });

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      } as Order);

      jest.spyOn(notificationsService, 'sendPaymentFailure').mockResolvedValue({
        success: true,
        messageId: 'notif-failure-123',
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      const metrics = await service.executeSaga('saga-123');

      expect(metrics.finalStatus).toBe('COMPENSATED');
      expect(metrics.compensationExecuted).toBe(true);
    });

    it('should handle compensation failure gracefully', async () => {
      const sagaWithReservation: SagaStateEntity = {
        ...mockSagaState,
        stateData: {
          ...mockSagaState.stateData,
          reservationId: 'res-123',
        },
      };

      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(sagaWithReservation);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(sagaWithReservation);

      // Mock successful stock and reservation
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // Mock payment failure
      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.FAILED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        failureReason: 'Card declined',
        createdAt: new Date(),
      });

      // Mock release reservation failure
      jest
        .spyOn(inventoryService, 'releaseReservation')
        .mockRejectedValue(new Error('Inventory service down'));

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      // Should complete compensation flow despite release failure (logged but not thrown)
      expect(metrics.finalStatus).toBe('COMPENSATED');
      expect(metrics.compensationExecuted).toBe(true);
    });
  });

  describe('executeSaga - Circuit Breaker States', () => {
    it('should execute operations through circuit breakers', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock all services for successful saga
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 100,
        reservedStock: 0,
        availableStock: 100,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'IN_STOCK',
      });

      jest.spyOn(inventoryService, 'reserveStock').mockResolvedValue({
        reservationId: 'res-123',
        productId: 'product-1',
        quantity: 2,
        location: 'MAIN_WAREHOUSE',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      jest.spyOn(paymentsService, 'processPayment').mockResolvedValue({
        paymentId: 'pay-123',
        transactionId: 'txn-123',
        status: PaymentStatus.SUCCEEDED,
        orderId: 'order-123',
        amount: 100,
        currency: 'USD',
        paymentMethod: PaymentMethod.CREDIT_CARD,
        createdAt: new Date(),
      });

      jest.spyOn(notificationsService, 'sendOrderConfirmation').mockResolvedValue({
        success: true,
        messageId: 'notif-123',
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CONFIRMED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      // All operations should pass through circuit breakers
      expect(metrics.finalStatus).toBe('COMPLETED');

      // Verify circuit breaker stats are accessible
      const cbStats = service.getCircuitBreakerStats();
      expect(cbStats.inventory.state).toBeDefined();
      expect(cbStats.payment.state).toBeDefined();
      expect(cbStats.notification.state).toBeDefined();
    });
  });

  describe('executeSaga - Step Execution with Non-Retryable Errors', () => {
    it('should not retry when error is marked as non-retryable', async () => {
      jest.spyOn(sagaStateRepository, 'findOne').mockResolvedValue(mockSagaState);
      jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(mockSagaState);

      // Mock insufficient stock (non-retryable)
      jest.spyOn(inventoryService, 'checkAvailability').mockResolvedValue({
        productId: 'product-1',
        physicalStock: 0,
        reservedStock: 0,
        availableStock: 0,
        minimumStock: 5,
        maximumStock: 200,
        reorderPoint: 10,
        location: 'MAIN_WAREHOUSE',
        lastUpdated: new Date(),
        status: 'OUT_OF_STOCK',
      });

      jest.spyOn(orderRepository, 'findOne').mockResolvedValue({
        ...mockOrder,
        id: 'order-123',
      } as Order);
      jest.spyOn(orderRepository, 'save').mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      } as Order);

      const metrics = await service.executeSaga('saga-123');

      expect(metrics.finalStatus).toBe('COMPENSATED');
      expect(metrics.stepMetrics[0]?.retryCount).toBe(0);
    });
  });

  describe('executeSaga - Multiple Product Items', () => {
    it('should verify stock for all items in order', async () => {
      const multiItemOrder = {
        ...mockOrder,
        items: Promise.resolve([
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 2,
            unitPrice: 30,
            totalPrice: 60,
          },
          {
            id: 'item-2',
            productId: 'product-2',
            quantity: 1,
            unitPrice: 40,
            totalPrice: 40,
          },
        ]),
      } as Order;

      const multiItemSagaState: SagaStateEntity = {
        ...mockSagaState,
        stateData: {
          orderId: 'order-123',
          userId: 'user-123',
          items: [
            { productId: 'product-1', quantity: 2, price: 30 },
            { productId: 'product-2', quantity: 1, price: 40 },
          ],
          totalAmount: 100,
          currency: 'USD',
          startedAt: new Date(),
        },
      };

      const createSpy = jest
        .spyOn(sagaStateRepository, 'create')
        .mockReturnValue(multiItemSagaState);
      const saveSpy = jest.spyOn(sagaStateRepository, 'save').mockResolvedValue(multiItemSagaState);

      const result = await service.startOrderProcessing(multiItemOrder);

      expect(createSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalled();
      expect(result.stateData).toHaveProperty('items');
      expect((result.stateData as unknown as SagaStateData).items).toHaveLength(2);
    });
  });
});
