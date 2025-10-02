import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshTokenDto, AuthResponseDto } from './dto';
import { User } from '../users/entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

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

  const mockAuthResponse: AuthResponseDto = {
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 3600,
    user: {
      id: mockUser.id,
      email: mockUser.email,
      firstName: mockUser.firstName,
      lastName: mockUser.lastName,
      fullName: mockUser.fullName,
      isActive: mockUser.isActive,
      emailVerifiedAt: mockUser.emailVerifiedAt || null,
      createdAt: mockUser.createdAt,
    },
  };

  beforeEach(async () => {
    const mockAuthService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      validateUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      password: 'StrongPassword123!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should register new user and return auth response when valid data provided', async () => {
      // Arrange
      authService.register.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.register(registerDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.accessToken).toBe(mockAuthResponse.accessToken);
      expect(result.refreshToken).toBe(mockAuthResponse.refreshToken);
      expect(result.user.email).toBe(registerDto.email);
      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(authService.register).toHaveBeenCalledTimes(1);
    });

    it('should call authService.register with correct parameters when registration attempted', async () => {
      // Arrange
      authService.register.mockResolvedValue(mockAuthResponse);

      // Act
      await controller.register(registerDto);

      // Assert
      expect(authService.register).toHaveBeenCalledWith(
        expect.objectContaining({
          email: registerDto.email,
          password: registerDto.password,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
        }),
      );
    });

    it('should propagate errors when authService.register throws exception', async () => {
      // Arrange
      const error = new Error('Registration failed');
      authService.register.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.register(registerDto)).rejects.toThrow('Registration failed');
      expect(authService.register).toHaveBeenCalledWith(registerDto);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      email: 'test@example.com',
      password: 'StrongPassword123!',
    };

    it('should login user and return auth response when valid credentials provided', async () => {
      // Arrange
      authService.login.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.login(loginDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.accessToken).toBe(mockAuthResponse.accessToken);
      expect(result.refreshToken).toBe(mockAuthResponse.refreshToken);
      expect(result.user.email).toBe(mockUser.email);
      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(authService.login).toHaveBeenCalledTimes(1);
    });

    it('should call authService.login with correct parameters when login attempted', async () => {
      // Arrange
      authService.login.mockResolvedValue(mockAuthResponse);

      // Act
      await controller.login(loginDto);

      // Assert
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({
          email: loginDto.email,
          password: loginDto.password,
        }),
      );
    });

    it('should propagate errors when authService.login throws exception', async () => {
      // Arrange
      const error = new Error('Invalid credentials');
      authService.login.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.login(loginDto)).rejects.toThrow('Invalid credentials');
      expect(authService.login).toHaveBeenCalledWith(loginDto);
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto: RefreshTokenDto = {
      refreshToken: 'valid-refresh-token',
    };

    it('should return new tokens when valid refresh token provided', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResponse);

      // Act
      const result = await controller.refreshToken(refreshTokenDto);

      // Assert
      expect(result).toBeDefined();
      expect(result.accessToken).toBe(mockAuthResponse.accessToken);
      expect(result.refreshToken).toBe(mockAuthResponse.refreshToken);
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshTokenDto);
      expect(authService.refreshToken).toHaveBeenCalledTimes(1);
    });

    it('should call authService.refreshToken with correct parameters when refresh attempted', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue(mockAuthResponse);

      // Act
      await controller.refreshToken(refreshTokenDto);

      // Assert
      expect(authService.refreshToken).toHaveBeenCalledWith(
        expect.objectContaining({
          refreshToken: refreshTokenDto.refreshToken,
        }),
      );
    });

    it('should propagate errors when authService.refreshToken throws exception', async () => {
      // Arrange
      const error = new Error('Invalid refresh token');
      authService.refreshToken.mockRejectedValue(error);

      // Act & Assert
      await expect(controller.refreshToken(refreshTokenDto)).rejects.toThrow(
        'Invalid refresh token',
      );
      expect(authService.refreshToken).toHaveBeenCalledWith(refreshTokenDto);
    });
  });

  describe('getProfile', () => {
    it('should return user profile when authenticated user requests profile', async () => {
      // Arrange
      // (no service mock needed - direct user transformation)

      // Act
      const result = await controller.getProfile(mockUser);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.firstName).toBe(mockUser.firstName);
      expect(result.lastName).toBe(mockUser.lastName);
      expect(result.fullName).toBe(mockUser.fullName);
      expect(result.phoneNumber).toBe(mockUser.phoneNumber);
      expect(result.dateOfBirth).toBe(mockUser.dateOfBirth);
      expect(result.language).toBe(mockUser.language);
      expect(result.timezone).toBe(mockUser.timezone);
      expect(result.isActive).toBe(mockUser.isActive);
    });

    it('should include all user fields when profile requested', async () => {
      // Arrange
      // (no service mock needed)

      // Act
      const result = await controller.getProfile(mockUser);

      // Assert
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('fullName');
      expect(result).toHaveProperty('phoneNumber');
      expect(result).toHaveProperty('dateOfBirth');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('timezone');
      expect(result).toHaveProperty('isActive');
      expect(result).toHaveProperty('emailVerifiedAt');
      expect(result).toHaveProperty('lastLoginAt');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
    });

    it('should not expose sensitive data when profile requested', async () => {
      // Arrange
      // (no service mock needed)

      // Act
      const result = await controller.getProfile(mockUser);

      // Assert
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('orders');
    });
  });

  describe('logout', () => {
    it('should return success message when authenticated user logs out', async () => {
      // Arrange
      // (no service mock needed - controller handles logout)

      // Act
      const result = await controller.logout(mockUser);

      // Assert
      expect(result).toBeDefined();
      expect(result.message).toBe('Successfully logged out. Please discard your tokens.');
      expect(result.success).toBe(true);
    });

    it('should always return success message regardless of user state when logout called', async () => {
      // Arrange
      const inactiveUser = { ...mockUser, isActive: false };

      // Act
      const result = await controller.logout(inactiveUser as User);

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully logged out');
    });
  });

  describe('getCurrentUser', () => {
    it('should return minimal user information when authenticated user requests it', async () => {
      // Arrange
      // (no service mock needed)

      // Act
      const result = await controller.getCurrentUser(mockUser);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.firstName).toBe(mockUser.firstName);
      expect(result.lastName).toBe(mockUser.lastName);
      expect(result.fullName).toBe(mockUser.fullName);
      expect(result.isActive).toBe(mockUser.isActive);
    });

    it('should return only essential fields when current user requested', async () => {
      // Arrange
      // (no service mock needed)

      // Act
      const result = await controller.getCurrentUser(mockUser);

      // Assert
      expect(Object.keys(result)).toHaveLength(6);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('firstName');
      expect(result).toHaveProperty('lastName');
      expect(result).toHaveProperty('fullName');
      expect(result).toHaveProperty('isActive');
      expect(result).not.toHaveProperty('phoneNumber');
      expect(result).not.toHaveProperty('dateOfBirth');
      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});
