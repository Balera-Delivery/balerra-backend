import { Queue } from 'bullmq';
import { getQueueRedisConnection, defaultJobOptions } from './queue.config';
import { isRedisReady } from '../config/redis';
import { firebaseApp, firebaseAdmin } from '../config/firebase';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export interface PushJobData {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SmsJobData {
  phoneNumber: string;
  message: string;
}

export interface AdminBroadcastJobData {
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

let notificationQueue: Queue | null = null;

export const getNotificationQueue = (): Queue => {
  if (!notificationQueue) {
    notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection: getQueueRedisConnection(),
      defaultJobOptions,
    });
  }
  return notificationQueue;
};

/**
 * Enqueue a push notification with automatic fallback if Redis is offline
 */
export const queuePushNotification = async (jobData: PushJobData): Promise<void> => {
  if (isRedisReady()) {
    try {
      const q = getNotificationQueue();
      await q.add('send-push', jobData);
      return;
    } catch (err: any) {
      console.warn(`[Queue Warning] Failed to enqueue push, executing inline: ${err.message}`);
    }
  }

  // Graceful fallback: execute directly inline if Redis is unavailable
  if (firebaseApp && jobData.token) {
    try {
      await firebaseAdmin.messaging().send({
        token: jobData.token,
        notification: {
          title: jobData.title,
          body: jobData.body,
        },
        data: jobData.data || {},
      });
      console.log(`[Notification (Inline Fallback)] Push sent to token ending with ...${jobData.token.slice(-6)}`);
    } catch (err) {
      console.error('[Notification (Inline Fallback)] Failed to send push:', err);
    }
  }
};

/**
 * Enqueue an SMS dispatch with fallback
 */
export const queueSmsNotification = async (jobData: SmsJobData): Promise<void> => {
  if (isRedisReady()) {
    try {
      const q = getNotificationQueue();
      await q.add('send-sms', jobData);
      return;
    } catch (err: any) {
      console.warn(`[Queue Warning] Failed to enqueue SMS, executing inline: ${err.message}`);
    }
  }

  // Fallback: log or direct dispatch
  console.log(`[SMS (Inline Fallback)] To: ${jobData.phoneNumber} | Message: ${jobData.message}`);
};
