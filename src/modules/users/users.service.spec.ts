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
  });
});
