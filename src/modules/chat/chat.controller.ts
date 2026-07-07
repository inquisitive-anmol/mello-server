import { FastifyRequest, FastifyReply } from 'fastify';
import { Conversation, Message } from './chat.model';
import { User } from '../users/user.model';

export async function initConversation(
  // A-2: myUserId is no longer accepted from the body — derived from the verified JWT
  request: FastifyRequest<{ Body: { targetUserId: string } }>,
  reply: FastifyReply
) {
  try {
    // A-2: Always use the authenticated user's ID from the JWT
    const myUserId = (request as any).auth.userId;
    const { targetUserId } = request.body;

    const me = await User.findById(myUserId);
    if (!me) return reply.status(404).send({ error: 'Authenticated user not found' });

    let target = await User.findById(targetUserId);
    
    // Fallback for old UI state where id='1' was used instead of 'seed_1'
    if (!target && !targetUserId.startsWith('seed_')) {
      target = await User.findOne({ phoneNumber: `seed_${targetUserId}` });
    }

    if (!target) {
      return reply.status(404).send({ error: `Target user not found: ${targetUserId}` });
    }

    // Find existing conversation
    let conversation = await Conversation.findOne({
      participants: { $all: [me._id, target._id] }
    }).populate('participants', 'phoneNumber profile.displayName profile.avatarUrl profile.vibeTags profile.location settings.isAvailable settings.callRate');

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [me._id, target._id],
        unreadCount: new Map([
          [me._id.toString(), 0],
          [target._id.toString(), 0]
        ])
      });
      conversation = await conversation.populate('participants', 'phoneNumber profile.displayName profile.avatarUrl profile.vibeTags profile.location settings.isAvailable settings.callRate');
    }

    return reply.send({ data: conversation });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}

export async function getMessages(
  request: FastifyRequest<{ Params: { conversationId: string }, Querystring: { page?: string; limit?: string; before?: string } }>,
  reply: FastifyReply
) {
  try {
    const { conversationId } = request.params;
    const myUserId = (request as any).auth.userId;

    // C-2: Verify membership before returning messages
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === myUserId
    );
    if (!isParticipant) {
      return reply.status(403).send({ error: 'You are not a participant in this conversation' });
    }

    // C-2: Honour page + limit query params (defaults: page=1, limit=30)
    const page = Math.max(1, parseInt(request.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit || '30', 10)));
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find({ conversationId })
        .sort({ createdAt: -1 }) // newest first so we can skip/limit efficiently
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments({ conversationId }),
    ]);

    return reply.send({
      data: messages.reverse(), // return in chronological order to the client
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}
