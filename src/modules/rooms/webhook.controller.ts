import { FastifyRequest, FastifyReply } from 'fastify';
import { WebhookReceiver } from 'livekit-server-sdk';
import { env } from '../../config/env';
import { Room } from '../rooms/room.model';
import { billingQueue, callTimeoutQueue } from '../../jobs/queue';
import { getIO } from '../../realtime/socket.server';
import { SOCKET_EVENTS } from '../../shared/constants/socket-events';
import { logger } from '../../utils/logger';

const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

/**
 * C-1: LiveKit Webhook Handler
 *
 * LiveKit POSTs signed JWT events to this endpoint for every room lifecycle event.
 * This gives us an authoritative, server-side source of truth that is independent of
 * client connectivity — so crashed/dropped calls are always cleaned up.
 *
 * Events handled:
 *   - room_finished      → mark room ended, stop billing, notify participants
 *   - participant_left   → set leftAt, detect if both participants have left
 *
 * Configure in LiveKit console: POST https://<host>/api/v1/webhooks/livekit
 * No auth header needed — the body itself is a signed JWT.
 */
export async function livekitWebhook(request: FastifyRequest, reply: FastifyReply) {
  try {
    // LiveKit sends the event as a signed JWT in the Authorization header
    const authHeader = request.headers['authorization'] as string;

    // The raw body must be passed exactly as received for signature verification
    const rawBody = (request as any).rawBody as string;
    if (!rawBody) {
      return reply.status(400).send({ error: 'No raw body available' });
    }

    // Verify the signature and decode the event
    const event = await receiver.receive(rawBody, authHeader);
    const { event: eventName, room, participant } = event;

    logger.info({ eventName, roomName: room?.name, participantId: participant?.identity }, '[LiveKit Webhook] Received event');

    if (eventName === 'room_finished' && room) {
      // Room has been shut down by LiveKit (e.g. emptyTimeout, or server restart)
      // Find by channelId (=LiveKit room name = our channelId UUID)
      const dbRoom = await Room.findOne({ channelId: room.name });
      if (!dbRoom) {
        logger.warn({ channelId: room.name }, '[LiveKit Webhook] room_finished for unknown channelId');
        return reply.status(200).send({ ok: true });
      }

      if (dbRoom.status !== 'ended') {
        const { RoomService } = require('./room.service');
        await RoomService.endRoom(dbRoom._id.toString());
        logger.info({ roomId: dbRoom._id, channelId: room.name }, '[LiveKit Webhook] room_finished → Room ended in DB');
      }
    }

    if (eventName === 'participant_left' && room && participant) {
      // C-4: Set leftAt on the departing participant
      const dbRoom = await Room.findOne({ channelId: room.name });
      if (dbRoom) {
        const participantEntry = dbRoom.participants.find(
          p => p.userId.toString() === participant.identity
        );
        if (participantEntry && !participantEntry.leftAt) {
          participantEntry.leftAt = new Date();
          await dbRoom.save();
          logger.info(
            { channelId: room.name, identity: participant.identity },
            '[LiveKit Webhook] participant_left → leftAt written'
          );
        }

        // If all participants have left, the room will be finished by LiveKit's emptyTimeout.
        // We don't need to force-end here — let room_finished handle it.
      }
    }

    if (eventName === 'participant_joined' && room) {
      // Authoritative Billing Trigger: Only start billing when BOTH participants are physically in the room
      if (room.numParticipants === 2) {
        const dbRoom = await Room.findOne({ channelId: room.name });
        if (dbRoom && dbRoom.status === 'active' && !dbRoom.billingRepeatKey) {
          try {
            const billingJob = await billingQueue.add('charge', { roomId: dbRoom._id.toString() }, {
              delay: 10000, // 10s grace period after both join
              repeat: { 
                every: 60000,
                jobId: `billing-${dbRoom._id.toString()}`
              }
            });
            if (billingJob.repeatJobKey) {
              dbRoom.billingRepeatKey = billingJob.repeatJobKey;
              await dbRoom.save();
              logger.info({ roomId: dbRoom._id }, '[LiveKit Webhook] participant_joined → Billing started');
            }
          } catch (err) {
            logger.error({ err, roomId: dbRoom._id }, '[LiveKit Webhook] Failed to start billing');
          }
        }
      }
    }

    return reply.status(200).send({ ok: true });
  } catch (err: any) {
    logger.error({ err: err.message }, '[LiveKit Webhook] Verification failed or processing error');
    return reply.status(401).send({ error: 'Webhook verification failed' });
  }
}
