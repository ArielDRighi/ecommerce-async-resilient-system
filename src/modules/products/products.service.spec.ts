import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from './dto';

describe('ProductsService', () => {
  let service: ProductsService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };

  const mockProduct: Product = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test Product',
    description: 'Test Description',
    price: 99.99,
    sku: 'TEST-001',
    isActive: true,
    brand: 'TestBrand',
    weight: 1.0,
    attributes: { color: 'red' },
    images: ['http://example.com/image.jpg'],
    tags: ['test', 'product'],
    costPrice: 50.0,
    compareAtPrice: 150.0, // Make sure this is greater than price
    trackInventory: true,
    minimumStock: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: undefined,
    orderItems: Promise.resolve([]),
    inventory: Promise.resolve({} as Product['inventory']),
    get isOnSale() {
      return (
        this.compareAtPrice !== null &&
        this.compareAtPrice !== undefined &&
        this.compareAtPrice > this.price
      );
    },
    get discountPercentage() {
      if (!this.isOnSale || !this.compareAtPrice) return 0;
      return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
    },
    get profitMargin() {
      if (!this.costPrice) return 0;
      return Math.round(((this.price - this.costPrice) / this.price) * 100);
    },
    validatePricing: jest.fn(),
    normalizeData: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
    updatePrice: jest.fn(),
    addTag: jest.fn(),
    removeTag: jest.fn(),
    addImage: jest.fn(),
    removeImage: jest.fn(),
  };

  // Helper function to setup mock query builder chain
  const setupQueryBuilderMocks = () => {
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addOrderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addSelect.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.skip.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.take.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit.mockReturnValue(mockQueryBuilder);
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  };

  beforeEach(async () => {
    // Re-setup mock chain after clearAllMocks()
    setupQueryBuilderMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createProductDto: CreateProductDto = {
      name: 'Test Product',
      description: 'Test Description',
      price: 99.99,
      sku: 'TEST-001',
      brand: 'TestBrand',
    };

    it('should create product and return saved entity when valid data provided', async () => {
      // Arrange
      const newProduct = { ...mockProduct, ...createProductDto };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockRepository.create.mockReturnValue(newProduct);
      mockRepository.save.mockResolvedValue(newProduct);

      // Act
      const result = await service.create(createProductDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe(createProductDto.name);
      expect(result.sku).toBe(createProductDto.sku);
      expect(mockRepository.create).toHaveBeenCalledWith(createProductDto);
      expect(mockRepository.save).toHaveBeenCalledWith(newProduct);
    });

    it('should throw ConflictException when SKU already exists', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);

      // Act & Assert
      await expect(service.create(createProductDto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when validation error occurs', async () => {
      // Arrange
      const invalidDto = { ...createProductDto, price: -10 };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);
      mockRepository.create.mockReturnValue({ ...mockProduct, price: -10 });
      mockRepository.save.mockRejectedValue(new Error('Product price must be greater than 0'));

      // Act & Assert
      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    const queryDto: ProductQueryDto = {
      page: 1,
      limit: 10,
      search: 'test',
    };

    it('should return paginated results when valid query provided', async () => {
      // Arrange
      const products = [mockProduct];
      const total = 1;
      mockQueryBuilder.getCount.mockResolvedValue(total);
      mockQueryBuilder.getMany.mockResolvedValue(products);

      // Act
      const result = await service.findAll(queryDto);

      // Assert
      expect(result).toEqual({
        data: expect.any(Array),
        meta: {
          total,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
    });

    it('should apply search filters when search term provided', async () => {
      // Arrange
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.any(Object),
      );
    });
  });

  describe('findById', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return product when valid ID provided', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(mockProduct);

      // Act
      const result = await service.findById(productId);

      // Assert
      expect(result).toEqual(mockProduct);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('product.id = :id', { id: productId });
    });

    it('should return null when product not found', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(null);

      // Act
      const result = await service.findById(productId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return product response DTO when product exists', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(mockProduct);

      // Act
      const result = await service.findOne(productId);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toEqual(mockProduct.id);
    });

    it('should throw NotFoundException when product not found', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne(productId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    const searchTerm = 'wireless';
    const limit = 10;

    it('should return search results when search term provided', async () => {
      // Arrange
      const products = [mockProduct];
      mockQueryBuilder.getMany.mockResolvedValue(products);

      // Act
      const result = await service.search(searchTerm, limit);

      // Assert
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(limit);
    });
  });

  describe('update', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';
    const updateDto: UpdateProductDto = {
      name: 'Updated Product',
      description: 'Updated Description', // Don't update price to avoid validation issues
    };

    it('should update product and return updated entity when valid data provided', async () => {
      // Arrange
      const existingProduct = { ...mockProduct };
      const updatedProduct = { ...mockProduct, ...updateDto, updatedAt: new Date() };
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(existingProduct)
        .mockResolvedValueOnce(updatedProduct);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.update(productId, updateDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('Updated Product');
      expect(result.description).toBe('Updated Description');
    });

    it('should throw NotFoundException when product not found', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update(productId, updateDto)).rejects.toThrow(NotFoundException);
      expect(mockRepository.update).not.toHaveBeenCalled();
    });
  });
  describe('remove', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should soft delete product when valid ID provided', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(mockProduct);
      mockRepository.softDelete.mockResolvedValue({ affected: 1 });

      // Act & Assert
      await expect(service.remove(productId)).resolves.not.toThrow();
      expect(mockRepository.softDelete).toHaveBeenCalledWith(productId);
    });

    it('should throw NotFoundException when product not found', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove(productId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('activate', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should activate product when valid ID provided', async () => {
      // Arrange
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce({ ...mockProduct, isActive: true });
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.activate(productId);

      // Assert
      expect(result).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalledWith(productId, { isActive: true });
    });
  });

  describe('deactivate', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should deactivate product when valid ID provided', async () => {
      // Arrange
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce({ ...mockProduct, isActive: false });
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.deactivate(productId);

      // Assert
      expect(result).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalledWith(productId, { isActive: false });
    });
  });

  describe('findBySku', () => {
    const sku = 'TEST-001';

    it('should return product when valid SKU provided', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(mockProduct);

      // Act
      const result = await service.findBySku(sku);

      // Assert
      expect(result).toEqual(mockProduct);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('product.sku = :sku', {
        sku: sku.toUpperCase(),
      });
    });

    it('should return null when product not found', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(null);

      // Act
      const result = await service.findBySku(sku);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle database errors gracefully when finding by SKU', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockRejectedValue(new Error('Database connection error'));

      // Act
      const result = await service.findBySku(sku);

      // Assert
      expect(result).toBeNull();
    });

    it('should include deleted products when includeDeleted is true', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(mockProduct);

      // Act
      await service.findBySku(sku, true);

      // Assert
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith('product.deletedAt IS NULL');
    });
  });

  describe('findAll - advanced filtering', () => {
    it('should filter by brand when brand provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        brand: 'TestBrand',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.brand ILIKE :brand',
        expect.objectContaining({ brand: '%TestBrand%' }),
      );
    });

    it('should filter by status when status is active', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        status: 'active',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('product.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should filter by status when status is inactive', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        status: 'inactive',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('product.isActive = :isActive', {
        isActive: false,
      });
    });

    it('should not filter by status when status is all', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        status: 'all',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      const statusCalls = (mockQueryBuilder.andWhere as jest.Mock).mock.calls.filter((call) =>
        call[0]?.includes('isActive'),
      );
      expect(statusCalls.length).toBe(0);
    });

    it('should filter by min and max price when both provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        minPrice: 50,
        maxPrice: 200,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.price BETWEEN :minPrice AND :maxPrice',
        { minPrice: 50, maxPrice: 200 },
      );
    });

    it('should filter by minPrice only when only minPrice provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        minPrice: 50,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('product.price >= :minPrice', {
        minPrice: 50,
      });
    });

    it('should filter by maxPrice only when only maxPrice provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        maxPrice: 200,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('product.price <= :maxPrice', {
        maxPrice: 200,
      });
    });

    it('should filter by onSale when onSale is true', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        onSale: true,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'product.compareAtPrice > product.price',
      );
    });

    it('should filter by onSale when onSale is false', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        onSale: false,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        '(product.compareAtPrice IS NULL OR product.compareAtPrice <= product.price)',
      );
    });

    it('should filter by tags when tags array provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        tags: ['electronics', 'gaming'],
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('product.tags && :tags', {
        tags: ['electronics', 'gaming'],
      });
    });

    it('should sort by popularity when sortBy is popularity', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'popularity',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
    });

    it('should sort by discountPercentage when sortBy is discountPercentage', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'discountPercentage',
        sortOrder: 'ASC',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.addSelect).toHaveBeenCalled();
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('discount_percentage', 'ASC');
    });

    it('should sort by valid field when sortBy is provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'price',
        sortOrder: 'ASC',
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('product.price', 'ASC');
    });

    it('should default to createdAt DESC when no sortBy provided', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('product.createdAt', 'DESC');
    });

    it('should include deleted products when includeDeleted is true', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
        includeDeleted: true,
      };
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      // Act
      await service.findAll(queryDto);

      // Assert
      // When includeDeleted is true, the where clause for deletedAt should not be added
      const deletedAtCalls = (mockRepository.createQueryBuilder as jest.Mock).mock.calls;
      expect(deletedAtCalls.length).toBeGreaterThan(0);
    });

    it('should throw BadRequestException when database error occurs', async () => {
      // Arrange
      const queryDto: ProductQueryDto = {
        page: 1,
        limit: 10,
      };
      mockQueryBuilder.getCount.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.findAll(queryDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update - price validations', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should validate price relationships when price is updated', async () => {
      // Arrange
      const updateDto: UpdateProductDto = {
        price: 150,
        compareAtPrice: 100, // This should fail: compareAtPrice must be > price
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);

      // Act & Assert
      await expect(service.update(productId, updateDto)).rejects.toThrow(BadRequestException);
    });

    it('should validate price relationships when costPrice is updated', async () => {
      // Arrange
      const updateDto: UpdateProductDto = {
        costPrice: -50, // Negative cost price should fail
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);

      // Act & Assert
      await expect(service.update(productId, updateDto)).rejects.toThrow(BadRequestException);
    });

    it('should update successfully with valid price relationships', async () => {
      // Arrange
      const updateDto: UpdateProductDto = {
        price: 99.99,
        costPrice: 50,
        compareAtPrice: 150,
      };
      const updatedProduct = { ...mockProduct, ...updateDto };
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce(updatedProduct);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.update(productId, updateDto);

      // Assert
      expect(result).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalled();
    });

    it('should handle attributes update correctly', async () => {
      // Arrange
      const updateDto: UpdateProductDto = {
        name: 'Updated Product',
        attributes: { color: 'blue', size: 'large' },
      };
      const updatedProduct = { ...mockProduct, ...updateDto };
      mockQueryBuilder.getOne
        .mockResolvedValueOnce(mockProduct)
        .mockResolvedValueOnce(updatedProduct);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act
      const result = await service.update(productId, updateDto);

      // Assert
      expect(result).toBeDefined();
      expect(mockRepository.update).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({
          name: 'Updated Product',
          attributes: { color: 'blue', size: 'large' },
        }),
      );
    });

    it('should throw BadRequestException when update fails to return product', async () => {
      // Arrange
      const updateDto: UpdateProductDto = {
        name: 'Updated Product',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct).mockResolvedValueOnce(null); // Second call returns null
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act & Assert
      await expect(service.update(productId, updateDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when database error occurs during update', async () => {
      // Arrange
      const updateDto: UpdateProductDto = {
        name: 'Updated Product',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);
      mockRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.update(productId, updateDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('activate - edge cases', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should throw NotFoundException when product does not exist', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.activate(productId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when activation fails to return product', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct).mockResolvedValueOnce(null);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act & Assert
      await expect(service.activate(productId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when database error occurs', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);
      mockRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.activate(productId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate - edge cases', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should throw NotFoundException when product does not exist', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.deactivate(productId)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when deactivation fails to return product', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct).mockResolvedValueOnce(null);
      mockRepository.update.mockResolvedValue({ affected: 1 });

      // Act & Assert
      await expect(service.deactivate(productId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when database error occurs', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);
      mockRepository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.deactivate(productId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove - edge cases', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should throw BadRequestException when database error occurs', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValueOnce(mockProduct);
      mockRepository.softDelete.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.remove(productId)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById - edge cases', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return null when database error occurs', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.findById(productId);

      // Assert
      expect(result).toBeNull();
    });

    it('should include deleted products when includeDeleted is true', async () => {
      // Arrange
      mockQueryBuilder.getOne.mockResolvedValue(mockProduct);

      // Act
      await service.findById(productId, true);

      // Assert
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith('product.deletedAt IS NULL');
    });
  });

  describe('search - edge cases', () => {
    it('should throw BadRequestException when database error occurs', async () => {
      // Arrange
      const searchTerm = 'test';
      mockQueryBuilder.getMany.mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect(service.search(searchTerm)).rejects.toThrow(BadRequestException);
    });
  });

  describe('create - price validations', () => {
    it('should throw BadRequestException when price is null', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: null as unknown as number,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when price is undefined', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: undefined as unknown as number,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when price is not a number', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: 'not-a-number' as unknown as number,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when price is NaN', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: NaN,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when price is zero', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: 0,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when price is negative', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: -10,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when costPrice is not a number', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: 100,
        costPrice: 'invalid' as unknown as number,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when costPrice is negative', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: 100,
        costPrice: -50,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when compareAtPrice is not a number', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: 100,
        compareAtPrice: 'invalid' as unknown as number,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when compareAtPrice is less than or equal to price', async () => {
      // Arrange
      const createDto: CreateProductDto = {
        name: 'Test Product',
        description: 'Test',
        price: 100,
        compareAtPrice: 90,
        sku: 'TEST-NEW',
        brand: 'TestBrand',
      };
      mockQueryBuilder.getOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });
  });
});
