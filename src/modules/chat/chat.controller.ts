import { FastifyRequest, FastifyReply } from 'fastify';
import { Conversation, Message } from './chat.model';
import { User } from '../users/user.model';

export async function initConversation(
  request: FastifyRequest<{ Body: { myUserId: string; targetUserId: string } }>,
  reply: FastifyReply
) {
  try {
    const { myUserId, targetUserId } = request.body;

    let me = await User.findById(myUserId);
    
    // Auto-create dev user for local testing
    if (!me && myUserId === 'dev_user_1') {
      me = await User.create({
        phoneNumber: 'dev_user_1',
        username: 'dev_user_1',
        profile: { displayName: 'Dev User' },
        status: 'active'
      });
    }

    let target = await User.findById(targetUserId);
    
    // Fallback for old UI state where id='1' was used instead of 'seed_1'
    if (!target && !targetUserId.startsWith('seed_')) {
      target = await User.findOne({ phoneNumber: `seed_${targetUserId}` });
    }

    if (!me || !target) {
      return reply.status(404).send({ error: `User not found: me=${!!me}, target=${!!target}` });
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
  request: FastifyRequest<{ Params: { conversationId: string } }>,
  reply: FastifyReply
) {
  try {
    const { conversationId } = request.params;
    const messages = await Message.find({ conversationId })
      .sort({ createdAt: 1 }) // Chronological order
      .limit(50); // Fetch last 50 for now

    return reply.send({ data: messages });
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
}
