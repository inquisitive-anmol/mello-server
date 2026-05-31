import { FastifyRequest, FastifyReply } from 'fastify';
import { DiscoveryService } from './discovery.service';

export async function getListeners(
  request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply
) {
  const page = Number(request.query.page) || 1;
  const limit = Number(request.query.limit) || 20;

  const result = await DiscoveryService.getActiveListeners(page, limit);
  return reply.send({
    data: result.data,
    meta: {
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      source: result.source,
    },
  });
}

export async function getVibes(request: FastifyRequest, reply: FastifyReply) {
  const vibes = DiscoveryService.getVibes();
  return reply.send({ data: vibes });
}
