import { Server, Socket } from 'socket.io';
import { Conversation, Message } from '../../modules/chat/chat.model';
import { User } from '../../modules/users/user.model';
import { sendPushNotification } from '../../services/push.service';
import { logger } from '../../utils/logger';

export function registerChatHandlers(io: Server, socket: Socket) {
  const { userId } = socket.data;

  // Simple in-memory rate limiter per socket
  const MESSAGE_LIMIT = 10; // max 10 messages
  const WINDOW_MS = 5000; // per 5 seconds
  let messageCount = 0;
  let windowStart = Date.now();

  socket.on('SEND_MESSAGE', async (payload: { conversationId: string; text: string }) => {
    // Rate limit check
    const now = Date.now();
    if (now - windowStart > WINDOW_MS) {
      windowStart = now;
      messageCount = 0;
    }
    messageCount++;
    
    if (messageCount > MESSAGE_LIMIT) {
      socket.emit('ERROR', { message: 'You are sending messages too fast. Please wait.' });
      return;
    }

    try {
      const { conversationId, text } = payload;

      // A-3: Verify the authenticated user is a participant in this conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) throw new Error('Conversation not found');

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === userId
      );
      if (!isParticipant) {
        logger.warn({ userId, conversationId }, 'Unauthorized SEND_MESSAGE attempt: user is not a participant');
        socket.emit('ERROR', { message: 'You are not a participant in this conversation' });
        return;
      }

      // Secure targetId extraction from DB instead of client payload
      const targetId = conversation.participants
        .map(p => p.toString())
        .find(p => p !== userId);

      if (!targetId) {
        socket.emit('ERROR', { message: 'Target user not found in conversation' });
        return;
      }

      // B-1: Enforce block system
      const sender = await User.findById(userId);
      const target = await User.findById(targetId);

      if (!sender || !target) {
        socket.emit('ERROR', { message: 'User not found' });
        return;
      }

      if (sender.blockedUsers?.includes(targetId) || target.blockedUsers?.includes(userId)) {
        logger.warn({ userId, targetId }, 'SEND_MESSAGE blocked by block system');
        socket.emit('ERROR', { message: 'Message cannot be delivered due to blocking' });
        return;
      }

      // Create and persist the message
      const message = await Message.create({
        conversationId,
        senderId: userId,
        text,
        status: 'sent'
      });

      // Update conversation metadata and increment receiver's unread count atomically
      // C-5: $inc is atomic — safe even if multiple messages arrive simultaneously
      await Conversation.findByIdAndUpdate(conversationId, {
        $set: { lastMessage: text, lastMessageAt: new Date() },
        $inc: { [`unreadCount.${targetId}`]: 1 }
      });

      // Confirm to sender
      socket.emit('MESSAGE_SENT', message);

      // Deliver to target user's personal room (their userId socket room)
      io.to(targetId).emit('RECEIVE_MESSAGE', {
        message,
        conversationId
      });

      // B-8: Push notification fallback for offline users
      const targetRoom = io.sockets.adapter.rooms.get(targetId);
      if ((!targetRoom || targetRoom.size === 0) && target.pushToken) {
        await sendPushNotification({
          pushToken: target.pushToken,
          title: `New message from ${sender.profile.displayName || sender.username}`,
          body: 'You have a new message',
          data: { conversationId, type: 'chat_message' }
        });
      }

    } catch (err) {
      logger.error({ err }, 'Error sending message');
      socket.emit('ERROR', { message: 'Failed to send message' });
    }
  });

  // C-5: Client emits this when the user opens a conversation to mark messages as read
  socket.on('READ_CONVERSATION', async (payload: { conversationId: string }) => {
    try {
      const { conversationId } = payload;

      // Verify membership
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const isParticipant = conversation.participants.some(
        (p) => p.toString() === userId
      );
      if (!isParticipant) return;

      // Reset this user's unread count to 0
      await Conversation.findByIdAndUpdate(conversationId, {
        $set: { [`unreadCount.${userId}`]: 0 }
      });

      socket.emit('UNREAD_RESET', { conversationId });
    } catch (err) {
      logger.error({ err }, 'Error resetting unread count');
    }
  });
}
