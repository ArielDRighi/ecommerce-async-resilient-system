import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { InventoryService } from './inventory.service';
import { Inventory, InventoryMovement } from './entities/inventory.entity';
import { InventoryReservation } from './entities/inventory-reservation.entity';
import { NotFoundException } from '@nestjs/common';
import { CheckStockDto } from './dto/check-stock.dto';
import { InventoryMovementType } from './enums/inventory-movement-type.enum';

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepository: jest.Mocked<Repository<Inventory>>;
  let movementRepository: jest.Mocked<Repository<InventoryMovement>>;

  const mockInventory = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    productId: '123e4567-e89b-12d3-a456-426614174001',
    currentStock: 100,
    reservedStock: 10,
    availableStock: 90,
    minimumStock: 20,
    maximumStock: 200,
    reorderPoint: 30,
    location: 'MAIN_WAREHOUSE',
    updatedAt: new Date(),
    product: Promise.resolve({
      id: '123e4567-e89b-12d3-a456-426614174001',
      name: 'Test Product',
      sku: 'TEST-001',
      price: 99.99,
    }),
    stockStatus: 'NORMAL',
  } as Inventory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(Inventory),
          useValue: {
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InventoryMovement),
          useValue: {
            create: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(InventoryReservation),
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: EntityManager,
          useValue: {
            transaction: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    inventoryRepository = module.get(getRepositoryToken(Inventory));
    movementRepository = module.get(getRepositoryToken(InventoryMovement));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAvailability', () => {
    it('should return stock availability when inventory exists', async () => {
      const checkStockDto: CheckStockDto = {
        productId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 50,
      };

      inventoryRepository.findOne.mockResolvedValue(mockInventory);

      const result = await service.checkAvailability(checkStockDto);

      expect(result).toEqual({
        productId: mockInventory.productId,
        physicalStock: mockInventory.currentStock,
        reservedStock: mockInventory.reservedStock,
        availableStock: mockInventory.availableStock,
        minimumStock: mockInventory.minimumStock,
        maximumStock: mockInventory.maximumStock,
        reorderPoint: mockInventory.reorderPoint,
        location: mockInventory.location,
        lastUpdated: mockInventory.updatedAt,
        status: mockInventory.stockStatus,
      });
    });

    it('should throw NotFoundException when inventory not found', async () => {
      const checkStockDto: CheckStockDto = {
        productId: '123e4567-e89b-12d3-a456-426614174001',
        quantity: 50,
      };

      inventoryRepository.findOne.mockResolvedValue(null);

      await expect(service.checkAvailability(checkStockDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getInventoryStats', () => {
    it('should return inventory statistics', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockInventory]),
      } as unknown as SelectQueryBuilder<Inventory>;

      inventoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getInventoryStats();

      expect(result).toEqual({
        totalItems: 1,
        totalValue: 9999, // 100 * 99.99 rounded
        lowStockCount: 0,
        outOfStockCount: 0,
        statusBreakdown: {
          IN_STOCK: 1,
          LOW_STOCK: 0,
          OUT_OF_STOCK: 0,
        },
      });
    });

    it('should apply location filter when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      } as unknown as SelectQueryBuilder<Inventory>;

      inventoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getInventoryStats('WAREHOUSE_A');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('inventory.location = :location', {
        location: 'WAREHOUSE_A',
      });
    });

    it('should return statistics with different stock statuses', async () => {
      const lowStockInventory = {
        ...mockInventory,
        currentStock: 15,
        availableStock: 15,
        stockStatus: 'LOW_STOCK',
        product: Promise.resolve({
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Test Product',
          sku: 'TEST-001',
          price: 99.99,
        }),
      } as Inventory;

      const outOfStockInventory = {
        ...mockInventory,
        id: '456e4567-e89b-12d3-a456-426614174000',
        currentStock: 0,
        availableStock: 0,
        stockStatus: 'OUT_OF_STOCK',
        product: Promise.resolve({
          id: '456e4567-e89b-12d3-a456-426614174001',
          name: 'Out of Stock Product',
          sku: 'OUT-001',
          price: 49.99,
        }),
      } as Inventory;

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValue([mockInventory, lowStockInventory, outOfStockInventory]),
      } as unknown as SelectQueryBuilder<Inventory>;

      inventoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getInventoryStats();

      expect(result).toEqual({
        totalItems: 3,
        totalValue: 11498.85, // (100 * 99.99) + (15 * 99.99) + (0 * 49.99)
        lowStockCount: 1,
        outOfStockCount: 1,
        statusBreakdown: {
          IN_STOCK: 1,
          LOW_STOCK: 1,
          OUT_OF_STOCK: 1,
        },
      });
    });
  });

  describe('getInventoryByProduct', () => {
    it('should return inventory response when product exists', async () => {
      // Arrange
      inventoryRepository.findOne.mockResolvedValue(mockInventory);
      movementRepository.count.mockResolvedValue(5);

      // Act
      const result = await service.getInventoryByProduct(mockInventory.productId);

      // Assert
      expect(result).toEqual({
        id: mockInventory.id,
        productId: mockInventory.productId,
        physicalStock: mockInventory.currentStock,
        reservedStock: mockInventory.reservedStock,
        availableStock: mockInventory.availableStock,
        minimumStock: mockInventory.minimumStock,
        maximumStock: mockInventory.maximumStock,
        reorderPoint: mockInventory.reorderPoint,
        location: mockInventory.location,
        status: mockInventory.stockStatus,
        product: {
          id: '123e4567-e89b-12d3-a456-426614174001',
          name: 'Test Product',
          sku: 'TEST-001',
          category: undefined,
        },
        movementsCount: 5,
        createdAt: undefined,
        updatedAt: mockInventory.updatedAt,
      });
    });

    it('should throw NotFoundException when inventory not found', async () => {
      // Arrange
      inventoryRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.getInventoryByProduct('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reserveStock', () => {
    it('should successfully reserve stock when sufficient quantity available', async () => {
      // Arrange
      const reserveDto = {
        productId: mockInventory.productId,
        quantity: 20,
        reservationId: 'RES-123',
        location: 'MAIN_WAREHOUSE',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        reserveStock: jest.fn(),
      };

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(inventoryWithMethods) // First call with pessimistic lock
          .mockResolvedValueOnce({
            ...inventoryWithMethods,
            product: Promise.resolve({
              id: mockInventory.productId,
              name: 'Test Product',
              sku: 'TEST-001',
            }),
          }), // Second call with relations
        save: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      movementRepository.create.mockReturnValue({
        inventoryId: mockInventory.id,
        movementType: 'RESERVATION',
        quantity: -20,
      } as unknown as InventoryMovement);

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act
      const result = await service.reserveStock(reserveDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.reservationId).toBe('RES-123');
      expect(result.quantity).toBe(20);
      expect(result.status).toBe('ACTIVE');
      expect(inventoryWithMethods.reserveStock).toHaveBeenCalledWith(20, 'Reservation: RES-123');
      expect(mockEntityManager.findOne).toHaveBeenCalledTimes(2);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when inventory not found', async () => {
      // Arrange
      const reserveDto = {
        productId: 'non-existent',
        quantity: 20,
        reservationId: 'RES-123',
        location: 'MAIN_WAREHOUSE',
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.reserveStock(reserveDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when insufficient stock available', async () => {
      // Arrange
      const reserveDto = {
        productId: mockInventory.productId,
        quantity: 150, // More than available (90)
        reservationId: 'RES-123',
        location: 'MAIN_WAREHOUSE',
      };

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockInventory)
          .mockResolvedValueOnce({
            ...mockInventory,
            product: Promise.resolve({
              id: mockInventory.productId,
            }),
          }),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.reserveStock(reserveDto)).rejects.toThrow('Insufficient stock');
    });
  });

  describe('releaseReservation', () => {
    it('should successfully release reservation', async () => {
      // Arrange
      const releaseDto = {
        productId: mockInventory.productId,
        quantity: 20,
        reservationId: 'RES-123',
        location: 'MAIN_WAREHOUSE',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        releaseReservedStock: jest.fn(),
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(inventoryWithMethods),
        save: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      movementRepository.create.mockReturnValue({
        inventoryId: mockInventory.id,
        movementType: 'RELEASE_RESERVATION',
        quantity: 20,
      } as unknown as InventoryMovement);

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act
      const result = await service.releaseReservation(releaseDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.productId).toBe(mockInventory.productId);
      expect(inventoryWithMethods.releaseReservedStock).toHaveBeenCalledWith(20);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when inventory not found', async () => {
      // Arrange
      const releaseDto = {
        productId: 'non-existent',
        quantity: 20,
        reservationId: 'RES-123',
        location: 'MAIN_WAREHOUSE',
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.releaseReservation(releaseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when release fails', async () => {
      // Arrange
      const releaseDto = {
        productId: mockInventory.productId,
        quantity: 20,
        reservationId: 'RES-123',
        location: 'MAIN_WAREHOUSE',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        releaseReservedStock: jest.fn().mockImplementation(() => {
          throw new Error('Invalid release amount');
        }),
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.releaseReservation(releaseDto)).rejects.toThrow(
        'Invalid release amount',
      );
    });
  });

  describe('fulfillReservation', () => {
    it('should successfully fulfill reservation', async () => {
      // Arrange
      const fulfillDto = {
        productId: mockInventory.productId,
        quantity: 20,
        reservationId: 'RES-123',
        orderId: 'ORD-456',
        location: 'MAIN_WAREHOUSE',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        fulfillReservation: jest.fn(),
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(inventoryWithMethods),
        save: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      movementRepository.create.mockReturnValue({
        inventoryId: mockInventory.id,
        movementType: 'SALE',
        quantity: -20,
      } as unknown as InventoryMovement);

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act
      const result = await service.fulfillReservation(fulfillDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.productId).toBe(mockInventory.productId);
      expect(inventoryWithMethods.fulfillReservation).toHaveBeenCalledWith(20);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when inventory not found', async () => {
      // Arrange
      const fulfillDto = {
        productId: 'non-existent',
        quantity: 20,
        reservationId: 'RES-123',
        orderId: 'ORD-456',
        location: 'MAIN_WAREHOUSE',
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.fulfillReservation(fulfillDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when fulfillment fails', async () => {
      // Arrange
      const fulfillDto = {
        productId: mockInventory.productId,
        quantity: 20,
        reservationId: 'RES-123',
        orderId: 'ORD-456',
        location: 'MAIN_WAREHOUSE',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        fulfillReservation: jest.fn().mockImplementation(() => {
          throw new Error('Cannot fulfill reservation');
        }),
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.fulfillReservation(fulfillDto)).rejects.toThrow(
        'Cannot fulfill reservation',
      );
    });
  });

  describe('addStock', () => {
    it('should successfully add stock to inventory', async () => {
      // Arrange
      const movementDto = {
        inventoryId: mockInventory.id,
        quantity: 50,
        movementType: InventoryMovementType.RESTOCK,
        unitCost: 25.5,
        referenceId: 'PO-123',
        referenceType: 'PURCHASE_ORDER',
        reason: 'Stock replenishment',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        addStock: jest.fn(),
      };

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(inventoryWithMethods) // First call with lock
          .mockResolvedValueOnce({
            ...inventoryWithMethods,
            product: Promise.resolve({
              id: mockInventory.productId,
            }),
          }), // Second call with relations
        save: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      movementRepository.create.mockReturnValue({
        inventoryId: mockInventory.id,
        movementType: 'PURCHASE',
        quantity: 50,
      } as unknown as InventoryMovement);

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act
      const result = await service.addStock(movementDto);

      // Assert
      expect(result).toBeDefined();
      expect(inventoryWithMethods.addStock).toHaveBeenCalledWith(50, 25.5);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when quantity is non-positive', async () => {
      // Arrange
      const movementDto = {
        inventoryId: mockInventory.id,
        quantity: -10,
        movementType: InventoryMovementType.RESTOCK,
      };

      // Act & Assert
      await expect(service.addStock(movementDto)).rejects.toThrow(
        'Add stock quantity must be positive',
      );
    });

    it('should throw NotFoundException when inventory not found', async () => {
      // Arrange
      const movementDto = {
        inventoryId: 'non-existent',
        quantity: 50,
        movementType: InventoryMovementType.RESTOCK,
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.addStock(movementDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when addStock operation fails', async () => {
      // Arrange
      const movementDto = {
        inventoryId: mockInventory.id,
        quantity: 50,
        movementType: InventoryMovementType.RESTOCK,
      };

      const inventoryWithMethods = {
        ...mockInventory,
        addStock: jest.fn().mockImplementation(() => {
          throw new Error('Stock addition failed');
        }),
      };

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(inventoryWithMethods)
          .mockResolvedValueOnce({
            ...inventoryWithMethods,
            product: Promise.resolve({ id: mockInventory.productId }),
          }),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.addStock(movementDto)).rejects.toThrow('Stock addition failed');
    });
  });

  describe('removeStock', () => {
    it('should successfully remove stock from inventory', async () => {
      // Arrange
      const movementDto = {
        inventoryId: mockInventory.id,
        quantity: 30,
        movementType: InventoryMovementType.DAMAGE,
        referenceId: 'DMG-123',
        referenceType: 'DAMAGE_REPORT',
        reason: 'Damaged goods',
      };

      const inventoryWithMethods = {
        ...mockInventory,
        removeStock: jest.fn(),
      };

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(inventoryWithMethods)
          .mockResolvedValueOnce({
            ...inventoryWithMethods,
            product: Promise.resolve({
              id: mockInventory.productId,
            }),
          }),
        save: jest.fn().mockResolvedValue(inventoryWithMethods),
      };

      movementRepository.create.mockReturnValue({
        inventoryId: mockInventory.id,
        movementType: 'DAMAGE',
        quantity: -30,
      } as unknown as InventoryMovement);

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act
      const result = await service.removeStock(movementDto);

      // Assert
      expect(result).toBeDefined();
      expect(inventoryWithMethods.removeStock).toHaveBeenCalledWith(30);
      expect(mockEntityManager.save).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when quantity is non-positive', async () => {
      // Arrange
      const movementDto = {
        inventoryId: mockInventory.id,
        quantity: 0,
        movementType: InventoryMovementType.DAMAGE,
      };

      // Act & Assert
      await expect(service.removeStock(movementDto)).rejects.toThrow(
        'Remove stock quantity must be positive',
      );
    });

    it('should throw NotFoundException when inventory not found', async () => {
      // Arrange
      const movementDto = {
        inventoryId: 'non-existent',
        quantity: 30,
        movementType: InventoryMovementType.DAMAGE,
      };

      const mockEntityManager = {
        findOne: jest.fn().mockResolvedValue(null),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.removeStock(movementDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when removeStock operation fails', async () => {
      // Arrange
      const movementDto = {
        inventoryId: mockInventory.id,
        quantity: 30,
        movementType: InventoryMovementType.DAMAGE,
      };

      const inventoryWithMethods = {
        ...mockInventory,
        removeStock: jest.fn().mockImplementation(() => {
          throw new Error('Insufficient stock for removal');
        }),
      };

      const mockEntityManager = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(inventoryWithMethods)
          .mockResolvedValueOnce({
            ...inventoryWithMethods,
            product: Promise.resolve({ id: mockInventory.productId }),
          }),
      };

      const transactionCallback = jest.fn(async (callback) => callback(mockEntityManager));
      const entityManager = service['entityManager'];
      entityManager.transaction = transactionCallback;

      // Act & Assert
      await expect(service.removeStock(movementDto)).rejects.toThrow(
        'Insufficient stock for removal',
      );
    });
  });

  describe('getInventoryList', () => {
    it('should return paginated inventory list when valid params provided', async () => {
      // Arrange
      const params = {
        page: 1,
        limit: 10,
        location: 'MAIN_WAREHOUSE',
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockInventory]),
        getManyAndCount: jest.fn().mockResolvedValue([[mockInventory], 1]),
      } as unknown as SelectQueryBuilder<Inventory>;

      inventoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      inventoryRepository.count.mockResolvedValue(1);
      movementRepository.count.mockResolvedValue(5);

      // Act
      const result = await service.getInventoryList(params);

      // Assert
      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.meta).toHaveProperty('currentPage', 1);
      expect(result.meta).toHaveProperty('itemsPerPage', 10);
      expect(result.meta).toHaveProperty('totalItems', 1);
      expect(result.meta).toHaveProperty('totalPages', 1);
    });

    it('should apply status filter when provided', async () => {
      // Arrange
      const params = {
        page: 1,
        limit: 10,
        status: 'LOW_STOCK',
      };

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      } as unknown as SelectQueryBuilder<Inventory>;

      inventoryRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      inventoryRepository.count.mockResolvedValue(0);

      // Act
      await service.getInventoryList(params);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });
});
