import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';

let sentryInitialized = false;

export function initApiSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (dsn && !sentryInitialized) {
    sentryInitialized = true;
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      beforeSend(event) {
        // Strip sensitive user PII (authorization headers, cookies, passwords)
        if (event.request) {
          if (event.request.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
          }
          if (event.request.cookies) {
            delete event.request.cookies;
          }
        }
        return event;
      },
    });
  }
}

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Log to Sentry if internal server error (500) and SENTRY_DSN is configured
    if (status >= 500 && process.env.SENTRY_DSN) {
      initApiSentry();
      Sentry.captureException(exception, {
        extra: {
          url: request.url,
          method: request.method,
        },
      });
    }

    if (status >= 500) {
      this.logger.error(`Unhandled Exception on ${request.method} ${request.url}`, exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json(
      typeof message === 'object'
        ? message
        : { statusCode: status, message },
    );
  }
}
