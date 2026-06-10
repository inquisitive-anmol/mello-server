import { FastifyRequest, FastifyReply } from 'fastify';
import { DiscoveryService } from './discovery.service';

export async function getListeners(
  request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>,
  reply: FastifyReply
) {
  const page = Number(request.query.page) || 1;
  const limit = Number(request.query.limit) || 20;
  const currentUserId = (request as any).auth?.userId;

  const result = await DiscoveryService.getActiveListeners(page, limit, currentUserId);
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
  const vibes = await DiscoveryService.getVibes();
  return reply.send({ data: vibes });
}

export async function getVibeCards(request: FastifyRequest, reply: FastifyReply) {
  const cards = await DiscoveryService.getVibeCards();
  return reply.send({ data: cards });
}

export async function getVibeGridQuestions(request: FastifyRequest, reply: FastifyReply) {
  const grid = await DiscoveryService.getVibeGridQuestions();
  return reply.send({ data: grid });
}

export async function getPackages(request: FastifyRequest, reply: FastifyReply) {
  const packages = await DiscoveryService.getPackages();
  return reply.send({ data: packages });
}

export async function getHistory(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).auth?.userId;
  if (!userId) return reply.status(401).send({ error: 'Unauthorized' });
  const history = await DiscoveryService.getHistory(userId);
  return reply.send({ data: history });
}

export async function getTransactions(request: FastifyRequest, reply: FastifyReply) {
  const transactions = await DiscoveryService.getTransactions();
  return reply.send({ data: transactions });
}

export async function toggleLike(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const myUserId = (request as any).auth?.userId;
    
    if (!myUserId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const result = await DiscoveryService.toggleLike(id, myUserId);
    return reply.send({ data: result });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}
