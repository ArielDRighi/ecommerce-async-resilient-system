import { Logger } from '@nestjs/common';

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxAttempts: number;

  /** Initial delay in milliseconds */
  initialDelayMs: number;

  /** Maximum delay in milliseconds */
  maxDelayMs: number;

  /** Backoff multiplier (2 = exponential) */
  backoffMultiplier: number;

  /** Maximum jitter in milliseconds to add randomness */
  jitterMs?: number;

  /** Function to determine if error is retriable */
  isRetriable?: (error: unknown) => boolean;

  /** Logger name */
  operation?: string;
}

export interface RetryResult<T> {
  /** Whether operation succeeded */
  success: boolean;

  /** Result data if successful */
  data?: T;

  /** Error if failed */
  error?: unknown;

  /** Number of attempts made */
  attempts: number;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Whether max attempts were exceeded */
  maxAttemptsExceeded: boolean;
}

/**
 * Retry utility with exponential backoff and jitter
 * Implements retry pattern for transient failures
 */
export class RetryUtil {
  private static readonly logger = new Logger('RetryUtil');

  /**
   * Execute function with retry logic
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions,
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    let lastError: unknown;
    let attempts = 0;

    const logger = options.operation ? new Logger(`RetryUtil:${options.operation}`) : this.logger;

    for (let i = 0; i < options.maxAttempts; i++) {
      attempts++;

      try {
        logger.debug(`Attempt ${attempts}/${options.maxAttempts}`);
        const result = await fn();

        const durationMs = Date.now() - startTime;
        logger.log(
          `Operation succeeded on attempt ${attempts}/${options.maxAttempts} after ${durationMs}ms`,
        );

        return {
          success: true,
          data: result,
          attempts,
          durationMs,
          maxAttemptsExceeded: false,
        };
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);

        logger.warn(`Attempt ${attempts}/${options.maxAttempts} failed: ${errorMessage}`);

        // Check if error is retriable
        if (options.isRetriable && !options.isRetriable(error)) {
          logger.error('Error is not retriable. Aborting retry attempts.');
          break;
        }

        // If not last attempt, wait before retrying
        if (i < options.maxAttempts - 1) {
          const delay = this.calculateDelay(i, options);
          logger.debug(`Waiting ${delay}ms before next attempt`);
          await this.sleep(delay);
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const maxAttemptsExceeded = attempts >= options.maxAttempts;

    logger.error(
      `Operation failed after ${attempts} attempts and ${durationMs}ms. Max attempts exceeded: ${maxAttemptsExceeded}`,
    );

    return {
      success: false,
      error: lastError,
      attempts,
      durationMs,
      maxAttemptsExceeded,
    };
  }

  /**
   * Calculate delay for next retry with exponential backoff and jitter
   */
  private static calculateDelay(attemptNumber: number, options: RetryOptions): number {
    // Exponential backoff: delay = initialDelay * (multiplier ^ attemptNumber)
    const exponentialDelay =
      options.initialDelayMs * Math.pow(options.backoffMultiplier, attemptNumber);

    // Cap at max delay
    let delay = Math.min(exponentialDelay, options.maxDelayMs);

    // Add jitter to prevent thundering herd
    if (options.jitterMs && options.jitterMs > 0) {
      const jitter = Math.random() * options.jitterMs;
      delay += jitter;
    }

    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a default retry configuration
   */
  static createDefaultOptions(operation?: string): RetryOptions {
    return {
      maxAttempts: 3,
      initialDelayMs: 1000, // 1 second
      maxDelayMs: 30000, // 30 seconds
      backoffMultiplier: 2, // Exponential
      jitterMs: 200, // 200ms jitter
      operation,
    };
  }

  /**
   * Create retry options for aggressive retry (short delays, many attempts)
   */
  static createAggressiveOptions(operation?: string): RetryOptions {
    return {
      maxAttempts: 5,
      initialDelayMs: 500, // 500ms
      maxDelayMs: 10000, // 10 seconds
      backoffMultiplier: 1.5,
      jitterMs: 100,
      operation,
    };
  }

  /**
   * Create retry options for conservative retry (long delays, few attempts)
   */
  static createConservativeOptions(operation?: string): RetryOptions {
    return {
      maxAttempts: 2,
      initialDelayMs: 5000, // 5 seconds
      maxDelayMs: 60000, // 1 minute
      backoffMultiplier: 2,
      jitterMs: 500,
      operation,
    };
  }

  /**
   * Default retriable error checker
   * Returns true for network errors, timeouts, and 5xx status codes
   */
  static isDefaultRetriable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('econnreset') ||
        message.includes('enetunreach') ||
        message.includes('ehostunreach')
      ) {
        return true;
      }

      // Check for HTTP status codes (if error has status property)
      const errorWithStatus = error as { status?: number; statusCode?: number };
      if (errorWithStatus.status || errorWithStatus.statusCode) {
        const status = errorWithStatus.status ?? errorWithStatus.statusCode;
        // Retry on 5xx server errors and 429 Too Many Requests
        return status !== undefined && (status >= 500 || status === 429);
      }
    }

    return false;
  }
}
