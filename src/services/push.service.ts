import { Expo, ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

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
  if (!Expo.isExpoPushToken(pushToken)) {
    console.warn(`[Push] Invalid Expo push token: ${pushToken}`);
    return;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'incoming-calls', // Android channel
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
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
