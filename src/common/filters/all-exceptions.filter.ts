import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { WinstonLoggerService } from '../utils/winston-logger.service';

export interface HttpExceptionResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  success: boolean;
  timestamp: string;
  path: string;
  method: string;
  correlationId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: WinstonLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string; user?: { id: string } }>();

    let status: HttpStatus;
    let errorMessage: string | string[];
    let shouldExposeDetails = false;

    // Determine if we should expose error details (only in non-production)
    const environment = process.env['NODE_ENV'] || 'development';
    shouldExposeDetails = environment !== 'production';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();

      if (typeof errorResponse === 'object' && errorResponse !== null) {
        const responseObj = errorResponse as Record<string, unknown>;
        errorMessage = (responseObj['message'] as string | string[]) || exception.message;
      } else {
        errorMessage = (errorResponse as string) || exception.message;
      }
    } else if (exception instanceof QueryFailedError) {
      status = HttpStatus.BAD_REQUEST;
      errorMessage = this.handleDatabaseError(exception);

      // Log detailed database error for debugging
      this.logger.error('Database query failed', exception.stack, 'DatabaseError', {
        query: exception.query,
        parameters: exception.parameters,
        correlationId: request.correlationId,
        userId: request.user?.id,
        method: request.method,
        url: request.url,
      });
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorMessage = shouldExposeDetails ? exception.message : 'Internal server error';

      // Log generic error with full details
      this.logger.error('Unhandled error', exception.stack, 'GenericError', {
        errorName: exception.name,
        correlationId: request.correlationId,
        userId: request.user?.id,
        method: request.method,
        url: request.url,
      });
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorMessage = 'Internal server error';

      // Log unknown error type
      this.logger.error('Unknown error type', String(exception), 'UnknownError', {
        correlationId: request.correlationId,
        userId: request.user?.id,
        method: request.method,
        url: request.url,
        exceptionType: typeof exception,
      });
    }

    const errorResponse: HttpExceptionResponse = {
      statusCode: status,
      message: errorMessage,
      error: HttpStatus[status],
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      correlationId: request.correlationId,
    };

    // Remove correlationId from response in production if not set
    if (environment === 'production' && !request.correlationId) {
      delete errorResponse.correlationId;
    }

    // Log the error response
    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
      'HTTP',
      {
        statusCode: status,
        correlationId: request.correlationId,
        userId: request.user?.id,
        errorType: exception instanceof Error ? exception.constructor.name : 'Unknown',
        timestamp: errorResponse.timestamp,
      },
    );

    response.status(status).json(errorResponse);
  }

  private handleDatabaseError(error: QueryFailedError): string {
    const message = (error.message ?? '').toLowerCase();

    // PostgreSQL specific error handling
    if (message.includes('duplicate key value')) {
      return 'Resource already exists';
    }

    if (message.includes('violates foreign key constraint')) {
      return 'Referenced resource does not exist';
    }

    if (message.includes('violates not-null constraint')) {
      return 'Required field is missing';
    }

    if (message.includes('violates check constraint')) {
      return 'Invalid data provided';
    }

    if (message.includes('connection') || message.includes('timeout')) {
      return 'Database connection error';
    }

    if (message.includes('syntax error')) {
      return 'Invalid query format';
    }

    // Log the original error for debugging but return generic message
    this.logger.warn('Unhandled database error pattern', 'DatabaseError', {
      originalMessage: error.message,
      driverError: error.driverError,
    });

    return 'Database operation failed';
  }
}
