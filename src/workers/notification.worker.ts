import { Worker, Job } from 'bullmq';
import { NOTIFICATION_QUEUE_NAME, PushJobData, SmsJobData } from '../queues/notification.queue';
import { getQueueRedisConnection } from '../queues/queue.config';
import { firebaseApp, firebaseAdmin } from '../config/firebase';

let notificationWorker: Worker | null = null;

export const startNotificationWorker = (): Worker => {
  if (notificationWorker) return notificationWorker;

  notificationWorker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    async (job: Job) => {
      switch (job.name) {
        case 'send-push': {
          const data: PushJobData = job.data;
          if (firebaseApp && data.token) {
            await firebaseAdmin.messaging().send({
              token: data.token,
              notification: {
                title: data.title,
                body: data.body,
              },
              data: data.data || {},
            });
            console.log(`[Notification Worker] FCM push sent successfully (job #${job.id})`);
          }
          break;
        }

        case 'send-sms': {
          const data: SmsJobData = job.data;
          // Here goes the SMS gateway integration (e.g. Twilio, Ethio Telecom SMS API)
          console.log(`[Notification Worker] SMS sent to ${data.phoneNumber} (job #${job.id}): "${data.message}"`);
          break;
        }

        default:
          console.warn(`[Notification Worker] Unrecognized job name: ${job.name}`);
      }
    },
    {
      connection: getQueueRedisConnection(),
      concurrency: 5, // process up to 5 concurrent push/sms requests
    }
  );

  notificationWorker.on('completed', (job: Job) => {
    console.log(`[Notification Worker] Job #${job.id} (${job.name}) completed.`);
  });

  notificationWorker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Notification Worker] Job #${job?.id} (${job?.name}) failed:`, err.message);
  });

  notificationWorker.on('error', (err: Error) => {
    console.warn(`[Notification Worker Warning] Worker error: ${err.message}`);
  });

  return notificationWorker;
};

export const closeNotificationWorker = async (): Promise<void> => {
  if (notificationWorker) {
    await notificationWorker.close();
    notificationWorker = null;
    console.log('[Notification Worker] Closed cleanly.');
  }
};
