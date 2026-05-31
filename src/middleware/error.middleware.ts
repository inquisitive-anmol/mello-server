import { FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';

export function setupErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    logger.error({
      err: error,
      req: {
        method: request.method,
        url: request.url,
      },
    });

    const err = error as any;
    
    // Zod validation errors
    if (err.name === 'ZodError') {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Validation failed',
        details: JSON.parse(err.message),
      });
    }

    if (err.statusCode) {
      return reply.status(err.statusCode).send({
        error: err.name,
        message: err.message,
      });
    }

    // Default to 500
    reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
  });
}
