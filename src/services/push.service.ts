import { redis } from '../config/redis';

// Lazily instantiated to avoid ESM require errors
let expoInstance: any = null;
let ExpoClass: any = null;

/**
 * Sends a push notification to a single device via Expo Push Service.
 * Silently ignores invalid/expired tokens.
 */
export async function sendPushNotification({
  pushToken,
  title,
  body,
  data = {},
}: {
  pushToken: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<void> {
  if (!expoInstance) {
    const sdk = await import('expo-server-sdk');
    ExpoClass = sdk.Expo;
    expoInstance = new ExpoClass();
  }

  if (!ExpoClass.isExpoPushToken(pushToken)) {
    console.warn(`[Push] Invalid Expo push token: ${pushToken}`);
    return;
  }

  // Rate Limiting (1 per 10s per token to avoid spam)
  const rateLimitKey = `push:limit:${pushToken}`;
  const isLimited = await redis.get(rateLimitKey);
  if (isLimited) return;
  await redis.set(rateLimitKey, '1', 'EX', 10);

  // Content Masking for Privacy
  const finalBody = data?.type === 'chat_message' ? 'New message received' : body;

  const message: any = {
    to: pushToken,
    sound: 'default',
    title,
    body: finalBody,
    data,
    priority: 'high',
    channelId: 'incoming-calls', // Android channel
  };

  try {
    const chunks = expoInstance.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const receipts = await expoInstance.sendPushNotificationsAsync(chunk);
      for (const receipt of receipts) {
        if (receipt.status === 'error') {
          console.error('[Push] Error sending notification:', receipt.message);
        }
      }
    }
  } catch (err) {
    console.error('[Push] Failed to send push notification:', err);
  }
}

