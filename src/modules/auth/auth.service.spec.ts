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
  });
});
