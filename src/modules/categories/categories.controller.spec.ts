import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryResponseDto,
  CategoryTreeDto,
  CategoryQueryDto,
  PaginatedCategoriesResponseDto,
} from './dto';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: CategoriesService;

  // Mock Data
  const mockCategoryId = '550e8400-e29b-41d4-a716-446655440000';
  const mockParentCategoryId = '550e8400-e29b-41d4-a716-446655440001';

  const mockCategoryResponse: CategoryResponseDto = {
    id: mockCategoryId,
    name: 'Electronics',
    slug: 'electronics',
    description: 'Electronic products and gadgets',
    parentId: undefined,
    sortOrder: 10,
    isActive: true,
    metadata: { color: '#FF5722', icon: 'electronics-icon' },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const mockSubCategoryResponse: CategoryResponseDto = {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'Smartphones',
    slug: 'smartphones',
    description: 'Mobile phones and accessories',
    parentId: mockCategoryId,
    sortOrder: 5,
    isActive: true,
    metadata: undefined,
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  const mockCategoryTree: CategoryTreeDto[] = [
    {
      id: mockCategoryId,
      name: 'Electronics',
      slug: 'electronics',
      sortOrder: 10,
      isActive: true,
      level: 0,
      hasChildren: true,
      children: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          name: 'Smartphones',
          slug: 'smartphones',
          sortOrder: 5,
          isActive: true,
          level: 1,
          hasChildren: false,
          children: [],
        },
      ],
    },
  ];

  const mockPaginatedResponse: PaginatedCategoriesResponseDto = {
    data: [mockCategoryResponse, mockSubCategoryResponse],
    meta: {
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };

  // Mock CategoriesService
  const mockCategoriesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findBySlug: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
    buildCategoryTree: jest.fn(),
    getDescendants: jest.fn(),
    getCategoryPath: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<CategoriesController>(CategoriesController);
    service = module.get<CategoriesService>(CategoriesService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    // Arrange & Act: Controller is instantiated in beforeEach

    it('should be defined', () => {
      // Assert
      expect(controller).toBeDefined();
    });

    it('should have categoriesService injected', () => {
      // Assert
      expect(service).toBeDefined();
    });
  });

  describe('create', () => {
    const createCategoryDto: CreateCategoryDto = {
      name: 'Electronics',
      description: 'Electronic products and gadgets',
      slug: 'electronics',
      sortOrder: 10,
      metadata: { color: '#FF5722', icon: 'electronics-icon' },
    };

    it('should create a new category successfully', async () => {
      // Arrange
      mockCategoriesService.create.mockResolvedValue(mockCategoryResponse);

      // Act
      const result = await controller.create(createCategoryDto);

      // Assert
      expect(result).toEqual(mockCategoryResponse);
      expect(service.create).toHaveBeenCalledWith(createCategoryDto);
      expect(service.create).toHaveBeenCalledTimes(1);
    });

    it('should create a sub-category with parentId', async () => {
      // Arrange
      const subCategoryDto: CreateCategoryDto = {
        name: 'Smartphones',
        description: 'Mobile phones',
        parentId: mockCategoryId,
        sortOrder: 5,
      };
      mockCategoriesService.create.mockResolvedValue(mockSubCategoryResponse);

      // Act
      const result = await controller.create(subCategoryDto);

      // Assert
      expect(result).toEqual(mockSubCategoryResponse);
      expect(result.parentId).toBe(mockCategoryId);
      expect(service.create).toHaveBeenCalledWith(subCategoryDto);
    });

    it('should create category with minimal data (only required fields)', async () => {
      // Arrange
      const minimalDto: CreateCategoryDto = {
        name: 'Minimal Category',
      };
      const minimalResponse = {
        ...mockCategoryResponse,
        name: 'Minimal Category',
        slug: 'minimal-category',
        description: undefined,
        metadata: undefined,
      };
      mockCategoriesService.create.mockResolvedValue(minimalResponse);

      // Act
      const result = await controller.create(minimalDto);

      // Assert
      expect(result).toEqual(minimalResponse);
      expect(service.create).toHaveBeenCalledWith(minimalDto);
    });

    it('should pass through service errors when creation fails', async () => {
      // Arrange
      const error = new Error('Duplicate category slug');
      mockCategoriesService.create.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.create(createCategoryDto)).rejects.toThrow('Duplicate category slug');
      expect(service.create).toHaveBeenCalledWith(createCategoryDto);
    });
  });

  describe('findAll', () => {
    it('should return paginated categories with default query', async () => {
      // Arrange
      const query: CategoryQueryDto = { page: 1, limit: 10 };
      mockCategoriesService.findAll.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.findAll(query);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('should return filtered categories by search term', async () => {
      // Arrange
      const query: CategoryQueryDto = { page: 1, limit: 10, search: 'Electronics' };
      const filteredResponse = {
        ...mockPaginatedResponse,
        data: [mockCategoryResponse],
        meta: {
          ...mockPaginatedResponse.meta,
          total: 1,
        },
      };
      mockCategoriesService.findAll.mockResolvedValue(filteredResponse);

      // Act
      const result = await controller.findAll(query);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toContain('Electronics');
      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('should return categories filtered by parentId', async () => {
      // Arrange
      const query: CategoryQueryDto = { page: 1, limit: 10, parentId: mockCategoryId };
      const childrenResponse = {
        ...mockPaginatedResponse,
        data: [mockSubCategoryResponse],
        meta: {
          ...mockPaginatedResponse.meta,
          total: 1,
        },
      };
      mockCategoriesService.findAll.mockResolvedValue(childrenResponse);

      // Act
      const result = await controller.findAll(query);

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.parentId).toBe(mockCategoryId);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('should return empty result when no categories found', async () => {
      // Arrange
      const query: CategoryQueryDto = { page: 1, limit: 10 };
      const emptyResponse = {
        data: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      };
      mockCategoriesService.findAll.mockResolvedValue(emptyResponse);

      // Act
      const result = await controller.findAll(query);

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('should handle sorting and ordering in query', async () => {
      // Arrange
      const query: CategoryQueryDto = {
        page: 1,
        limit: 10,
        sortBy: 'name',
        sortOrder: 'ASC',
      };
      mockCategoriesService.findAll.mockResolvedValue(mockPaginatedResponse);

      // Act
      const result = await controller.findAll(query);

      // Assert
      expect(result).toEqual(mockPaginatedResponse);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('getCategoryTree', () => {
    it('should return category tree structure', async () => {
      // Arrange
      mockCategoriesService.buildCategoryTree.mockResolvedValue(mockCategoryTree);

      // Act
      const result = await controller.getCategoryTree();

      // Assert
      expect(result).toEqual(mockCategoryTree);
      expect(result[0]!.children).toBeDefined();
      expect(result[0]!.children).toHaveLength(1);
      expect(service.buildCategoryTree).toHaveBeenCalledWith(false);
    });

    it('should include inactive categories when includeInactive is true', async () => {
      // Arrange
      const treeWithInactive = [...mockCategoryTree];
      mockCategoriesService.buildCategoryTree.mockResolvedValue(treeWithInactive);

      // Act
      const result = await controller.getCategoryTree(true);

      // Assert
      expect(result).toEqual(treeWithInactive);
      expect(service.buildCategoryTree).toHaveBeenCalledWith(true);
    });

    it('should include inactive categories when includeInactive is "true" string', async () => {
      // Arrange
      mockCategoriesService.buildCategoryTree.mockResolvedValue(mockCategoryTree);

      // Act
      const result = await controller.getCategoryTree('true');

      // Assert
      expect(result).toEqual(mockCategoryTree);
      expect(service.buildCategoryTree).toHaveBeenCalledWith(true);
    });

    it('should exclude inactive categories when includeInactive is false', async () => {
      // Arrange
      mockCategoriesService.buildCategoryTree.mockResolvedValue(mockCategoryTree);

      // Act
      const result = await controller.getCategoryTree(false);

      // Assert
      expect(result).toEqual(mockCategoryTree);
      expect(service.buildCategoryTree).toHaveBeenCalledWith(false);
    });

    it('should exclude inactive categories when includeInactive is undefined', async () => {
      // Arrange
      mockCategoriesService.buildCategoryTree.mockResolvedValue(mockCategoryTree);

      // Act
      const result = await controller.getCategoryTree(undefined);

      // Assert
      expect(result).toEqual(mockCategoryTree);
      expect(service.buildCategoryTree).toHaveBeenCalledWith(false);
    });

    it('should return empty array when no categories exist', async () => {
      // Arrange
      mockCategoriesService.buildCategoryTree.mockResolvedValue([]);

      // Act
      const result = await controller.getCategoryTree();

      // Assert
      expect(result).toEqual([]);
      expect(service.buildCategoryTree).toHaveBeenCalledWith(false);
    });
  });

  describe('findBySlug', () => {
    it('should return category when found by slug', async () => {
      // Arrange
      mockCategoriesService.findBySlug.mockResolvedValue(mockCategoryResponse);

      // Act
      const result = await controller.findBySlug('electronics');

      // Assert
      expect(result).toEqual(mockCategoryResponse);
      expect(result.slug).toBe('electronics');
      expect(service.findBySlug).toHaveBeenCalledWith('electronics');
    });

    it('should throw NotFoundException when category not found by slug', async () => {
      // Arrange
      mockCategoriesService.findBySlug.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.findBySlug('non-existent-slug')).rejects.toThrow(NotFoundException);
      await expect(controller.findBySlug('non-existent-slug')).rejects.toThrow(
        "Category with slug 'non-existent-slug' not found",
      );
      expect(service.findBySlug).toHaveBeenCalledWith('non-existent-slug');
    });

    it('should handle slug with hyphens correctly', async () => {
      // Arrange
      const categoryWithHyphens = {
        ...mockCategoryResponse,
        slug: 'consumer-electronics',
        name: 'Consumer Electronics',
      };
      mockCategoriesService.findBySlug.mockResolvedValue(categoryWithHyphens);

      // Act
      const result = await controller.findBySlug('consumer-electronics');

      // Assert
      expect(result).toEqual(categoryWithHyphens);
      expect(result.slug).toBe('consumer-electronics');
      expect(service.findBySlug).toHaveBeenCalledWith('consumer-electronics');
    });
  });

  describe('findOne', () => {
    it('should return category when found by ID', async () => {
      // Arrange
      mockCategoriesService.findOne.mockResolvedValue(mockCategoryResponse);

      // Act
      const result = await controller.findOne(mockCategoryId);

      // Assert
      expect(result).toEqual(mockCategoryResponse);
      expect(result.id).toBe(mockCategoryId);
      expect(service.findOne).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through NotFoundException from service when category not found', async () => {
      // Arrange
      const error = new NotFoundException(`Category with id ${mockCategoryId} not found`);
      mockCategoriesService.findOne.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.findOne(mockCategoryId)).rejects.toThrow(NotFoundException);
      expect(service.findOne).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should call service with the provided UUID', async () => {
      // Arrange
      const customId = '650e8400-e29b-41d4-a716-446655440099';
      const customCategory = { ...mockCategoryResponse, id: customId };
      mockCategoriesService.findOne.mockResolvedValue(customCategory);

      // Act
      const result = await controller.findOne(customId);

      // Assert
      expect(result.id).toBe(customId);
      expect(service.findOne).toHaveBeenCalledWith(customId);
    });
  });

  describe('getDescendants', () => {
    const mockDescendants: CategoryResponseDto[] = [
      mockSubCategoryResponse,
      {
        ...mockSubCategoryResponse,
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Tablets',
        slug: 'tablets',
        parentId: mockCategoryId,
      },
    ];

    it('should return all descendants of a category', async () => {
      // Arrange
      mockCategoriesService.getDescendants.mockResolvedValue(mockDescendants);

      // Act
      const result = await controller.getDescendants(mockCategoryId);

      // Assert
      expect(result).toEqual(mockDescendants);
      expect(result).toHaveLength(2);
      expect(service.getDescendants).toHaveBeenCalledWith(mockCategoryId, undefined);
    });

    it('should return descendants with maxDepth limit', async () => {
      // Arrange
      mockCategoriesService.getDescendants.mockResolvedValue([mockSubCategoryResponse]);

      // Act
      const result = await controller.getDescendants(mockCategoryId, 1);

      // Assert
      expect(result).toEqual([mockSubCategoryResponse]);
      expect(service.getDescendants).toHaveBeenCalledWith(mockCategoryId, 1);
    });

    it('should return empty array when category has no descendants', async () => {
      // Arrange
      mockCategoriesService.getDescendants.mockResolvedValue([]);

      // Act
      const result = await controller.getDescendants(mockCategoryId);

      // Assert
      expect(result).toEqual([]);
      expect(service.getDescendants).toHaveBeenCalledWith(mockCategoryId, undefined);
    });

    it('should handle maxDepth of 0 (only direct children)', async () => {
      // Arrange
      mockCategoriesService.getDescendants.mockResolvedValue([mockSubCategoryResponse]);

      // Act
      const result = await controller.getDescendants(mockCategoryId, 0);

      // Assert
      expect(result).toHaveLength(1);
      expect(service.getDescendants).toHaveBeenCalledWith(mockCategoryId, 0);
    });
  });

  describe('getCategoryPath', () => {
    it('should return path from root to category', async () => {
      // Arrange
      const mockPath = ['Electronics', 'Computers', 'Laptops'];
      mockCategoriesService.getCategoryPath.mockResolvedValue(mockPath);

      // Act
      const result = await controller.getCategoryPath(mockCategoryId);

      // Assert
      expect(result).toEqual(mockPath);
      expect(result).toHaveLength(3);
      expect(service.getCategoryPath).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should return single item path for root category', async () => {
      // Arrange
      const rootPath = ['Electronics'];
      mockCategoriesService.getCategoryPath.mockResolvedValue(rootPath);

      // Act
      const result = await controller.getCategoryPath(mockCategoryId);

      // Assert
      expect(result).toEqual(rootPath);
      expect(result).toHaveLength(1);
      expect(service.getCategoryPath).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should handle deep category hierarchies', async () => {
      // Arrange
      const deepPath = ['Electronics', 'Computers', 'Laptops', 'Gaming Laptops', 'High-End Gaming'];
      mockCategoriesService.getCategoryPath.mockResolvedValue(deepPath);

      // Act
      const result = await controller.getCategoryPath(mockCategoryId);

      // Assert
      expect(result).toEqual(deepPath);
      expect(result).toHaveLength(5);
      expect(service.getCategoryPath).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through NotFoundException when category not found', async () => {
      // Arrange
      const error = new NotFoundException('Category not found');
      mockCategoriesService.getCategoryPath.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.getCategoryPath(mockCategoryId)).rejects.toThrow(NotFoundException);
      expect(service.getCategoryPath).toHaveBeenCalledWith(mockCategoryId);
    });
  });

  describe('update', () => {
    const updateCategoryDto: UpdateCategoryDto = {
      name: 'Consumer Electronics',
      description: 'Updated description',
      sortOrder: 15,
    };

    const updatedCategoryResponse: CategoryResponseDto = {
      ...mockCategoryResponse,
      name: 'Consumer Electronics',
      description: 'Updated description',
      sortOrder: 15,
      updatedAt: new Date('2024-01-15T00:00:00.000Z'),
    };

    it('should update category successfully', async () => {
      // Arrange
      mockCategoriesService.update.mockResolvedValue(updatedCategoryResponse);

      // Act
      const result = await controller.update(mockCategoryId, updateCategoryDto);

      // Assert
      expect(result).toEqual(updatedCategoryResponse);
      expect(result.name).toBe('Consumer Electronics');
      expect(service.update).toHaveBeenCalledWith(mockCategoryId, updateCategoryDto);
    });

    it('should update category parent (move category)', async () => {
      // Arrange
      const moveDto: UpdateCategoryDto = {
        parentId: mockParentCategoryId,
      };
      const movedCategory = {
        ...mockCategoryResponse,
        parentId: mockParentCategoryId,
      };
      mockCategoriesService.update.mockResolvedValue(movedCategory);

      // Act
      const result = await controller.update(mockCategoryId, moveDto);

      // Assert
      expect(result.parentId).toBe(mockParentCategoryId);
      expect(service.update).toHaveBeenCalledWith(mockCategoryId, moveDto);
    });

    it('should update only specified fields (partial update)', async () => {
      // Arrange
      const partialDto: UpdateCategoryDto = {
        sortOrder: 20,
      };
      const partiallyUpdated = {
        ...mockCategoryResponse,
        sortOrder: 20,
      };
      mockCategoriesService.update.mockResolvedValue(partiallyUpdated);

      // Act
      const result = await controller.update(mockCategoryId, partialDto);

      // Assert
      expect(result.sortOrder).toBe(20);
      expect(result.name).toBe(mockCategoryResponse.name); // Unchanged
      expect(service.update).toHaveBeenCalledWith(mockCategoryId, partialDto);
    });

    it('should pass through NotFoundException when category not found', async () => {
      // Arrange
      const error = new NotFoundException('Category not found');
      mockCategoriesService.update.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.update(mockCategoryId, updateCategoryDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(service.update).toHaveBeenCalledWith(mockCategoryId, updateCategoryDto);
    });

    it('should pass through validation errors from service', async () => {
      // Arrange
      const error = new Error('Circular hierarchy detected');
      mockCategoriesService.update.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.update(mockCategoryId, updateCategoryDto)).rejects.toThrow(
        'Circular hierarchy detected',
      );
      expect(service.update).toHaveBeenCalledWith(mockCategoryId, updateCategoryDto);
    });
  });

  describe('activate', () => {
    const activatedCategoryResponse: CategoryResponseDto = {
      ...mockCategoryResponse,
      isActive: true,
      updatedAt: new Date('2024-01-15T00:00:00.000Z'),
    };

    it('should activate category successfully', async () => {
      // Arrange
      mockCategoriesService.activate.mockResolvedValue(activatedCategoryResponse);

      // Act
      const result = await controller.activate(mockCategoryId);

      // Assert
      expect(result).toEqual(activatedCategoryResponse);
      expect(result.isActive).toBe(true);
      expect(service.activate).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should activate previously inactive category', async () => {
      // Arrange
      const inactiveCategoryActivated = {
        ...mockCategoryResponse,
        isActive: true,
      };
      mockCategoriesService.activate.mockResolvedValue(inactiveCategoryActivated);

      // Act
      const result = await controller.activate(mockCategoryId);

      // Assert
      expect(result.isActive).toBe(true);
      expect(service.activate).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through NotFoundException when category not found', async () => {
      // Arrange
      const error = new NotFoundException('Category not found');
      mockCategoriesService.activate.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.activate(mockCategoryId)).rejects.toThrow(NotFoundException);
      expect(service.activate).toHaveBeenCalledWith(mockCategoryId);
    });
  });

  describe('deactivate', () => {
    const deactivatedCategoryResponse: CategoryResponseDto = {
      ...mockCategoryResponse,
      isActive: false,
      updatedAt: new Date('2024-01-15T00:00:00.000Z'),
    };

    it('should deactivate category successfully', async () => {
      // Arrange
      mockCategoriesService.deactivate.mockResolvedValue(deactivatedCategoryResponse);

      // Act
      const result = await controller.deactivate(mockCategoryId);

      // Assert
      expect(result).toEqual(deactivatedCategoryResponse);
      expect(result.isActive).toBe(false);
      expect(service.deactivate).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should deactivate previously active category', async () => {
      // Arrange
      mockCategoriesService.deactivate.mockResolvedValue(deactivatedCategoryResponse);

      // Act
      const result = await controller.deactivate(mockCategoryId);

      // Assert
      expect(result.isActive).toBe(false);
      expect(service.deactivate).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through NotFoundException when category not found', async () => {
      // Arrange
      const error = new NotFoundException('Category not found');
      mockCategoriesService.deactivate.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.deactivate(mockCategoryId)).rejects.toThrow(NotFoundException);
      expect(service.deactivate).toHaveBeenCalledWith(mockCategoryId);
    });
  });

  describe('remove', () => {
    it('should delete category successfully', async () => {
      // Arrange
      mockCategoriesService.remove.mockResolvedValue(undefined);

      // Act
      const result = await controller.remove(mockCategoryId);

      // Assert
      expect(result).toBeUndefined();
      expect(service.remove).toHaveBeenCalledWith(mockCategoryId);
      expect(service.remove).toHaveBeenCalledTimes(1);
    });

    it('should soft delete category (deletedAt set)', async () => {
      // Arrange
      mockCategoriesService.remove.mockResolvedValue(undefined);

      // Act
      await controller.remove(mockCategoryId);

      // Assert
      expect(service.remove).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through NotFoundException when category not found', async () => {
      // Arrange
      const error = new NotFoundException('Category not found');
      mockCategoriesService.remove.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.remove(mockCategoryId)).rejects.toThrow(NotFoundException);
      expect(service.remove).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through error when category has children', async () => {
      // Arrange
      const error = new Error('Cannot delete category with children');
      mockCategoriesService.remove.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.remove(mockCategoryId)).rejects.toThrow(
        'Cannot delete category with children',
      );
      expect(service.remove).toHaveBeenCalledWith(mockCategoryId);
    });

    it('should pass through error when category has products', async () => {
      // Arrange
      const error = new Error('Cannot delete category with associated products');
      mockCategoriesService.remove.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.remove(mockCategoryId)).rejects.toThrow(
        'Cannot delete category with associated products',
      );
      expect(service.remove).toHaveBeenCalledWith(mockCategoryId);
    });
  });
});
