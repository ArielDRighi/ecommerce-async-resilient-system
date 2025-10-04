import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import {
  CheckStockDto,
  ReserveStockDto,
  ReleaseReservationDto,
  FulfillReservationDto,
  StockMovementDto,
  InventoryQueryDto,
} from './dto';
import { InventoryMovementType } from './enums/inventory-movement-type.enum';

describe('InventoryController', () => {
  let controller: InventoryController;
  let service: jest.Mocked<InventoryService>;

  const mockInventoryStock = {
    productId: 'prod-123',
    physicalStock: 100,
    reservedStock: 10,
    availableStock: 90,
    minimumStock: 10,
    maximumStock: 500,
    reorderPoint: 20,
    location: 'MAIN_WAREHOUSE',
    status: 'IN_STOCK',
    lastUpdated: new Date('2024-01-01'),
  };

  const mockReservationResponse = {
    reservationId: 'res-123',
    productId: 'prod-123',
    quantity: 5,
    expiresAt: new Date(Date.now() + 3600000),
    location: 'MAIN_WAREHOUSE',
    reference: 'order-123',
    createdAt: new Date(),
    status: 'ACTIVE',
  };

  const mockPaginatedResponse = {
    data: [
      {
        id: 'inv-123',
        ...mockInventoryStock,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
    ],
    meta: {
      currentPage: 1,
      itemsPerPage: 20,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  const mockStats = {
    totalItems: 100,
    totalValue: 50000,
    lowStockCount: 10,
    outOfStockCount: 5,
    statusBreakdown: {
      IN_STOCK: 85,
      LOW_STOCK: 10,
      OUT_OF_STOCK: 5,
    },
  };

  beforeEach(async () => {
    const mockService = {
      checkAvailability: jest.fn(),
      reserveStock: jest.fn(),
      releaseReservation: jest.fn(),
      fulfillReservation: jest.fn(),
      addStock: jest.fn(),
      removeStock: jest.fn(),
      getInventoryByProduct: jest.fn(),
      getInventoryList: jest.fn(),
      getInventoryStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        {
          provide: InventoryService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
    service = module.get(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAvailability', () => {
    it('should check stock availability successfully', async () => {
      // Arrange
      const checkDto: CheckStockDto = {
        productId: 'prod-123',
        quantity: 5,
        location: 'MAIN_WAREHOUSE',
      };
      service.checkAvailability.mockResolvedValue(mockInventoryStock);

      // Act
      const result = await controller.checkAvailability(checkDto);

      // Assert
      expect(result).toEqual(mockInventoryStock);
      expect(service.checkAvailability).toHaveBeenCalledWith(checkDto);
      expect(service.checkAvailability).toHaveBeenCalledTimes(1);
    });

    it('should handle availability check for different locations', async () => {
      // Arrange
      const checkDto: CheckStockDto = {
        productId: 'prod-123',
        quantity: 10,
        location: 'WAREHOUSE_B',
      };
      service.checkAvailability.mockResolvedValue({
        ...mockInventoryStock,
        location: 'WAREHOUSE_B',
      });

      // Act
      const result = await controller.checkAvailability(checkDto);

      // Assert
      expect(result.location).toBe('WAREHOUSE_B');
      expect(service.checkAvailability).toHaveBeenCalledWith(checkDto);
    });
  });

  describe('reserveStock', () => {
    it('should reserve stock successfully', async () => {
      // Arrange
      const reserveDto: ReserveStockDto = {
        productId: 'prod-123',
        quantity: 5,
        reservationId: 'res-123',
        location: 'MAIN_WAREHOUSE',
        referenceId: 'order-123',
        ttlMinutes: 60,
      };
      service.reserveStock.mockResolvedValue(mockReservationResponse);

      // Act
      const result = await controller.reserveStock(reserveDto);

      // Assert
      expect(result).toEqual(mockReservationResponse);
      expect(service.reserveStock).toHaveBeenCalledWith(reserveDto);
    });

    it('should handle reservation with custom TTL', async () => {
      // Arrange
      const reserveDto: ReserveStockDto = {
        productId: 'prod-123',
        quantity: 3,
        reservationId: 'res-456',
        location: 'MAIN_WAREHOUSE',
        referenceId: 'order-456',
        ttlMinutes: 120,
      };
      service.reserveStock.mockResolvedValue({
        ...mockReservationResponse,
        reservationId: 'res-456',
      });

      // Act
      const result = await controller.reserveStock(reserveDto);

      // Assert
      expect(result.reservationId).toBe('res-456');
      expect(service.reserveStock).toHaveBeenCalledWith(reserveDto);
    });
  });

  describe('releaseReservation', () => {
    it('should release reservation successfully', async () => {
      // Arrange
      const releaseDto: ReleaseReservationDto = {
        productId: 'prod-123',
        quantity: 5,
        reservationId: 'res-123',
        reason: 'Order cancelled',
      };
      service.releaseReservation.mockResolvedValue(mockInventoryStock);

      // Act
      const result = await controller.releaseReservation(releaseDto);

      // Assert
      expect(result).toEqual(mockInventoryStock);
      expect(service.releaseReservation).toHaveBeenCalledWith(releaseDto);
    });

    it('should release reservation with location', async () => {
      // Arrange
      const releaseDto: ReleaseReservationDto = {
        productId: 'prod-123',
        quantity: 3,
        reservationId: 'res-456',
        location: 'WAREHOUSE_B',
      };
      service.releaseReservation.mockResolvedValue(mockInventoryStock);

      // Act
      const result = await controller.releaseReservation(releaseDto);

      // Assert
      expect(result).toEqual(mockInventoryStock);
      expect(service.releaseReservation).toHaveBeenCalledWith(releaseDto);
    });
  });

  describe('fulfillReservation', () => {
    it('should fulfill reservation successfully', async () => {
      // Arrange
      const fulfillDto: FulfillReservationDto = {
        productId: 'prod-123',
        quantity: 5,
        reservationId: 'res-123',
        orderId: 'order-123',
      };
      service.fulfillReservation.mockResolvedValue(mockInventoryStock);

      // Act
      const result = await controller.fulfillReservation(fulfillDto);

      // Assert
      expect(result).toEqual(mockInventoryStock);
      expect(service.fulfillReservation).toHaveBeenCalledWith(fulfillDto);
    });

    it('should fulfill reservation with notes', async () => {
      // Arrange
      const fulfillDto: FulfillReservationDto = {
        productId: 'prod-123',
        quantity: 2,
        reservationId: 'res-789',
        orderId: 'order-789',
        notes: 'Express shipping',
      };
      service.fulfillReservation.mockResolvedValue({
        ...mockInventoryStock,
        availableStock: 88,
      });

      // Act
      const result = await controller.fulfillReservation(fulfillDto);

      // Assert
      expect(result.availableStock).toBe(88);
      expect(service.fulfillReservation).toHaveBeenCalledWith(fulfillDto);
    });
  });

  describe('addStock', () => {
    it('should add stock successfully', async () => {
      // Arrange
      const movementDto: StockMovementDto = {
        inventoryId: 'inv-123',
        movementType: InventoryMovementType.RESTOCK,
        quantity: 50,
        reason: 'Monthly restock',
      };
      service.addStock.mockResolvedValue({
        ...mockInventoryStock,
        physicalStock: 150,
        availableStock: 140,
      });

      // Act
      const result = await controller.addStock(movementDto);

      // Assert
      expect(result.physicalStock).toBe(150);
      expect(result.availableStock).toBe(140);
      expect(service.addStock).toHaveBeenCalledWith(movementDto);
    });

    it('should add stock with unit cost', async () => {
      // Arrange
      const movementDto: StockMovementDto = {
        inventoryId: 'inv-123',
        movementType: InventoryMovementType.RESTOCK,
        quantity: 25,
        unitCost: 15.99,
        referenceId: 'PO-12345',
        referenceType: 'PURCHASE_ORDER',
      };
      service.addStock.mockResolvedValue({
        ...mockInventoryStock,
        physicalStock: 125,
      });

      // Act
      const result = await controller.addStock(movementDto);

      // Assert
      expect(result).toBeDefined();
      expect(service.addStock).toHaveBeenCalledWith(movementDto);
    });
  });

  describe('removeStock', () => {
    it('should remove stock successfully', async () => {
      // Arrange
      const movementDto: StockMovementDto = {
        inventoryId: 'inv-123',
        movementType: InventoryMovementType.SALE,
        quantity: -10,
        reason: 'Order fulfillment',
      };
      service.removeStock.mockResolvedValue({
        ...mockInventoryStock,
        physicalStock: 90,
        availableStock: 80,
      });

      // Act
      const result = await controller.removeStock(movementDto);

      // Assert
      expect(result.physicalStock).toBe(90);
      expect(result.availableStock).toBe(80);
      expect(service.removeStock).toHaveBeenCalledWith(movementDto);
    });

    it('should remove stock for damage', async () => {
      // Arrange
      const movementDto: StockMovementDto = {
        inventoryId: 'inv-123',
        movementType: InventoryMovementType.ADJUSTMENT,
        quantity: -5,
        reason: 'Damaged during inspection',
        performedBy: 'admin@example.com',
      };
      service.removeStock.mockResolvedValue({
        ...mockInventoryStock,
        physicalStock: 95,
      });

      // Act
      const result = await controller.removeStock(movementDto);

      // Assert
      expect(result).toBeDefined();
      expect(service.removeStock).toHaveBeenCalledWith(movementDto);
    });
  });

  describe('getInventoryByProduct', () => {
    it('should get inventory by product ID', async () => {
      // Arrange
      const productId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const mockResponse = {
        id: 'inv-123',
        ...mockInventoryStock,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };
      service.getInventoryByProduct.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getInventoryByProduct(productId);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(service.getInventoryByProduct).toHaveBeenCalledWith(productId, undefined);
    });

    it('should get inventory by product ID and location', async () => {
      // Arrange
      const productId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const location = 'WAREHOUSE_B';
      const mockResponse = {
        id: 'inv-123',
        ...mockInventoryStock,
        location,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };
      service.getInventoryByProduct.mockResolvedValue(mockResponse);

      // Act
      const result = await controller.getInventoryByProduct(productId, location);

      // Assert
      expect(result.location).toBe(location);
      expect(service.getInventoryByProduct).toHaveBeenCalledWith(productId, location);
    });
  });

  describe('getInventoryList', () => {
    it('should get inventory list with default pagination', async () => {
      // Arrange
      const queryDto: InventoryQueryDto = {
        page: 1,
        limit: 20,
      };
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.getInventoryList(queryDto);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(result.meta.currentPage).toBe(1);
      expect(result.meta.itemsPerPage).toBe(20);
      expect(service.getInventoryList).toHaveBeenCalledWith(queryDto);
    });

    it('should filter by product ID', async () => {
      // Arrange
      const queryDto: InventoryQueryDto = {
        page: 1,
        limit: 20,
        productId: 'prod-123',
      };
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.getInventoryList(queryDto);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith(queryDto);
    });

    it('should filter by location', async () => {
      // Arrange
      const queryDto: InventoryQueryDto = {
        page: 1,
        limit: 20,
        location: 'WAREHOUSE_B',
      };
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.getInventoryList(queryDto);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith(queryDto);
    });

    it('should filter by status', async () => {
      // Arrange
      const queryDto: InventoryQueryDto = {
        page: 1,
        limit: 20,
        status: 'LOW_STOCK',
      };
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.getInventoryList(queryDto);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith(queryDto);
    });

    it('should filter by stock range', async () => {
      // Arrange
      const queryDto: InventoryQueryDto = {
        page: 1,
        limit: 20,
        minStock: 10,
        maxStock: 100,
      };
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.getInventoryList(queryDto);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith(queryDto);
    });
  });

  describe('getLowStockItems', () => {
    it('should get low stock items with defaults', async () => {
      // Arrange
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);
      const queryParams = { page: 1, limit: 20 } as any;

      // Act
      const result = await controller.getLowStockItems(queryParams);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.getInventoryList).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        location: undefined,
        status: 'LOW_STOCK',
      });
    });

    it('should get low stock items with custom pagination', async () => {
      // Arrange
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);
      const queryParams = { page: 2, limit: 50 } as any;

      // Act
      const result = await controller.getLowStockItems(queryParams);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith({
        page: 2,
        limit: 50,
        location: undefined,
        status: 'LOW_STOCK',
      });
    });

    it('should filter low stock by location', async () => {
      // Arrange
      const location = 'WAREHOUSE_C';
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);
      const queryParams = { page: 1, limit: 20, location } as any;

      // Act
      const result = await controller.getLowStockItems(queryParams);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        location,
        status: 'LOW_STOCK',
      });
    });
  });

  describe('getOutOfStockItems', () => {
    it('should get out of stock items with defaults', async () => {
      // Arrange
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);
      const queryParams = { page: 1, limit: 20 } as any;

      // Act
      const result = await controller.getOutOfStockItems(queryParams);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.getInventoryList).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        location: undefined,
        status: 'OUT_OF_STOCK',
      });
    });

    it('should get out of stock items with custom pagination', async () => {
      // Arrange
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);
      const queryParams = { page: 3, limit: 10 } as any;

      // Act
      const result = await controller.getOutOfStockItems(queryParams);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith({
        page: 3,
        limit: 10,
        location: undefined,
        status: 'OUT_OF_STOCK',
      });
    });

    it('should filter out of stock by location', async () => {
      // Arrange
      const location = 'WAREHOUSE_D';
      service.getInventoryList.mockResolvedValue(mockPaginatedResponse);
      const queryParams = { page: 1, limit: 20, location } as any;

      // Act
      const result = await controller.getOutOfStockItems(queryParams);

      // Assert
      expect(result).toBeDefined();
      expect(service.getInventoryList).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        location,
        status: 'OUT_OF_STOCK',
      });
    });
  });

  describe('getInventoryStats', () => {
    it('should get inventory stats without location filter', async () => {
      // Arrange
      service.getInventoryStats.mockResolvedValue(mockStats);

      // Act
      const result = await controller.getInventoryStats();

      // Assert
      expect(result).toEqual(mockStats);
      expect(result.totalItems).toBe(100);
      expect(result.totalValue).toBe(50000);
      expect(result.lowStockCount).toBe(10);
      expect(result.outOfStockCount).toBe(5);
      expect(result.statusBreakdown).toEqual({
        IN_STOCK: 85,
        LOW_STOCK: 10,
        OUT_OF_STOCK: 5,
      });
      expect(service.getInventoryStats).toHaveBeenCalledWith(undefined);
    });

    it('should get inventory stats with location filter', async () => {
      // Arrange
      const location = 'WAREHOUSE_A';
      service.getInventoryStats.mockResolvedValue({
        ...mockStats,
        totalItems: 50,
      });

      // Act
      const result = await controller.getInventoryStats(location);

      // Assert
      expect(result.totalItems).toBe(50);
      expect(service.getInventoryStats).toHaveBeenCalledWith(location);
    });
  });
});
