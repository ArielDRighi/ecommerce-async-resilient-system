import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { Product } from './entities/product.entity';
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  ProductQueryDto,
  PaginatedProductsResponseDto,
} from './dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      // Check if product with SKU already exists
      const existingProduct = await this.findBySku(createProductDto.sku);
      if (existingProduct) {
        throw new ConflictException(`Product with SKU '${createProductDto.sku}' already exists`);
      }

      // Validate price relationships
      this.validatePriceRelationships(createProductDto);

      // Create new product
      const product = this.productRepository.create(createProductDto);
      const savedProduct = await this.productRepository.save(product);

      this.logger.log(
        `Product created successfully: ${savedProduct.name} (SKU: ${savedProduct.sku})`,
      );
      return savedProduct;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      this.logger.error(
        `Failed to create product: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to create product');
    }
  }

  async findAll(queryDto: ProductQueryDto): Promise<PaginatedProductsResponseDto> {
    try {
      const {
        search,
        brand,
        status,
        minPrice,
        maxPrice,
        onSale,
        tags,
        page = 1,
        limit = 10,
        sortBy,
        sortOrder,
        includeDeleted = false,
      } = queryDto;

      const queryBuilder = this.createBaseQuery(includeDeleted);

      // Apply filters
      this.applyFilters(queryBuilder, {
        search,
        brand,
        status,
        minPrice,
        maxPrice,
        onSale,
        tags,
      });

      // Apply sorting
      this.applySorting(queryBuilder, sortBy, sortOrder);

      // Get total count before pagination
      const total = await queryBuilder.getCount();

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      // Execute query
      const products = await queryBuilder.getMany();

      // Transform to response DTOs
      const data = plainToInstance(ProductResponseDto, products, {
        excludeExtraneousValues: true,
      });

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNext,
          hasPrev,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch products: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to fetch products');
    }
  }

  async findById(id: string, includeDeleted = false): Promise<Product | null> {
    try {
      const queryBuilder = this.productRepository.createQueryBuilder('product');
      queryBuilder.where('product.id = :id', { id });

      if (!includeDeleted) {
        queryBuilder.andWhere('product.deletedAt IS NULL');
      }

      const product = await queryBuilder.getOne();
      return product || null;
    } catch (error) {
      this.logger.error(
        `Failed to find product by ID ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  async findBySku(sku: string, includeDeleted = false): Promise<Product | null> {
    try {
      const queryBuilder = this.productRepository.createQueryBuilder('product');
      queryBuilder.where('product.sku = :sku', { sku: sku.toUpperCase() });

      if (!includeDeleted) {
        queryBuilder.andWhere('product.deletedAt IS NULL');
      }

      const product = await queryBuilder.getOne();
      return product || null;
    } catch (error) {
      this.logger.error(
        `Failed to find product by SKU ${sku}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
  }

  async search(searchTerm: string, limit = 10): Promise<ProductResponseDto[]> {
    try {
      const queryBuilder = this.productRepository.createQueryBuilder('product');

      // Full-text search across name, description, and tags
      queryBuilder
        .where('product.deletedAt IS NULL')
        .andWhere('product.isActive = :isActive', { isActive: true })
        .andWhere(
          '(product.name ILIKE :search OR product.description ILIKE :search OR :searchArray && product.tags)',
          {
            search: `%${searchTerm}%`,
            searchArray: [searchTerm.toLowerCase()],
          },
        )
        .orderBy('product.name', 'ASC')
        .limit(limit);

      const products = await queryBuilder.getMany();

      return plainToInstance(ProductResponseDto, products, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to search products: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to search products');
    }
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<ProductResponseDto> {
    try {
      const product = await this.findById(id);
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      // Validate price relationships if prices are being updated
      // Using strict undefined checks (not falsy) because 0 is a valid price
      if (
        updateProductDto.price !== undefined ||
        updateProductDto.costPrice !== undefined ||
        updateProductDto.compareAtPrice !== undefined
      ) {
        const updatedData = { ...product, ...updateProductDto };
        this.validatePriceRelationships(updatedData);
      }

      // Update product
      const { attributes, ...updateFields } = updateProductDto;
      const updateData: Record<string, unknown> = { ...updateFields };
      if (attributes) {
        updateData['attributes'] = attributes;
      }
      await this.productRepository.update(id, updateData);

      // Fetch updated product
      const updatedProduct = await this.findById(id);
      if (!updatedProduct) {
        throw new BadRequestException('Failed to update product');
      }

      this.logger.log(`Product updated successfully: ${updatedProduct.name} (ID: ${id})`);

      return plainToInstance(ProductResponseDto, updatedProduct, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to update product ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to update product');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const product = await this.findById(id);
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      // Soft delete: set deletedAt timestamp
      await this.productRepository.softDelete(id);

      this.logger.log(`Product soft deleted: ${product.name} (ID: ${id})`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete product ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to delete product');
    }
  }

  async activate(id: string): Promise<ProductResponseDto> {
    try {
      const product = await this.findById(id);
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      await this.productRepository.update(id, { isActive: true });

      const activatedProduct = await this.findById(id);
      if (!activatedProduct) {
        throw new BadRequestException('Failed to activate product');
      }

      this.logger.log(`Product activated: ${activatedProduct.name} (ID: ${id})`);

      return plainToInstance(ProductResponseDto, activatedProduct, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to activate product ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to activate product');
    }
  }

  async deactivate(id: string): Promise<ProductResponseDto> {
    try {
      const product = await this.findById(id);
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      await this.productRepository.update(id, { isActive: false });

      const deactivatedProduct = await this.findById(id);
      if (!deactivatedProduct) {
        throw new BadRequestException('Failed to deactivate product');
      }

      this.logger.log(`Product deactivated: ${deactivatedProduct.name} (ID: ${id})`);

      return plainToInstance(ProductResponseDto, deactivatedProduct, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to deactivate product ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Failed to deactivate product');
    }
  }

  private createBaseQuery(includeDeleted = false): SelectQueryBuilder<Product> {
    const queryBuilder = this.productRepository.createQueryBuilder('product');

    if (!includeDeleted) {
      queryBuilder.where('product.deletedAt IS NULL');
    }

    return queryBuilder;
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Product>,
    filters: {
      search?: string;
      brand?: string;
      status?: 'active' | 'inactive' | 'all';
      minPrice?: number;
      maxPrice?: number;
      onSale?: boolean;
      tags?: string[];
    },
  ): void {
    const { search, brand, status, minPrice, maxPrice, onSale, tags } = filters;

    // Full-text search
    if (search) {
      const searchTerm = `%${search}%`;
      queryBuilder.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search OR :searchArray && product.tags)',
        {
          search: searchTerm,
          searchArray: [search.toLowerCase()],
        },
      );
    }

    // Brand filter
    if (brand) {
      queryBuilder.andWhere('product.brand ILIKE :brand', { brand: `%${brand}%` });
    }

    // Status filter
    if (status && status !== 'all') {
      const isActive = status === 'active';
      queryBuilder.andWhere('product.isActive = :isActive', { isActive });
    }

    // Price range filter
    if (minPrice !== undefined && maxPrice !== undefined) {
      queryBuilder.andWhere('product.price BETWEEN :minPrice AND :maxPrice', {
        minPrice,
        maxPrice,
      });
    } else if (minPrice !== undefined) {
      queryBuilder.andWhere('product.price >= :minPrice', { minPrice });
    } else if (maxPrice !== undefined) {
      queryBuilder.andWhere('product.price <= :maxPrice', { maxPrice });
    }

    // On sale filter
    if (onSale !== undefined) {
      if (onSale) {
        queryBuilder.andWhere('product.compareAtPrice > product.price');
      } else {
        queryBuilder.andWhere(
          '(product.compareAtPrice IS NULL OR product.compareAtPrice <= product.price)',
        );
      }
    }

    // Tags filter
    if (tags && Array.isArray(tags) && tags.length > 0) {
      queryBuilder.andWhere('product.tags && :tags', { tags });
    }
  }

  private applySorting(
    queryBuilder: SelectQueryBuilder<Product>,
    sortBy?: string,
    sortOrder?: 'ASC' | 'DESC',
  ): void {
    const validSortFields = [
      'name',
      'price',
      'createdAt',
      'updatedAt',
      'brand',
      'sku',
      'popularity',
      'discountPercentage',
    ];

    const field = validSortFields.includes(sortBy || '') ? sortBy : 'createdAt';
    const order = sortOrder || 'DESC';

    // Handle special sorting cases
    if (field === 'popularity') {
      // For now, we'll sort by creation date as a proxy for popularity
      // In the future, this could be based on order count or view count
      queryBuilder.orderBy('product.createdAt', 'DESC');
    } else if (field === 'discountPercentage') {
      // Sort by discount percentage (calculated field)
      queryBuilder
        .addSelect(
          'CASE WHEN product.compareAtPrice > product.price THEN ROUND(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100) ELSE 0 END',
          'discount_percentage',
        )
        .orderBy('discount_percentage', order);
    } else {
      queryBuilder.orderBy(`product.${field}`, order);
    }

    // Always add a secondary sort by ID for consistency
    queryBuilder.addOrderBy('product.id', 'ASC');
  }

  private validatePriceRelationships(productData: {
    price: number;
    costPrice?: number;
    compareAtPrice?: number;
  }): void {
    const { price, costPrice, compareAtPrice } = productData;

    // Validate price is a valid positive number
    if (price === undefined || price === null) {
      throw new BadRequestException('Product price is required');
    }

    if (typeof price !== 'number' || isNaN(price)) {
      throw new BadRequestException('Product price must be a valid number');
    }

    if (price <= 0) {
      throw new BadRequestException('Product price must be greater than 0');
    }

    // Validate cost price
    if (costPrice !== undefined && costPrice !== null) {
      if (typeof costPrice !== 'number' || isNaN(costPrice)) {
        throw new BadRequestException('Cost price must be a valid number');
      }
      if (costPrice < 0) {
        throw new BadRequestException('Cost price cannot be negative');
      }
    }

    // Validate compare at price
    if (compareAtPrice !== undefined && compareAtPrice !== null) {
      if (typeof compareAtPrice !== 'number' || isNaN(compareAtPrice)) {
        throw new BadRequestException('Compare at price must be a valid number');
      }
      if (compareAtPrice <= price) {
        throw new BadRequestException('Compare at price must be greater than selling price');
      }
    }
  }
}
