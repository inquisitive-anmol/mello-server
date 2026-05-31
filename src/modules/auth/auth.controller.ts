import { FastifyRequest, FastifyReply } from 'fastify';
import { Webhook } from 'svix';
import { env } from '../../config/env';
import { User } from '../users/user.model';
import { logger } from '../../utils/logger';

export async function clerkWebhookHandler(request: FastifyRequest, reply: FastifyReply) {
  // To verify webhooks, Svix requires the raw string body.
  // We'll assume the raw body is attached to request.rawBody in app.ts
  const payload = (request as any).rawBody || JSON.stringify(request.body);
  const headers = request.headers;

  const svix_id = headers['svix-id'] as string;
  const svix_timestamp = headers['svix-timestamp'] as string;
  const svix_signature = headers['svix-signature'] as string;

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return reply.status(400).send({ error: 'Missing svix headers' });
  }

  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
  let evt: any;

  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err: any) {
    logger.error('Webhook verification failed', err.message);
    return reply.status(400).send({ error: 'Webhook verification failed' });
  }

  const { id, ...attributes } = evt.data;
  const eventType = evt.type;

  logger.info({ eventType, id }, 'Received Clerk webhook');

  try {
    if (eventType === 'user.created') {
      await User.create({
        clerkId: id,
        username: attributes.username || `user_${id.substring(0, 8)}`,
        profile: {
          displayName: `${attributes.first_name || ''} ${attributes.last_name || ''}`.trim(),
          avatarUrl: attributes.image_url || '',
          bio: '',
          vibeTags: [],
          languages: [],
        },
      });
      logger.info({ clerkId: id }, 'User created from webhook');
    } else if (eventType === 'user.updated') {
      await User.findOneAndUpdate(
        { clerkId: id },
        {
          $set: {
            username: attributes.username,
            'profile.displayName': `${attributes.first_name || ''} ${attributes.last_name || ''}`.trim(),
            'profile.avatarUrl': attributes.image_url,
          },
        }
      );
      logger.info({ clerkId: id }, 'User updated from webhook');
    } else if (eventType === 'user.deleted') {
      await User.findOneAndUpdate(
        { clerkId: id },
        { status: 'deactivated' }
      );
      logger.info({ clerkId: id }, 'User deactivated from webhook');
    }

    return reply.status(200).send({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error processing webhook');
    return reply.status(500).send({ error: 'Internal Server Error' });
  }
}
