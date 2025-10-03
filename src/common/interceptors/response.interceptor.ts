import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';

export interface ResponseFormat<T> {
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
  success: boolean;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseFormat<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseFormat<T>> {
    const request = context.switchToHttp().getRequest();
    const statusCode = context.switchToHttp().getResponse().statusCode;

    return next.handle().pipe(
      timeout(30000), // 30 seconds timeout
      map((data) => ({
        statusCode,
        message: this.getSuccessMessage(statusCode),
        data,
        timestamp: new Date().toISOString(),
        path: request.url,
        success: statusCode >= 200 && statusCode < 300,
      })),
      catchError((error) => {
        // Handle timeout errors
        if (error.name === 'TimeoutError') {
          return throwError(
            () =>
              new HttpException(
                'Request timeout - operation took too long to complete',
                HttpStatus.REQUEST_TIMEOUT,
              ),
          );
        }
        return throwError(() => error);
      }),
    );
  }

  private getSuccessMessage(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.OK:
        return 'Success';
      case HttpStatus.CREATED:
        return 'Created successfully';
      case HttpStatus.ACCEPTED:
        return 'Accepted';
      case HttpStatus.NO_CONTENT:
        return 'No content';
      default:
        return 'Success';
    }
  }
}
