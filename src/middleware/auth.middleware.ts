import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET) as { userId: string };

    // Inject into request.auth to maintain compatibility with existing controllers
    (request as any).auth = { userId: decoded.userId };

  } catch (error) {
    return reply.status(401).send({ 
      error: 'Unauthorized', 
      message: 'Invalid or expired token' 
    });
  }
}
