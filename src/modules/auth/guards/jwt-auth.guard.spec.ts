import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      getAllAndMerge: jest.fn(),
    };

    reflector = mockReflector as jest.Mocked<Reflector>;
    guard = new JwtAuthGuard(reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate - Public Routes', () => {
    let mockExecutionContext: ExecutionContext;

    beforeEach(() => {
      const mockHandler = jest.fn();
      const mockClass = jest.fn();

      mockExecutionContext = {
        getHandler: jest.fn().mockReturnValue(mockHandler),
        getClass: jest.fn().mockReturnValue(mockClass),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({}),
          getResponse: jest.fn().mockReturnValue({}),
          getNext: jest.fn(),
        }),
        getType: jest.fn().mockReturnValue('http'),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
      } as unknown as ExecutionContext;
    });

    it('should return true when route is marked as public', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
        mockExecutionContext.getHandler(),
        mockExecutionContext.getClass(),
      ]);
      expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
    });

    it('should call getAllAndOverride with correct parameters', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      guard.canActivate(mockExecutionContext);

      // Assert
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
        mockExecutionContext.getHandler(),
        mockExecutionContext.getClass(),
      ]);
      expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
    });

    it('should return true when isPublic metadata is true', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
    });

    it('should bypass authentication when isPublic is true', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
      // Verify reflector was called (checking for public metadata)
      expect(reflector.getAllAndOverride).toHaveBeenCalled();
    });

    it('should check handler before class metadata', () => {
      // Arrange
      const mockHandler = jest.fn();
      const mockClass = jest.fn();
      mockExecutionContext.getHandler = jest.fn().mockReturnValue(mockHandler);
      mockExecutionContext.getClass = jest.fn().mockReturnValue(mockClass);
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      guard.canActivate(mockExecutionContext);

      // Assert
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
        mockHandler,
        mockClass,
      ]);
    });
  });

  describe('Metadata Key', () => {
    it('should use "isPublic" as the metadata key', () => {
      // Arrange
      const mockHandler = jest.fn();
      const mockClass = jest.fn();
      const mockContext = {
        getHandler: jest.fn().mockReturnValue(mockHandler),
        getClass: jest.fn().mockReturnValue(mockClass),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue({}),
          getResponse: jest.fn().mockReturnValue({}),
          getNext: jest.fn(),
        }),
        getType: jest.fn().mockReturnValue('http'),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
      } as unknown as ExecutionContext;

      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      guard.canActivate(mockContext);

      // Assert
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', expect.any(Array));
    });
  });
});
