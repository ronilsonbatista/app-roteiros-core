import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class LogSanitizerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    if (request && request.headers) {
      // Redact sensitive headers in request object to prevent logging leakage
      if (request.headers['x-guest-token']) {
        request.headers['x-guest-token'] = '[REDACTED]';
      }
      if (request.headers['authorization']) {
        request.headers['authorization'] = '[REDACTED]';
      }
    }

    return next.handle();
  }
}
