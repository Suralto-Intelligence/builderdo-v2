import type { ApiError } from '@builderdo/shared';
import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { FastifyReply, FastifyRequest } from 'fastify';

const codeFor: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  413: 'payload_too_large',
  422: 'unprocessable',
  429: 'rate_limited',
};

/**
 * Turns every error into the same JSON shape with the request id.
 * Unexpected errors are logged and sent to Sentry; their details never reach the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiError['error'] = { code: 'internal_error', message: 'Something went wrong', requestId: request.id };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const fromResponse = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {};
      body = {
        code: typeof fromResponse.code === 'string' ? fromResponse.code : (codeFor[status] ?? 'error'),
        message: typeof fromResponse.message === 'string' ? fromResponse.message : exception.message,
        requestId: request.id,
        ...(fromResponse.details ? { details: fromResponse.details } : {}),
      };
    } else if (isFastifyError(exception)) {
      status = exception.statusCode;
      body = { code: codeFor[status] ?? 'error', message: exception.message, requestId: request.id };
    }

    if (status >= 500) {
      request.log.error({ err: exception }, 'unhandled error');
      Sentry.captureException(exception, { tags: { requestId: request.id } });
    }
    void reply.status(status).send({ error: body } satisfies ApiError);
  }
}

function isFastifyError(e: unknown): e is { statusCode: number; message: string } {
  return typeof e === 'object' && e !== null && typeof (e as { statusCode?: unknown }).statusCode === 'number'
    && (e as { statusCode: number }).statusCode < 500;
}
