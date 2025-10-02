import { User } from '../../src/modules/users/entities/user.entity';
import { Product } from '../../src/modules/products/entities/product.entity';
import { Order } from '../../src/modules/orders/entities/order.entity';
import { OrderItem } from '../../src/modules/orders/entities/order-item.entity';
import { Inventory } from '../../src/modules/inventory/entities/inventory.entity';
import { OrderStatus } from '../../src/modules/orders/enums/order-status.enum';

/**
 * Mock Data for Tests
 * Standardized test data that can be reused across tests
 */

// ============================================================================
// USER MOCK DATA
// ============================================================================

export const mockUser: Partial<User> = {
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
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockAdminUser: Partial<User> = {
  id: '223e4567-e89b-12d3-a456-426614174000',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  passwordHash: '$2b$10$hashedadminpassword',
  isActive: true,
  phoneNumber: '+1234567891',
  language: 'en',
  timezone: 'UTC',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ============================================================================
// PRODUCT MOCK DATA
// ============================================================================

export const mockProduct: Partial<Product> = {
  id: '323e4567-e89b-12d3-a456-426614174000',
  name: 'Test Product',
  description: 'A great test product',
  price: 99.99,
  sku: 'TEST-001',
  isActive: true,
  brand: 'TestBrand',
  weight: 1.5,
  attributes: { color: 'blue', size: 'M' },
  images: ['https://example.com/image1.jpg'],
  tags: ['test', 'product'],
  costPrice: 50.0,
  compareAtPrice: 149.99,
  trackInventory: true,
  minimumStock: 5,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockProductWithoutInventory: Partial<Product> = {
  id: '423e4567-e89b-12d3-a456-426614174000',
  name: 'Digital Product',
  description: 'A digital product that doesnt need inventory',
  price: 29.99,
  sku: 'DIGITAL-001',
  isActive: true,
  brand: 'DigitalBrand',
  weight: 0,
  attributes: {},
  images: ['https://example.com/digital.jpg'],
  tags: ['digital'],
  trackInventory: false,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// ============================================================================
// INVENTORY MOCK DATA
// ============================================================================

export const mockInventory: Partial<Inventory> = {
  id: '523e4567-e89b-12d3-a456-426614174000',
  productId: mockProduct.id,
  sku: mockProduct.sku,
  location: 'MAIN_WAREHOUSE',
  currentStock: 100,
  reservedStock: 0,
  minimumStock: 5,
  updatedAt: new Date('2024-01-01'),
};

export const mockLowStockInventory: Partial<Inventory> = {
  id: '623e4567-e89b-12d3-a456-426614174000',
  productId: mockProduct.id,
  sku: mockProduct.sku,
  location: 'MAIN_WAREHOUSE',
  currentStock: 3,
  reservedStock: 0,
  minimumStock: 5,
  updatedAt: new Date('2024-01-01'),
};

// ============================================================================
// ORDER MOCK DATA
// ============================================================================

export const mockOrderItem: Partial<OrderItem> = {
  id: '723e4567-e89b-12d3-a456-426614174000',
  productId: mockProduct.id,
  quantity: 2,
  unitPrice: 99.99,
  totalPrice: 199.98,
};

export const mockOrder: Partial<Order> = {
  id: '823e4567-e89b-12d3-a456-426614174000',
  userId: mockUser.id,
  status: OrderStatus.PENDING,
  totalAmount: 199.98,
  currency: 'USD',
  idempotencyKey: 'test-idempotency-key-001',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockCompletedOrder: Partial<Order> = {
  id: '923e4567-e89b-12d3-a456-426614174000',
  userId: mockUser.id,
  status: OrderStatus.CONFIRMED,
  totalAmount: 199.98,
  currency: 'USD',
  paymentId: 'payment-123',
  processingStartedAt: new Date('2024-01-01T10:00:00'),
  completedAt: new Date('2024-01-01T10:05:00'),
  createdAt: new Date('2024-01-01T10:00:00'),
  updatedAt: new Date('2024-01-01T10:05:00'),
};

// ============================================================================
// PAYMENT MOCK DATA
// ============================================================================

export const mockPaymentRequest = {
  orderId: mockOrder.id,
  amount: 199.98,
  currency: 'USD',
  paymentMethod: 'credit_card',
};

export const mockPaymentResponse = {
  paymentId: 'payment-123',
  status: 'succeeded',
  transactionId: 'txn-123',
  amount: 199.98,
  currency: 'USD',
};

// ============================================================================
// EVENT MOCK DATA
// ============================================================================

export const mockOrderCreatedEvent = {
  aggregateId: mockOrder.id,
  aggregateType: 'Order',
  eventType: 'OrderCreated',
  eventData: {
    orderId: mockOrder.id,
    userId: mockUser.id,
    items: [mockOrderItem],
    totalAmount: 199.98,
    currency: 'USD',
  },
};

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate a unique email for testing
 */
export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate a unique SKU for testing
 */
export function generateTestSKU(): string {
  return `TEST-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;
}

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey(): string {
  return `idem-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Create a test user with optional overrides
 */
export function createTestUser(overrides: Partial<User> = {}): Partial<User> {
  return {
    ...mockUser,
    email: generateTestEmail(),
    ...overrides,
  };
}

/**
 * Create a test product with optional overrides
 */
export function createTestProduct(overrides: Partial<Product> = {}): Partial<Product> {
  return {
    ...mockProduct,
    sku: generateTestSKU(),
    ...overrides,
  };
}

/**
 * Create a test order with optional overrides
 */
export function createTestOrder(overrides: Partial<Order> = {}): Partial<Order> {
  return {
    ...mockOrder,
    idempotencyKey: generateIdempotencyKey(),
    ...overrides,
  };
}

/**
 * Create a test order item with optional overrides
 */
export function createTestOrderItem(overrides: Partial<OrderItem> = {}): Partial<OrderItem> {
  return {
    ...mockOrderItem,
    ...overrides,
  };
}

/**
 * Create test inventory with optional overrides
 */
export function createTestInventory(overrides: Partial<Inventory> = {}): Partial<Inventory> {
  return {
    ...mockInventory,
    ...overrides,
  };
}
