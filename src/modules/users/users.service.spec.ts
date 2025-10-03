import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto';

describe('UsersService', () => {
  let service: UsersService;
  let repository: jest.Mocked<Repository<User>>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    passwordHash: '$2b$10$hashedpassword',
    isActive: true,
    phoneNumber: '+1234567890',
    dateOfBirth: new Date('1990-01-01'),
    language: 'en',
    timezone: 'UTC',
    emailVerifiedAt: undefined,
    lastLoginAt: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    orders: Promise.resolve([]),
    get fullName() {
      return `${this.firstName} ${this.lastName}`;
    },
    get isEmailVerified() {
      return this.emailVerifiedAt !== null && this.emailVerifiedAt !== undefined;
    },
    hashPassword: jest.fn(),
    normalizeEmail: jest.fn(),
    normalizeName: jest.fn(),
    validatePassword: jest.fn(),
    markEmailAsVerified: jest.fn(),
    updateLastLogin: jest.fn(),
    deactivate: jest.fn(),
    activate: jest.fn(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      email: 'test@example.com',
      passwordHash: 'StrongPassword123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should create user and return saved entity when valid data provided', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(mockUser);
      repository.save.mockResolvedValue(mockUser);

      // Act
      const result = await service.create(createUserDto);

      // Assert
      expect(result).toBe(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(repository.create).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalledWith(mockUser);
    });

    it('should throw ConflictException when user already exists', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findByEmail', () => {
    it('should return user when valid email provided', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockUser);

      // Act
      const result = await service.findByEmail('test@example.com');

      // Assert
      expect(result).toBe(mockUser);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null when user not found', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findByEmail('nonexistent@example.com');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should return user when valid ID provided', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockUser);

      // Act
      const result = await service.findById('123e4567-e89b-12d3-a456-426614174000');

      // Assert
      expect(result).toBe(mockUser);
    });

    it('should return null when user not found', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act
      const result = await service.findById('nonexistent-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return user response DTO when user exists', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockUser);

      // Act
      const result = await service.findOne('123e4567-e89b-12d3-a456-426614174000');

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should throw NotFoundException when user not found', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp when valid user ID provided', async () => {
      // Arrange
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      // Act
      await service.updateLastLogin('123e4567-e89b-12d3-a456-426614174000');

      // Assert
      expect(repository.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', {
        lastLoginAt: expect.any(Date),
      });
    });

    it('should not throw error when update fails', async () => {
      // Arrange
      repository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert - should not throw
      await expect(
        service.updateLastLogin('123e4567-e89b-12d3-a456-426614174000'),
      ).resolves.toBeUndefined();
    });
  });

  describe('markEmailAsVerified', () => {
    it('should mark email as verified with current timestamp', async () => {
      // Arrange
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      // Act
      await service.markEmailAsVerified('123e4567-e89b-12d3-a456-426614174000');

      // Assert
      expect(repository.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', {
        emailVerifiedAt: expect.any(Date),
      });
    });

    it('should not throw error when update fails', async () => {
      // Arrange
      repository.update.mockRejectedValue(new Error('Database error'));

      // Act & Assert - should not throw
      await expect(
        service.markEmailAsVerified('123e4567-e89b-12d3-a456-426614174000'),
      ).resolves.toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      // Arrange
      const updateDto = {
        firstName: 'Jane',
        lastName: 'Smith',
      };
      const updatedUser = {
        ...mockUser,
        firstName: 'Jane',
        lastName: 'Smith',
      } as User;

      repository.findOne.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(updatedUser);
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      // Act
      const result = await service.update('123e4567-e89b-12d3-a456-426614174000', updateDto);

      // Assert
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
      expect(repository.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.update('nonexistent-id', { firstName: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle dateOfBirth conversion', async () => {
      // Arrange
      const updateDto = {
        dateOfBirth: '1995-05-15',
      };
      const updatedUser = {
        ...mockUser,
        dateOfBirth: new Date('1995-05-15'),
      } as User;

      repository.findOne.mockResolvedValueOnce(mockUser).mockResolvedValueOnce(updatedUser);
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      // Act
      const result = await service.update('123e4567-e89b-12d3-a456-426614174000', updateDto);

      // Assert
      expect(result).toBeDefined();
      expect(repository.update).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.objectContaining({
          dateOfBirth: expect.any(Date),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should soft delete user by setting isActive to false', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(mockUser);
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      // Act
      await service.remove('123e4567-e89b-12d3-a456-426614174000');

      // Assert
      expect(repository.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', {
        isActive: false,
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.remove('nonexistent-id')).rejects.toThrow(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('should activate user by setting isActive to true', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false } as User;
      const activatedUser = { ...mockUser, isActive: true } as User;

      repository.findOne.mockResolvedValueOnce(inactiveUser).mockResolvedValueOnce(activatedUser);
      repository.update.mockResolvedValue({ affected: 1, raw: {}, generatedMaps: [] });

      // Act
      const result = await service.activate('123e4567-e89b-12d3-a456-426614174000');

      // Assert
      expect(result.isActive).toBe(true);
      expect(repository.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', {
        isActive: true,
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      // Arrange
      repository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.activate('nonexistent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users with default parameters', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>,
      );

      // Act
      const result = await service.findAll({ page: 1, limit: 10 });

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNext).toBe(false);
      expect(result.meta.hasPrev).toBe(false);
    });

    it('should apply search filter', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>,
      );

      // Act
      await service.findAll({ page: 1, limit: 10, search: 'john' });

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('user.firstName ILIKE :search'),
        expect.objectContaining({ search: '%john%' }),
      );
    });

    it('should filter by active status', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>,
      );

      // Act
      await service.findAll({ page: 1, limit: 10, status: 'active' });

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should filter by inactive status', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>,
      );

      // Act
      await service.findAll({ page: 1, limit: 10, status: 'inactive' });

      // Assert
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', {
        isActive: false,
      });
    });

    it('should apply custom sorting', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>,
      );

      // Act
      await service.findAll({ page: 1, limit: 10, sortBy: 'firstName', sortOrder: 'ASC' });

      // Assert
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('user.firstName', 'ASC');
    });

    it('should calculate pagination metadata correctly', async () => {
      // Arrange
      const mockQueryBuilder = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(25),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      repository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as unknown as ReturnType<typeof repository.createQueryBuilder>,
      );

      // Act
      const result = await service.findAll({ page: 2, limit: 10 });

      // Assert
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNext).toBe(true);
      expect(result.meta.hasPrev).toBe(true);
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });
  });
});
