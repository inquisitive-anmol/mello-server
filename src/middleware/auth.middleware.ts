import { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '@clerk/fastify';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const { userId } = getAuth(request);
  
  if (!userId) {
    return reply.status(401).send({ 
      error: 'Unauthorized', 
      message: 'Authentication required' 
    });
  }
}
