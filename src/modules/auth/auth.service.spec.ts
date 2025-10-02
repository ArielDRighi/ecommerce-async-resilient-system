import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { RegisterDto, LoginDto } from './dto';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
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
    emailVerifiedAt: undefined,
    lastLoginAt: undefined,
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
      findByEmail: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateLastLogin: jest.fn(),
    };

    const mockJwtService = {
      signAsync: jest.fn(),
      verify: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);

    // Setup default config values
    configService.get.mockImplementation((key: string) => {
      const config: Record<string, string> = {
        JWT_SECRET: 'test-secret',
        JWT_EXPIRES_IN: '1h',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
      };
      return config[key];
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'StrongPassword123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should register new user and return tokens when valid data provided', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      usersService.updateLastLogin.mockResolvedValue(undefined);
      jwtService.signAsync.mockResolvedValue('mock-access-token');

      // Act
      const result = await service.register(registerDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-access-token');
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.id).toBe(mockUser.id);
      expect(usersService.findByEmail).toHaveBeenCalledWith(registerDto.email);
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
        }),
      );
    });

    it('should throw ConflictException when user email already exists', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('should accept email as provided and process registration', async () => {
      // Arrange
      const emailWithUpperCase = { ...registerDto, email: 'Test@Example.COM' };
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('mock-token');

      // Act
      await service.register(emailWithUpperCase);

      // Assert
      expect(usersService.findByEmail).toHaveBeenCalledWith(emailWithUpperCase.email);
      expect(usersService.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'StrongPassword123!',
    };

    it('should return tokens and user when valid credentials provided', async () => {
      // Arrange
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.updateLastLogin.mockResolvedValue(undefined);
      jwtService.signAsync.mockResolvedValue('mock-access-token');

      // Act
      const result = await service.login(loginDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-access-token');
      expect(result.user.email).toBe(mockUser.email);
      expect(result.user.id).toBe(mockUser.id);
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.updateLastLogin).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user account is inactive', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false };
      usersService.findByEmail.mockResolvedValue(inactiveUser as User);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.updateLastLogin).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when password is incorrect', async () => {
      // Arrange
      mockUser.validatePassword = jest.fn().mockResolvedValue(false);
      usersService.findByEmail.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      expect(usersService.updateLastLogin).not.toHaveBeenCalled();
    });

    it('should update last login timestamp on successful login', async () => {
      // Arrange
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue(mockUser);
      usersService.updateLastLogin.mockResolvedValue(undefined);
      jwtService.signAsync.mockResolvedValue('mock-token');

      // Act
      await service.login(loginDto);

      // Assert
      expect(usersService.updateLastLogin).toHaveBeenCalledTimes(1);
      expect(usersService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      // Arrange
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue(mockUser);

      // Act
      const result = await service.validateUser('test@example.com', 'ValidPassword123!');

      // Assert
      expect(result).toBe(mockUser);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.id).toBe(mockUser.id);
        expect(result.email).toBe(mockUser.email);
      }
    });

    it('should return null when user does not exist', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(null);

      // Act
      const result = await service.validateUser('nonexistent@example.com', 'password');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when password is incorrect', async () => {
      // Arrange
      mockUser.validatePassword = jest.fn().mockResolvedValue(false);
      usersService.findByEmail.mockResolvedValue(mockUser);

      // Act
      const result = await service.validateUser('test@example.com', 'WrongPassword123!');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when user is inactive', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false };
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue(inactiveUser as User);

      // Act
      const result = await service.validateUser('test@example.com', 'ValidPassword123!');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when validation throws error', async () => {
      // Arrange
      usersService.findByEmail.mockRejectedValue(new Error('Database error'));

      // Act
      const result = await service.validateUser('test@example.com', 'password');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('refreshToken', () => {
    const validRefreshToken = 'valid-refresh-token';
    const mockRefreshPayload = {
      sub: mockUser.id,
      email: mockUser.email,
      firstName: mockUser.firstName,
      lastName: mockUser.lastName,
      type: 'refresh' as const,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
    };

    it('should return new tokens when valid refresh token provided', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockRefreshPayload);
      usersService.findById.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('new-token');

      // Act
      const result = await service.refreshToken({ refreshToken: validRefreshToken });

      // Assert
      expect(result).toBeDefined();
      expect(result.accessToken).toBe('new-token');
      expect(result.refreshToken).toBe('new-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.user.id).toBe(mockUser.id);
      expect(jwtService.verify).toHaveBeenCalledWith(validRefreshToken, {
        secret: 'your-refresh-secret-key',
      });
    });

    it('should throw UnauthorizedException when token type is not refresh', async () => {
      // Arrange
      const accessPayload = { ...mockRefreshPayload, type: 'access' as const };
      jwtService.verify.mockReturnValue(accessPayload);

      // Act & Assert
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        'Invalid token type',
      );
      expect(usersService.findById).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when user not found', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockRefreshPayload);
      usersService.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        'User not found',
      );
    });

    it('should throw UnauthorizedException when user account is disabled', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false };
      jwtService.verify.mockReturnValue(mockRefreshPayload);
      usersService.findById.mockResolvedValue(inactiveUser as User);

      // Act & Assert
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        'Account is disabled',
      );
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('TokenExpiredError');
      });

      // Act & Assert
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.refreshToken({ refreshToken: validRefreshToken })).rejects.toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      // Arrange
      jwtService.verify.mockImplementation(() => {
        throw new Error('JsonWebTokenError');
      });

      // Act & Assert
      await expect(service.refreshToken({ refreshToken: 'invalid-token' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should generate new access and refresh tokens on successful refresh', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockRefreshPayload);
      usersService.findById.mockResolvedValue(mockUser);
      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      // Act
      const result = await service.refreshToken({ refreshToken: validRefreshToken });

      // Assert
      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          type: 'access',
        }),
        expect.objectContaining({
          secret: 'your-secret-key',
          expiresIn: '1h',
        }),
      );
    });

    it('should verify refresh token with correct secret', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockRefreshPayload);
      usersService.findById.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('new-token');

      // Act
      await service.refreshToken({ refreshToken: validRefreshToken });

      // Assert
      expect(jwtService.verify).toHaveBeenCalledWith(validRefreshToken, {
        secret: 'your-refresh-secret-key',
      });
    });

    it('should include all user fields in response when token refreshed', async () => {
      // Arrange
      jwtService.verify.mockReturnValue(mockRefreshPayload);
      usersService.findById.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('new-token');

      // Act
      const result = await service.refreshToken({ refreshToken: validRefreshToken });

      // Assert
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('firstName');
      expect(result.user).toHaveProperty('lastName');
      expect(result.user).toHaveProperty('fullName');
      expect(result.user).toHaveProperty('isActive');
      expect(result.user).toHaveProperty('createdAt');
    });
  });

  describe('Token Generation and Sanitization', () => {
    it('should generate tokens with correct expiration time', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('token');

      // Act
      const result = await service.register({
        email: 'new@example.com',
        password: 'Pass123!',
        firstName: 'New',
        lastName: 'User',
      });

      // Assert
      expect(result.expiresIn).toBe(3600); // 1 hour in seconds
      expect(result.tokenType).toBe('Bearer');
    });

    it('should sanitize user data and not include sensitive information', async () => {
      // Arrange
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      usersService.findByEmail.mockResolvedValue(mockUser);
      jwtService.signAsync.mockResolvedValue('token');

      // Act
      const result = await service.login({
        email: 'test@example.com',
        password: 'Pass123!',
      });

      // Assert
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('orders');
      expect(result.user).not.toHaveProperty('validatePassword');
      expect(result.user).toHaveProperty('fullName');
    });

    it('should handle null emailVerifiedAt when sanitizing user', async () => {
      // Arrange
      const userWithNullFields: User = {
        ...mockUser,
        emailVerifiedAt: undefined,
        validatePassword: jest.fn().mockResolvedValue(true),
      } as unknown as User;
      
      usersService.findByEmail.mockResolvedValue(userWithNullFields);
      usersService.updateLastLogin.mockResolvedValue(undefined);
      jwtService.signAsync.mockResolvedValue('token');

      // Act
      const result = await service.login({
        email: 'test@example.com',
        password: 'Pass123!',
      });

      // Assert
      expect(result.user.emailVerifiedAt).toBeNull();
      expect(result.user).toHaveProperty('createdAt');
    });
  });

  describe('Error Handling', () => {
    it('should throw BadRequestException when registration fails with database error', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Pass123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow('Registration failed. Please try again.');
    });

    it('should throw BadRequestException when login fails with unexpected error', async () => {
      // Arrange
      usersService.findByEmail.mockRejectedValue(new Error('Unexpected error'));

      // Act & Assert
      await expect(
        service.login({
          email: 'test@example.com',
          password: 'Pass123!',
        }),
      ).rejects.toThrow('Login failed. Please try again.');
    });

    it('should preserve ConflictException when user already exists', async () => {
      // Arrange
      usersService.findByEmail.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(
        service.register({
          email: 'test@example.com',
          password: 'Pass123!',
          firstName: 'John',
          lastName: 'Doe',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
