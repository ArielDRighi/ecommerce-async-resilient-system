/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// Test file - using 'any' for private method mocking is acceptable
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, UpdateResult } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: jest.Mocked<Repository<Category>>;

  // Mock QueryBuilder factory
  const createMockQueryBuilder = () => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getMany: jest.fn(),
      getCount: jest.fn(),
    };
    return mockQueryBuilder as unknown as jest.Mocked<SelectQueryBuilder<Category>>;
  };

  // Factory functions for test data
  const createMockCategory = (overrides: Partial<Category> = {}): Category => {
    const now = new Date();
    return {
      id: 'cat-123',
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices',
      parentId: null,
      isActive: true,
      sortOrder: 0,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      children: [],
      isRoot: jest.fn(() => !overrides.parentId),
      hasChildren: jest.fn(() => Boolean(overrides.children?.length)),
      isDescendantOf: jest.fn(),
      getAncestors: jest.fn(() => []),
      getLevel: jest.fn(() => 0),
      getPath: jest.fn(() => [overrides.name || 'Electronics']),
      generateSlugIfEmpty: jest.fn(),
      ...overrides,
    } as Category;
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      count: jest.fn(),
      merge: jest.fn(),
      createQueryBuilder: jest.fn(() => createMockQueryBuilder()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    repository = module.get(getRepositoryToken(Category));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have repository injected', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    const createCategoryDto: CreateCategoryDto = {
      name: 'New Category',
      description: 'A new test category',
    };

    it('should create a category successfully', async () => {
      const newCategory = createMockCategory({
        id: 'new-123',
        name: createCategoryDto.name,
        slug: 'new-category',
        description: createCategoryDto.description,
      });

      // Mock findBySlug to return null (slug doesn't exist)
      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);

      repository.create.mockReturnValue(newCategory);
      repository.save.mockResolvedValue(newCategory);

      // Mock findOne for the return
      jest.spyOn(service, 'findOne').mockResolvedValue({
        id: newCategory.id,
        name: newCategory.name,
        slug: newCategory.slug,
      } as any);

      const result = await service.create(createCategoryDto);

      expect(result).toBeDefined();
      expect(result.id).toBe('new-123');
      expect(repository.create).toHaveBeenCalledWith({
        ...createCategoryDto,
        slug: 'new-category',
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should generate slug from name if not provided', async () => {
      const category = createMockCategory({ name: 'Test Category!' });

      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.create.mockReturnValue(category);
      repository.save.mockResolvedValue(category);
      jest.spyOn(service, 'findOne').mockResolvedValue(category as any);

      await service.create({ name: 'Test Category!' });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'test-category',
        }),
      );
    });

    it('should use provided slug if given', async () => {
      const dto = { name: 'Test', slug: 'custom-slug' };
      const category = createMockCategory({ ...dto });

      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.create.mockReturnValue(category);
      repository.save.mockResolvedValue(category);
      jest.spyOn(service, 'findOne').mockResolvedValue(category as any);

      await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'custom-slug' }),
      );
    });

    it('should throw ConflictException if slug already exists', async () => {
      const existingCategory = createMockCategory({ slug: 'existing-slug' });

      jest.spyOn(service, 'findBySlug').mockResolvedValue(existingCategory as any);

      await expect(service.create({ name: 'Test', slug: 'existing-slug' })).rejects.toThrow(
        ConflictException,
      );

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should validate parent exists if parentId provided', async () => {
      const parentCategory = createMockCategory({ id: 'parent-123' });
      const dto = { name: 'Child', parentId: 'parent-123' };

      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'findById').mockResolvedValue(parentCategory);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);

      const newCategory = createMockCategory({ ...dto });
      repository.create.mockReturnValue(newCategory);
      repository.save.mockResolvedValue(newCategory);
      jest.spyOn(service, 'findOne').mockResolvedValue(newCategory as any);

      await service.create(dto);

      expect(service['findById']).toHaveBeenCalledWith('parent-123', {
        includeInactive: true,
      });
    });

    it('should throw BadRequestException if parent not found', async () => {
      const dto = { name: 'Child', parentId: 'non-existent' };

      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should validate unique name within same level', async () => {
      const dto = { name: 'Category', parentId: 'parent-123' };

      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'findById').mockResolvedValue(createMockCategory());
      jest
        .spyOn(service as any, 'validateUniqueNameInLevel')
        .mockRejectedValue(new ConflictException('Name exists at this level'));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException on database error', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.create.mockReturnValue(createMockCategory());
      repository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.create(createCategoryDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated categories with defaults', async () => {
      const categories = [
        createMockCategory({ id: '1', name: 'Cat1' }),
        createMockCategory({ id: '2', name: 'Cat2' }),
      ];

      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(2);
      mockQB.getMany.mockResolvedValue(categories);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should apply pagination correctly', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(25);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const query: CategoryQueryDto = { page: 3, limit: 5 };
      await service.findAll(query);

      expect(mockQB.skip).toHaveBeenCalledWith(10); // (page 3 - 1) * 5
      expect(mockQB.take).toHaveBeenCalledWith(5);
    });

    it('should filter by search term', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([createMockCategory()]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({ search: 'electronics' });

      expect(mockQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ search: '%electronics%' }),
      );
    });

    it('should filter by parentId', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({ parentId: 'parent-123' });

      expect(mockQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('parentId'),
        expect.objectContaining({ parentId: 'parent-123' }),
      );
    });

    it('should filter root categories when parentId is empty string', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({ parentId: '' });

      expect(mockQB.andWhere).toHaveBeenCalledWith(expect.stringContaining('IS NULL'));
    });

    it('should filter by active status', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({ isActive: false });

      expect(mockQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('isActive'),
        expect.objectContaining({ isActive: false }),
      );
    });

    it('should include inactive when includeInactive is true', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({ includeInactive: true });

      // Should NOT filter by isActive when includeInactive is true
      const calls = mockQB.andWhere.mock.calls.map((call) => call[0]);
      const hasActiveFilter = calls.some(
        (call) => typeof call === 'string' && call.includes('isActive'),
      );
      expect(hasActiveFilter).toBe(false);
    });

    it('should apply sorting correctly', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({ sortBy: 'name', sortOrder: 'DESC' });

      expect(mockQB.orderBy).toHaveBeenCalledWith('category.name', 'DESC');
    });

    it('should default to sortOrder field for sorting', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(1);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.findAll({});

      expect(mockQB.orderBy).toHaveBeenCalledWith('category.sortOrder', 'ASC');
    });

    it('should build hierarchy when maxDepth > 0', async () => {
      const parent = createMockCategory({ id: 'p1', name: 'Parent' });
      const child = createMockCategory({
        id: 'c1',
        name: 'Child',
        parentId: 'p1',
      });

      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(2);
      mockQB.getMany.mockResolvedValue([parent, child]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      jest
        .spyOn(service as any, 'buildHierarchyForCategories')
        .mockResolvedValue([{ ...parent, children: [child] }]);

      await service.findAll({ maxDepth: 2 });

      expect(service['buildHierarchyForCategories']).toHaveBeenCalledWith([parent, child], 2);
    });

    it('should calculate pagination metadata correctly', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(50);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 50,
        page: 2,
        limit: 10,
        totalPages: 5,
        hasNext: true,
        hasPrev: true,
      });
    });

    it('should handle empty result set', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getCount.mockResolvedValue(0);
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('should throw BadRequestException on query error', async () => {
      repository.createQueryBuilder.mockImplementation(() => {
        throw new Error('Database connection error');
      });

      await expect(service.findAll({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return category with computed properties', async () => {
      const category = createMockCategory({
        id: 'cat-123',
        name: 'Electronics',
      });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);

      const result = await service.findOne('cat-123');

      expect(result).toBeDefined();
      expect(service['findById']).toHaveBeenCalledWith('cat-123', {
        includeRelations: true,
      });
      expect(category.getLevel).toHaveBeenCalled();
      expect(category.getPath).toHaveBeenCalled();
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySlug', () => {
    it('should return category when found by slug', async () => {
      const category = createMockCategory({ slug: 'electronics' });

      repository.findOne.mockResolvedValue(category);

      const result = await service.findBySlug('electronics');

      expect(result).toBeDefined();
      expect(result?.slug).toBe('electronics');
      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ slug: 'electronics' }),
        }),
      );
    });

    it('should return null when category not found', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.findBySlug('non-existent');

      expect(result).toBeNull();
    });

    it('should include parent and children relations', async () => {
      const parent = createMockCategory({ id: 'p1', name: 'Parent' });
      const category = createMockCategory({
        slug: 'test',
        parent,
        children: [],
      });

      repository.findOne.mockResolvedValue(category);

      await service.findBySlug('test');

      expect(repository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['parent', 'children'],
        }),
      );
    });

    it('should add computed properties to result', async () => {
      const category = createMockCategory({ slug: 'test' });
      repository.findOne.mockResolvedValue(category);

      await service.findBySlug('test');

      expect(category.getLevel).toHaveBeenCalled();
      expect(category.getPath).toHaveBeenCalled();
    });
  });

  describe('buildCategoryTree', () => {
    it('should build tree structure from flat categories', async () => {
      const parent = createMockCategory({ id: 'p1', name: 'Parent' });
      const child = createMockCategory({
        id: 'c1',
        name: 'Child',
        parentId: 'p1',
      });

      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([parent, child]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.buildCategoryTree();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by active status by default', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.buildCategoryTree(false);

      expect(mockQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('isActive'),
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should include inactive when specified', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.buildCategoryTree(true);

      // Should NOT add isActive filter
      const calls = mockQB.andWhere.mock.calls;
      expect(calls.length).toBe(0);
    });

    it('should return empty array when no categories exist', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service.buildCategoryTree();

      expect(result).toEqual([]);
    });

    it('should order by sortOrder and name', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service.buildCategoryTree();

      expect(mockQB.orderBy).toHaveBeenCalledWith('category.sortOrder', 'ASC');
      expect(mockQB.addOrderBy).toHaveBeenCalledWith('category.name', 'ASC');
    });

    it('should throw BadRequestException on error', async () => {
      repository.createQueryBuilder.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.buildCategoryTree()).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updateDto: UpdateCategoryDto = {
      name: 'Updated Name',
      description: 'Updated description',
    };

    it('should update category successfully', async () => {
      const existingCategory = createMockCategory({ id: 'cat-123' });
      const updatedCategory = createMockCategory({
        ...existingCategory,
        ...updateDto,
      });

      jest.spyOn(service as any, 'findById').mockResolvedValue(existingCategory);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.save.mockResolvedValue(updatedCategory);
      jest.spyOn(service, 'findOne').mockResolvedValue(updatedCategory as any);

      const result = await service.update('cat-123', updateDto);

      expect(result).toBeDefined();
      expect(repository.merge).toHaveBeenCalledWith(existingCategory, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto)).rejects.toThrow(NotFoundException);
    });

    it('should validate hierarchy when updating parentId', async () => {
      const category = createMockCategory({ id: 'cat-123' });
      const dto = { parentId: 'new-parent' };

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service, 'validateHierarchy').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.save.mockResolvedValue(category);
      jest.spyOn(service, 'findOne').mockResolvedValue(category as any);

      await service.update('cat-123', dto);

      expect(service.validateHierarchy).toHaveBeenCalledWith('new-parent', 'cat-123');
    });

    it('should validate unique slug when updating', async () => {
      const category = createMockCategory({ id: 'cat-123', slug: 'old-slug' });
      const dto = { slug: 'new-slug' };

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.save.mockResolvedValue(createMockCategory({ ...category, ...dto }));
      jest.spyOn(service, 'findOne').mockResolvedValue({ ...category, ...dto } as any);

      await service.update('cat-123', dto);

      expect(service.findBySlug).toHaveBeenCalledWith('new-slug');
    });

    it('should throw ConflictException if new slug exists', async () => {
      const category = createMockCategory({ id: 'cat-123', slug: 'old-slug' });
      const existingWithSlug = createMockCategory({
        id: 'other-123',
        slug: 'new-slug',
      });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service, 'findBySlug').mockResolvedValue(existingWithSlug as any);

      await expect(service.update('cat-123', { slug: 'new-slug' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow same slug for same category', async () => {
      const category = createMockCategory({ id: 'cat-123', slug: 'test-slug' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service, 'findBySlug').mockResolvedValue(category as any);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.save.mockResolvedValue(category);
      jest.spyOn(service, 'findOne').mockResolvedValue(category as any);

      await expect(service.update('cat-123', { slug: 'test-slug' })).resolves.toBeDefined();
    });

    it('should validate unique name when updating name', async () => {
      const category = createMockCategory({ id: 'cat-123', name: 'Old Name' });
      const dto = { name: 'New Name' };

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.save.mockResolvedValue(createMockCategory({ ...category, ...dto }));
      jest.spyOn(service, 'findOne').mockResolvedValue({ ...category, ...dto } as any);

      await service.update('cat-123', dto);

      expect(service['validateUniqueNameInLevel']).toHaveBeenCalledWith(
        'New Name',
        category.parentId,
        'cat-123',
      );
    });

    it('should throw BadRequestException on database error', async () => {
      const category = createMockCategory({ id: 'cat-123' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.save.mockRejectedValue(new Error('Database error'));

      await expect(service.update('cat-123', updateDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should soft delete category successfully', async () => {
      const category = createMockCategory({ id: 'cat-123' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      repository.count.mockResolvedValue(0); // No children
      repository.softDelete.mockResolvedValue({ affected: 1, raw: {} } as any);

      await service.remove('cat-123');

      expect(repository.softDelete).toHaveBeenCalledWith('cat-123');
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if category has children', async () => {
      const category = createMockCategory({ id: 'cat-123' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      repository.count.mockResolvedValue(2); // Has 2 children

      await expect(service.remove('cat-123')).rejects.toThrow(BadRequestException);
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('should check for children before deletion', async () => {
      const category = createMockCategory({ id: 'cat-123' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      repository.count.mockResolvedValue(0);
      repository.softDelete.mockResolvedValue({ affected: 1, raw: {} } as any);

      await service.remove('cat-123');

      expect(repository.count).toHaveBeenCalledWith({
        where: { parentId: 'cat-123', deletedAt: expect.anything() },
      });
    });

    it('should throw BadRequestException on database error', async () => {
      const category = createMockCategory({ id: 'cat-123' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      repository.count.mockResolvedValue(0);
      repository.softDelete.mockRejectedValue(new Error('Database error'));

      await expect(service.remove('cat-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('activate', () => {
    it('should activate category successfully', async () => {
      const category = createMockCategory({ id: 'cat-123', isActive: false });
      const activatedCategory = { ...category, isActive: true };

      jest
        .spyOn(service as any, 'findById')
        .mockResolvedValueOnce(category)
        .mockResolvedValueOnce(activatedCategory);
      repository.update.mockResolvedValue({} as UpdateResult);

      const result = await service.activate('cat-123');

      expect(repository.update).toHaveBeenCalledWith('cat-123', {
        isActive: true,
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.activate('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate category successfully', async () => {
      const category = createMockCategory({ id: 'cat-123', isActive: true });
      const deactivatedCategory = { ...category, isActive: false };

      jest
        .spyOn(service as any, 'findById')
        .mockResolvedValueOnce(category)
        .mockResolvedValueOnce(deactivatedCategory);
      repository.update.mockResolvedValue({} as UpdateResult);

      const result = await service.deactivate('cat-123');

      expect(repository.update).toHaveBeenCalledWith('cat-123', {
        isActive: false,
      });
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.deactivate('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategoryPath', () => {
    it('should return path for category', async () => {
      const grandparent = createMockCategory({
        id: 'gp',
        name: 'Grandparent',
      });
      const parent = createMockCategory({
        id: 'p',
        name: 'Parent',
        parentId: 'gp',
        parent: grandparent,
        getAncestors: () => [grandparent],
        getPath: () => ['Grandparent', 'Parent'],
      });
      const category = createMockCategory({
        id: 'c',
        name: 'Child',
        parentId: 'p',
        parent,
        getAncestors: () => [grandparent, parent],
        getPath: () => ['Grandparent', 'Parent', 'Child'],
      });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);

      const result = await service.getCategoryPath('c');

      expect(result).toEqual(['Grandparent', 'Parent', 'Child']);
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.getCategoryPath('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDescendants', () => {
    it('should return all descendants of a category', async () => {
      const category = createMockCategory({ id: 'parent' });
      const child1 = createMockCategory({ id: 'c1', parentId: 'parent' });
      const child2 = createMockCategory({ id: 'c2', parentId: 'parent' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service as any, 'findDescendants').mockResolvedValue([child1, child2]);

      const result = await service.getDescendants('parent');

      expect(result).toHaveLength(2);
      expect(service['findDescendants']).toHaveBeenCalledWith('parent', undefined);
    });

    it('should respect maxDepth parameter', async () => {
      const category = createMockCategory({ id: 'parent' });
      const child = createMockCategory({ id: 'c1', parentId: 'parent' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service as any, 'findDescendants').mockResolvedValue([child]);

      await service.getDescendants('parent', 1);

      expect(service['findDescendants']).toHaveBeenCalledWith('parent', 1);
    });

    it('should throw NotFoundException when category not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValue(null);

      await expect(service.getDescendants('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should return empty array when no descendants exist', async () => {
      const category = createMockCategory({ id: 'parent' });

      jest.spyOn(service as any, 'findById').mockResolvedValue(category);
      jest.spyOn(service as any, 'findDescendants').mockResolvedValue([]);

      const result = await service.getDescendants('parent');

      expect(result).toEqual([]);
    });
  });

  describe('validateHierarchy', () => {
    it('should throw if parent equals child', async () => {
      await expect(service.validateHierarchy('same-id', 'same-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if parent not found', async () => {
      jest.spyOn(service as any, 'findById').mockResolvedValueOnce(null); // parent not found

      await expect(service.validateHierarchy('parent-id', 'child-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if child not found', async () => {
      const parent = createMockCategory({ id: 'parent' });

      jest
        .spyOn(service as any, 'findById')
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(null); // child not found

      await expect(service.validateHierarchy('parent', 'child')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if creating circular hierarchy', async () => {
      const grandparent = createMockCategory({ id: 'gp' });
      const parent = createMockCategory({ id: 'p' });
      const child = createMockCategory({ id: 'c' });

      jest
        .spyOn(service as any, 'findById')
        .mockResolvedValueOnce(child) // trying to set child as parent
        .mockResolvedValueOnce(parent);
      jest
        .spyOn(service, 'getDescendants')
        .mockResolvedValue([child as any, { id: 'grandchild' } as any]);

      await expect(service.validateHierarchy('c', 'p')).rejects.toThrow(BadRequestException);
    });

    it('should allow valid parent-child relationship', async () => {
      const parent = createMockCategory({ id: 'parent' });
      const child = createMockCategory({ id: 'child' });

      jest
        .spyOn(service as any, 'findById')
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(child);
      jest.spyOn(service, 'getDescendants').mockResolvedValue([]);

      await expect(service.validateHierarchy('parent', 'child')).resolves.not.toThrow();
    });
  });

  describe('generateSlug', () => {
    it('should convert name to lowercase slug', () => {
      const slug = service.generateSlug('Test Category');
      expect(slug).toBe('test-category');
    });

    it('should replace spaces with hyphens', () => {
      const slug = service.generateSlug('Multiple Word Category');
      expect(slug).toBe('multiple-word-category');
    });

    it('should remove special characters', () => {
      const slug = service.generateSlug('Category! With @ Special # Characters');
      expect(slug).toBe('category-with-special-characters');
    });

    it('should handle underscores', () => {
      const slug = service.generateSlug('category_with_underscores');
      expect(slug).toBe('category-with-underscores');
    });

    it('should remove leading and trailing hyphens', () => {
      const slug = service.generateSlug('  --test--  ');
      expect(slug).toBe('test');
    });

    it('should handle multiple consecutive hyphens', () => {
      const slug = service.generateSlug('test---category');
      expect(slug).toBe('test-category');
    });

    it('should handle empty string', () => {
      const slug = service.generateSlug('');
      expect(slug).toBe('');
    });

    it('should handle string with only special characters', () => {
      const slug = service.generateSlug('!@#$%');
      expect(slug).toBe('');
    });
  });

  describe('Private helper: findById', () => {
    it('should find category by ID with default options', async () => {
      const category = createMockCategory({ id: 'cat-123' });
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(category);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service['findById']('cat-123');

      expect(mockQB.where).toHaveBeenCalledWith('category.id = :id', {
        id: 'cat-123',
      });
      expect(mockQB.andWhere).toHaveBeenCalledWith(expect.stringContaining('deletedAt'));
      expect(result).toBe(category);
    });

    it('should include relations when specified', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(createMockCategory());
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['findById']('cat-123', { includeRelations: true });

      expect(mockQB.leftJoinAndSelect).toHaveBeenCalledWith('category.parent', 'parent');
      expect(mockQB.leftJoinAndSelect).toHaveBeenCalledWith('category.children', 'children');
    });

    it('should include inactive when specified', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(createMockCategory());
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['findById']('cat-123', { includeInactive: true });

      const calls = mockQB.andWhere.mock.calls.map((call) => call[0]);
      const hasActiveFilter = calls.some(
        (call) => typeof call === 'string' && call.includes('isActive'),
      );
      expect(hasActiveFilter).toBe(false);
    });

    it('should include deleted when specified', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(createMockCategory());
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['findById']('cat-123', { includeDeleted: true });

      const calls = mockQB.andWhere.mock.calls.map((call) => call[0]);
      const hasDeletedFilter = calls.some(
        (call) => typeof call === 'string' && call.includes('deletedAt'),
      );
      expect(hasDeletedFilter).toBe(false);
    });
  });

  describe('Private helper: validateUniqueNameInLevel', () => {
    it('should pass when name is unique at level', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(null); // No existing category
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await expect(
        service['validateUniqueNameInLevel']('Unique Name', undefined),
      ).resolves.not.toThrow();
    });

    it('should throw ConflictException when name exists at same level', async () => {
      const existing = createMockCategory({ name: 'Duplicate' });
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(existing);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await expect(service['validateUniqueNameInLevel']('Duplicate', undefined)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should check root level when parentId is null', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(null);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['validateUniqueNameInLevel']('Test', undefined);

      expect(mockQB.andWhere).toHaveBeenCalledWith(expect.stringContaining('parentId IS NULL'));
    });

    it('should check specific parent level when parentId provided', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(null);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['validateUniqueNameInLevel']('Test', 'parent-123');

      expect(mockQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('parentId'),
        expect.objectContaining({ parentId: 'parent-123' }),
      );
    });

    it('should exclude specific category ID when provided', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getOne.mockResolvedValue(null);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['validateUniqueNameInLevel']('Test', undefined, 'exclude-123');

      expect(mockQB.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('id !='),
        expect.objectContaining({ excludeId: 'exclude-123' }),
      );
    });
  });

  describe('Private helper: buildTreeStructure', () => {
    it('should build tree from flat category list', () => {
      const parent = createMockCategory({ id: 'p1', name: 'Parent', sortOrder: 1 });
      const child1 = createMockCategory({
        id: 'c1',
        name: 'Child1',
        parentId: 'p1',
        sortOrder: 1,
      });
      const child2 = createMockCategory({
        id: 'c2',
        name: 'Child2',
        parentId: 'p1',
        sortOrder: 2,
      });

      const tree = service['buildTreeStructure']([parent, child1, child2]);

      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe('p1');
      expect(tree[0]?.children).toHaveLength(2);
    });

    it('should handle multiple root categories', () => {
      const root1 = createMockCategory({ id: 'r1', name: 'Root1' });
      const root2 = createMockCategory({ id: 'r2', name: 'Root2' });

      const tree = service['buildTreeStructure']([root1, root2]);

      expect(tree).toHaveLength(2);
    });

    it('should respect sortOrder', () => {
      const cat1 = createMockCategory({ id: 'c1', sortOrder: 3, name: 'C' });
      const cat2 = createMockCategory({ id: 'c2', sortOrder: 1, name: 'A' });
      const cat3 = createMockCategory({ id: 'c3', sortOrder: 2, name: 'B' });

      const tree = service['buildTreeStructure']([cat1, cat2, cat3]);

      expect(tree[0]?.id).toBe('c2'); // sortOrder 1
      expect(tree[1]?.id).toBe('c3'); // sortOrder 2
      expect(tree[2]?.id).toBe('c1'); // sortOrder 3
    });

    it('should sort alphabetically when sortOrder is same', () => {
      const cat1 = createMockCategory({ id: 'c1', sortOrder: 1, name: 'Zebra' });
      const cat2 = createMockCategory({ id: 'c2', sortOrder: 1, name: 'Apple' });

      const tree = service['buildTreeStructure']([cat1, cat2]);

      expect(tree[0]?.name).toBe('Apple');
      expect(tree[1]?.name).toBe('Zebra');
    });

    it('should handle deep hierarchies', () => {
      const l1 = createMockCategory({ id: 'l1', name: 'Level1' });
      const l2 = createMockCategory({ id: 'l2', name: 'Level2', parentId: 'l1' });
      const l3 = createMockCategory({ id: 'l3', name: 'Level3', parentId: 'l2' });

      const tree = service['buildTreeStructure']([l1, l2, l3]);

      expect(tree).toHaveLength(1);
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children?.[0]?.children).toHaveLength(1);
    });

    it('should prevent infinite recursion at depth 10', () => {
      const categories = Array.from({ length: 15 }, (_, i) => {
        return createMockCategory({
          id: `l${i}`,
          name: `Level${i}`,
          parentId: i > 0 ? `l${i - 1}` : undefined,
        });
      });

      const tree = service['buildTreeStructure'](categories);

      // Should complete without stack overflow
      expect(tree).toBeDefined();
    });

    it('should set level property correctly', () => {
      const parent = createMockCategory({ id: 'p', name: 'Parent' });
      const child = createMockCategory({ id: 'c', name: 'Child', parentId: 'p' });

      const tree = service['buildTreeStructure']([parent, child]);

      expect(tree[0]?.level).toBe(0);
      expect(tree[0]?.children?.[0]?.level).toBe(1);
    });

    it('should set hasChildren property', () => {
      const parent = createMockCategory({ id: 'p', name: 'Parent' });
      const child = createMockCategory({ id: 'c', name: 'Child', parentId: 'p' });

      const tree = service['buildTreeStructure']([parent, child]);

      expect(tree[0]?.hasChildren).toBe(true);
      expect(tree[0]?.children?.[0]?.hasChildren).toBe(false);
    });
  });

  describe('Private helper: findDescendants', () => {
    it('should find all descendants recursively', async () => {
      const child1 = createMockCategory({ id: 'c1', parentId: 'parent' });
      const child2 = createMockCategory({ id: 'c2', parentId: 'parent' });
      const grandchild = createMockCategory({ id: 'gc1', parentId: 'c1' });

      const mockQB1 = createMockQueryBuilder();
      mockQB1.getMany.mockResolvedValue([child1, child2]);

      const mockQB2 = createMockQueryBuilder();
      mockQB2.getMany.mockResolvedValue([grandchild]);

      const mockQB3 = createMockQueryBuilder();
      mockQB3.getMany.mockResolvedValue([]);

      repository.createQueryBuilder
        .mockReturnValueOnce(mockQB1)
        .mockReturnValueOnce(mockQB2)
        .mockReturnValueOnce(mockQB3);

      const result = await service['findDescendants']('parent');

      expect(result).toHaveLength(3);
      expect(result.map((c) => c.id)).toEqual(['c1', 'c2', 'gc1']);
    });

    it('should respect maxDepth parameter', async () => {
      const child = createMockCategory({ id: 'c1', parentId: 'parent' });

      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([child]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service['findDescendants']('parent', 1);

      expect(result).toHaveLength(1);
      // Should only query once (depth 1)
      expect(repository.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no descendants exist', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      const result = await service['findDescendants']('parent');

      expect(result).toEqual([]);
    });

    it('should filter out soft-deleted categories', async () => {
      const mockQB = createMockQueryBuilder();
      mockQB.getMany.mockResolvedValue([]);
      repository.createQueryBuilder.mockReturnValue(mockQB);

      await service['findDescendants']('parent');

      expect(mockQB.andWhere).toHaveBeenCalledWith(expect.stringContaining('deletedAt'));
    });
  });

  describe('Private helper: buildHierarchyForCategories', () => {
    it('should build hierarchy from flat list', async () => {
      const parent = createMockCategory({ id: 'p1', name: 'Parent' });
      const child1 = createMockCategory({ id: 'c1', parentId: 'p1' });
      const child2 = createMockCategory({ id: 'c2', parentId: 'p1' });

      const result = await service['buildHierarchyForCategories']([parent, child1, child2], 3);

      expect(result).toHaveLength(1);
      expect(result[0]?.children).toHaveLength(2);
    });

    it('should return only root categories', async () => {
      const root1 = createMockCategory({ id: 'r1' });
      const root2 = createMockCategory({ id: 'r2' });
      const child = createMockCategory({ id: 'c1', parentId: 'r1' });

      const result = await service['buildHierarchyForCategories']([root1, root2, child], 3);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('r1');
      expect(result[1]?.id).toBe('r2');
    });

    it('should handle empty input', async () => {
      const result = await service['buildHierarchyForCategories']([], 3);
      expect(result).toEqual([]);
    });

    it('should initialize children arrays', async () => {
      const category = createMockCategory({ id: 'c1' });
      const result = await service['buildHierarchyForCategories']([category], 3);

      expect(result[0]?.children).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle categories with undefined metadata', async () => {
      const category = createMockCategory({ metadata: undefined });
      jest.spyOn(service as any, 'findById').mockResolvedValue(category);

      const result = await service.findOne(category.id);

      expect(result).toBeDefined();
    });

    it('should handle categories with complex metadata', async () => {
      const category = createMockCategory({
        metadata: { color: 'blue', icon: 'icon.png', custom: { nested: true } },
      });
      jest.spyOn(service as any, 'findById').mockResolvedValue(category);

      const result = await service.findOne(category.id);

      expect(result).toBeDefined();
    });

    it('should handle concurrent slug generation', async () => {
      jest.spyOn(service, 'findBySlug').mockResolvedValue(null);
      jest.spyOn(service as any, 'validateUniqueNameInLevel').mockResolvedValue(undefined);
      repository.create.mockReturnValue(createMockCategory());
      repository.save.mockResolvedValue(createMockCategory());
      jest.spyOn(service, 'findOne').mockResolvedValue(createMockCategory() as any);

      const promises = [
        service.create({ name: 'Test Category' }),
        service.create({ name: 'Test Category' }),
      ];

      await expect(Promise.all(promises)).resolves.toBeDefined();
    });

    it('should handle very long category names', async () => {
      const longName = 'A'.repeat(300);
      const slug = service.generateSlug(longName);

      // generateSlug doesn't limit length, it just converts
      // Database constraint would enforce max length
      expect(slug).toBe('a'.repeat(300));
      expect(slug.length).toBeGreaterThan(255);
    });

    it('should handle category with circular parent reference in data', async () => {
      // This tests the hierarchy validation
      const cat1 = createMockCategory({ id: 'cat1' });
      const cat2 = createMockCategory({ id: 'cat2' });

      jest
        .spyOn(service as any, 'findById')
        .mockResolvedValueOnce(cat1)
        .mockResolvedValueOnce(cat2);
      jest.spyOn(service, 'getDescendants').mockResolvedValue([cat1 as any]);

      await expect(service.validateHierarchy('cat1', 'cat2')).rejects.toThrow(BadRequestException);
    });
  });
});
