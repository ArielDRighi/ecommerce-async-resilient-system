/**
 * Setup after environment initialization
 * Runs for each test file
 */

// Polyfill for crypto in Node 18+ for @nestjs/schedule
import { webcrypto } from 'crypto';
if (!globalThis.crypto) {
  // @ts-expect-error - polyfill for Node 18 compatibility
  globalThis.crypto = webcrypto;
}

// Set default timeout for all tests
jest.setTimeout(30000);
