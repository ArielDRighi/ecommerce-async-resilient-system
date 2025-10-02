import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderResponseDto, OrderStatusResponseDto } from './dto';
import { OrderStatus } from './enums/order-status.enum';

/**
 * Unit tests for OrdersController
 * Tests all endpoints: createOrder, getUserOrders, getOrderById, getOrderStatus
 * Coverage target: 95%+
 */
describe('OrdersController', () => {
  let controller: OrdersController;
  let ordersService: jest.Mocked<OrdersService>;

  // Mock user from JWT token
  const mockUser = {
    id: 'user-123',
  };

  // Mock order response
  const mockOrderResponse: OrderResponseDto = {
    id: 'order-123',
    userId: 'user-123',
    status: OrderStatus.PENDING,
    totalAmount: 2649.97,
    currency: 'USD',
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        productName: 'Laptop Gaming',
        quantity: 2,
        unitPrice: 1299.99,
        totalPrice: 2599.98,
      },
      {
        id: 'item-2',
        productId: 'product-2',
        productName: 'Mouse',
        quantity: 1,
        unitPrice: 49.99,
        totalPrice: 49.99,
      },
    ],
    idempotencyKey: 'order-2025-10-01-user-123-abc',
    createdAt: new Date('2025-10-01T10:30:00.000Z'),
    updatedAt: new Date('2025-10-01T10:30:00.000Z'),
  };

  // Mock order status response
  const mockOrderStatusResponse: OrderStatusResponseDto = {
    orderId: 'order-123',
    status: OrderStatus.PROCESSING,
  };

  beforeEach(async () => {
    // Create mock OrdersService
    const mockOrdersService = {
      createOrder: jest.fn(),
      findUserOrders: jest.fn(),
      findOrderById: jest.fn(),
      getOrderStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    ordersService = module.get(OrdersService) as jest.Mocked<OrdersService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    // Assert
    expect(controller).toBeDefined();
  });

  describe('createOrder', () => {
    const createOrderDto: CreateOrderDto = {
      items: [
        { productId: 'product-1', quantity: 2 },
        { productId: 'product-2', quantity: 1 },
      ],
      idempotencyKey: 'order-2025-10-01-user-123-abc',
    };

    it('should create an order and return order response', async () => {
      // Arrange
      ordersService.createOrder.mockResolvedValue(mockOrderResponse);

      // Act
      const result = await controller.createOrder(mockUser, createOrderDto);

      // Assert
      expect(result).toEqual(mockOrderResponse);
      expect(ordersService.createOrder).toHaveBeenCalledWith(mockUser.id, createOrderDto);
      expect(ordersService.createOrder).toHaveBeenCalledTimes(1);
    });

    it('should pass user ID from JWT token to service', async () => {
      // Arrange
      ordersService.createOrder.mockResolvedValue(mockOrderResponse);

      // Act
      await controller.createOrder(mockUser, createOrderDto);

      // Assert
      expect(ordersService.createOrder).toHaveBeenCalledWith('user-123', createOrderDto);
    });

    it('should handle orders with single item', async () => {
      // Arrange
      const singleItemDto: CreateOrderDto = {
        items: [{ productId: 'product-1', quantity: 1 }],
        idempotencyKey: 'order-single-item',
      };
      const singleItemResponse: OrderResponseDto = {
        ...mockOrderResponse,
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            productName: 'Laptop Gaming',
            quantity: 1,
            unitPrice: 1299.99,
            totalPrice: 1299.99,
          },
        ],
      };
      ordersService.createOrder.mockResolvedValue(singleItemResponse);

      // Act
      const result = await controller.createOrder(mockUser, singleItemDto);

      // Assert
      expect(result.items).toHaveLength(1);
      expect(ordersService.createOrder).toHaveBeenCalledWith(mockUser.id, singleItemDto);
    });

    it('should handle orders with multiple items', async () => {
      // Arrange
      const multiItemDto: CreateOrderDto = {
        items: [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-2', quantity: 1 },
          { productId: 'product-3', quantity: 5 },
        ],
        idempotencyKey: 'order-multi-item',
      };
      ordersService.createOrder.mockResolvedValue(mockOrderResponse);

      // Act
      await controller.createOrder(mockUser, multiItemDto);

      // Assert
      expect(ordersService.createOrder).toHaveBeenCalledWith(mockUser.id, multiItemDto);
    });

    it('should propagate errors from service', async () => {
      // Arrange
      const error = new Error('Product not found');
      ordersService.createOrder.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.createOrder(mockUser, createOrderDto)).rejects.toThrow(
        'Product not found',
      );
    });
  });

  describe('getUserOrders', () => {
    it('should return all orders for authenticated user', async () => {
      // Arrange
      const mockOrders = [
        mockOrderResponse,
        {
          ...mockOrderResponse,
          id: 'order-456',
          status: OrderStatus.CONFIRMED,
        },
      ];
      ordersService.findUserOrders.mockResolvedValue(mockOrders);

      // Act
      const result = await controller.getUserOrders(mockUser);

      // Assert
      expect(result).toEqual(mockOrders);
      expect(result).toHaveLength(2);
      expect(ordersService.findUserOrders).toHaveBeenCalledWith(mockUser.id);
      expect(ordersService.findUserOrders).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when user has no orders', async () => {
      // Arrange
      ordersService.findUserOrders.mockResolvedValue([]);

      // Act
      const result = await controller.getUserOrders(mockUser);

      // Assert
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(ordersService.findUserOrders).toHaveBeenCalledWith(mockUser.id);
    });

    it('should pass correct user ID from JWT token', async () => {
      // Arrange
      const differentUser = { id: 'user-999' };
      ordersService.findUserOrders.mockResolvedValue([]);

      // Act
      await controller.getUserOrders(differentUser);

      // Assert
      expect(ordersService.findUserOrders).toHaveBeenCalledWith('user-999');
    });

    it('should propagate errors from service', async () => {
      // Arrange
      const error = new Error('Database connection failed');
      ordersService.findUserOrders.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getUserOrders(mockUser)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('getOrderById', () => {
    const orderId = 'order-123';

    it('should return order details by ID', async () => {
      // Arrange
      ordersService.findOrderById.mockResolvedValue(mockOrderResponse);

      // Act
      const result = await controller.getOrderById(orderId, mockUser);

      // Assert
      expect(result).toEqual(mockOrderResponse);
      expect(ordersService.findOrderById).toHaveBeenCalledWith(orderId, mockUser.id);
      expect(ordersService.findOrderById).toHaveBeenCalledTimes(1);
    });

    it('should pass both order ID and user ID to service', async () => {
      // Arrange
      ordersService.findOrderById.mockResolvedValue(mockOrderResponse);

      // Act
      await controller.getOrderById('order-999', mockUser);

      // Assert
      expect(ordersService.findOrderById).toHaveBeenCalledWith('order-999', 'user-123');
    });

    it('should handle different order statuses', async () => {
      // Arrange
      const confirmedOrder = {
        ...mockOrderResponse,
        status: OrderStatus.CONFIRMED,
      };
      ordersService.findOrderById.mockResolvedValue(confirmedOrder);

      // Act
      const result = await controller.getOrderById(orderId, mockUser);

      // Assert
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('should propagate not found errors from service', async () => {
      // Arrange
      const error = new Error('Order not found');
      ordersService.findOrderById.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getOrderById(orderId, mockUser)).rejects.toThrow('Order not found');
    });

    it('should propagate unauthorized access errors', async () => {
      // Arrange
      const error = new Error('Order does not belong to user');
      ordersService.findOrderById.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getOrderById(orderId, mockUser)).rejects.toThrow(
        'Order does not belong to user',
      );
    });
  });

  describe('getOrderStatus', () => {
    const orderId = 'order-123';

    it('should return order status by ID', async () => {
      // Arrange
      ordersService.getOrderStatus.mockResolvedValue(mockOrderStatusResponse);

      // Act
      const result = await controller.getOrderStatus(orderId, mockUser);

      // Assert
      expect(result).toEqual(mockOrderStatusResponse);
      expect(ordersService.getOrderStatus).toHaveBeenCalledWith(orderId, mockUser.id);
      expect(ordersService.getOrderStatus).toHaveBeenCalledTimes(1);
    });

    it('should pass both order ID and user ID to service', async () => {
      // Arrange
      ordersService.getOrderStatus.mockResolvedValue(mockOrderStatusResponse);

      // Act
      await controller.getOrderStatus('order-999', mockUser);

      // Assert
      expect(ordersService.getOrderStatus).toHaveBeenCalledWith('order-999', 'user-123');
    });

    it('should return status for PENDING order', async () => {
      // Arrange
      const pendingStatus: OrderStatusResponseDto = {
        orderId: 'order-123',
        status: OrderStatus.PENDING,
      };
      ordersService.getOrderStatus.mockResolvedValue(pendingStatus);

      // Act
      const result = await controller.getOrderStatus(orderId, mockUser);

      // Assert
      expect(result.status).toBe(OrderStatus.PENDING);
      expect(result.orderId).toBe('order-123');
    });

    it('should return status for PROCESSING order', async () => {
      // Arrange
      const processingStatus: OrderStatusResponseDto = {
        orderId: 'order-123',
        status: OrderStatus.PROCESSING,
      };
      ordersService.getOrderStatus.mockResolvedValue(processingStatus);

      // Act
      const result = await controller.getOrderStatus(orderId, mockUser);

      // Assert
      expect(result.status).toBe(OrderStatus.PROCESSING);
    });

    it('should return status for CONFIRMED order', async () => {
      // Arrange
      const confirmedStatus: OrderStatusResponseDto = {
        orderId: 'order-123',
        status: OrderStatus.CONFIRMED,
      };
      ordersService.getOrderStatus.mockResolvedValue(confirmedStatus);

      // Act
      const result = await controller.getOrderStatus(orderId, mockUser);

      // Assert
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('should return status for CANCELLED order', async () => {
      // Arrange
      const cancelledStatus: OrderStatusResponseDto = {
        orderId: 'order-123',
        status: OrderStatus.CANCELLED,
      };
      ordersService.getOrderStatus.mockResolvedValue(cancelledStatus);

      // Act
      const result = await controller.getOrderStatus(orderId, mockUser);

      // Assert
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('should propagate not found errors from service', async () => {
      // Arrange
      const error = new Error('Order not found');
      ordersService.getOrderStatus.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getOrderStatus(orderId, mockUser)).rejects.toThrow('Order not found');
    });

    it('should propagate unauthorized access errors', async () => {
      // Arrange
      const error = new Error('Order does not belong to user');
      ordersService.getOrderStatus.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getOrderStatus(orderId, mockUser)).rejects.toThrow(
        'Order does not belong to user',
      );
    });
  });
});
