/**
 * Mock data generators and factories for testing
 */

/**
 * Generate a unique test email with timestamp
 */
export function generateTestEmail(prefix = 'test'): string {
  const timestamp = Date.now();
  return `${prefix}-${timestamp}@test.com`;
}

/**
 * Generate a unique test SKU
 */
export function generateTestSKU(prefix = 'TEST'): string {
  const timestamp = Date.now();
  return `${prefix}-${timestamp}`;
}

/**
 * Generate a unique test name
 */
export function generateTestName(prefix = 'Test'): string {
  const timestamp = Date.now();
  return `${prefix} ${timestamp}`;
}

/**
 * Mock user data
 */
export const mockUser = {
  email: 'mock@test.com',
  password: 'Test123!',
  firstName: 'Mock',
  lastName: 'User',
};

/**
 * Mock product data
 */
export const mockProduct = {
  name: 'Mock Product',
  description: 'Mock product description',
  price: 99.99,
  sku: 'MOCK-001',
  category: 'Electronics',
  brand: 'MockBrand',
  weight: 1.5,
  costPrice: 50.0,
  compareAtPrice: 119.99,
  trackInventory: true,
  minimumStock: 10,
};

/**
 * Mock order item data
 */
export const mockOrderItem = {
  productId: '00000000-0000-0000-0000-000000000000',
  quantity: 2,
};

/**
 * Mock category data
 */
export const mockCategory = {
  name: 'Mock Category',
  description: 'Mock category description',
  slug: 'mock-category',
};
