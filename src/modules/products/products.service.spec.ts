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

  beforeEach(async () => {
    // Re-setup mock chain after clearAllMocks()
    mockQueryBuilder.where.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.orderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addOrderBy.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.addSelect.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.skip.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.take.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.limit.mockReturnValue(mockQueryBuilder);
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

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
  });
});
