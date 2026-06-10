import { Server, Socket } from 'socket.io';
import { Conversation, Message } from '../../modules/chat/chat.model';
import { User } from '../../modules/users/user.model';
import { logger } from '../../utils/logger';

export function registerChatHandlers(io: Server, socket: Socket) {
  const { userId } = socket.data;

  socket.on('SEND_MESSAGE', async (payload: { conversationId: string; text: string; targetUserId: string }) => {
    try {
      const { conversationId, text, targetUserId } = payload;
      
      const me = await User.findById(userId);
      let target = await User.findById(targetUserId);
      
      if (!target && !targetUserId.startsWith('seed_')) {
        target = await User.findOne({ clerkId: `seed_${targetUserId}` });
      }
      
      if (!me || !target) throw new Error(`User not found me=${!!me} target=${!!target} userId=${userId} targetUserId=${targetUserId}`);

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) throw new Error('Conversation not found');

      // Create message
      const message = await Message.create({
        conversationId,
        senderId: me._id,
        text,
        status: 'sent'
      });

      // Update conversation
      conversation.lastMessage = text;
      conversation.lastMessageAt = new Date();
      await conversation.save();

      // Emit to self (to confirm sent)
      socket.emit('MESSAGE_SENT', message);

      // Emit to target user (we use their Clerk ID as the socket room they join)
      io.to(targetUserId).emit('RECEIVE_MESSAGE', {
        message,
        conversationId
      });

    } catch (err) {
      logger.error({ err }, 'Error sending message');
      socket.emit('ERROR', { message: 'Failed to send message' });
    }
  });
}
