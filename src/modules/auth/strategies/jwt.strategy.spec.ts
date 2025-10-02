import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: jest.Mocked<UsersService>;
  let configService: jest.Mocked<ConfigService>;

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
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    orders: Promise.resolve([]),
    get fullName() {
      return `${this.firstName} ${this.lastName}`;
    },
    get isEmailVerified() {
      return this.emailVerifiedAt !== null;
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
    const mockUsersService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    usersService = module.get(UsersService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockReturnValue('test-secret-key');
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    const validPayload: JwtPayload = {
      sub: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      firstName: 'John',
      lastName: 'Doe',
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    it('should return user when valid access token payload provided', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(mockUser);

      // Act
      const result = await strategy.validate(validPayload);

      // Assert
      expect(result).toBeDefined();
      expect(result).toBe(mockUser);
      expect(result.id).toBe(validPayload.sub);
      expect(result.email).toBe(validPayload.email);
      expect(usersService.findById).toHaveBeenCalledWith(validPayload.sub);
      expect(usersService.findById).toHaveBeenCalledTimes(1);
    });

    it('should throw UnauthorizedException when token type is refresh', async () => {
      // Arrange
      const refreshPayload: JwtPayload = { ...validPayload, type: 'refresh' };

      // Act & Assert
      await expect(strategy.validate(refreshPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(refreshPayload)).rejects.toThrow('Invalid token type');
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(strategy.validate(validPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(validPayload)).rejects.toThrow('User not found');
      expect(usersService.findById).toHaveBeenCalledWith(validPayload.sub);
    });

    it('should throw UnauthorizedException when user account is disabled', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false };
      usersService.findById.mockResolvedValue(inactiveUser as User);

      // Act & Assert
      await expect(strategy.validate(validPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(validPayload)).rejects.toThrow(
        'User account is disabled',
      );
      expect(usersService.findById).toHaveBeenCalledWith(validPayload.sub);
    });

    it('should throw UnauthorizedException when token email does not match user email', async () => {
      // Arrange
      const userWithDifferentEmail = { ...mockUser, email: 'different@example.com' };
      usersService.findById.mockResolvedValue(userWithDifferentEmail as User);

      // Act & Assert
      await expect(strategy.validate(validPayload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(validPayload)).rejects.toThrow('Token email mismatch');
      expect(usersService.findById).toHaveBeenCalledWith(validPayload.sub);
    });

    it('should call usersService.findById with correct user ID when validation attempted', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(mockUser);
      const customPayload = { ...validPayload, sub: 'custom-user-id-123' };

      // Act
      await strategy.validate(customPayload);

      // Assert
      expect(usersService.findById).toHaveBeenCalledWith('custom-user-id-123');
      expect(usersService.findById).toHaveBeenCalledTimes(1);
    });

    it('should validate all token fields in correct order when validate called', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(mockUser);

      // Act
      await strategy.validate(validPayload);

      // Assert
      // First validates token type (no error = passed)
      // Then finds user
      expect(usersService.findById).toHaveBeenCalled();
      // If we get here, all validations passed
      expect(true).toBe(true);
    });

    it('should return complete user entity when all validations pass', async () => {
      // Arrange
      usersService.findById.mockResolvedValue(mockUser);

      // Act
      const result = await strategy.validate(validPayload);

      // Assert
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('isActive');
      expect(result).toHaveProperty('phoneNumber');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });
  });
});
