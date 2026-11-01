import { startNotificationWorker, closeNotificationWorker } from './notification.worker';
import { isRedisReady } from '../config/redis';

let workersStarted = false;

export const startAllWorkers = () => {
  if (workersStarted) return;

  // BullMQ workers require Redis to listen for jobs
  if (isRedisReady()) {
    try {
      startNotificationWorker();
      workersStarted = true;
      console.log('[BullMQ Workers] All background queue workers initialized successfully.');
    } catch (err: any) {
      console.warn(`[BullMQ Workers Warning] Could not start workers: ${err.message}`);
    }
  } else {
    console.log('[BullMQ Workers] Redis is offline. Background workers will start once Redis is connected.');
  }
};

export const closeAllWorkers = async () => {
  if (!workersStarted) return;
  try {
    await closeNotificationWorker();
    workersStarted = false;
    console.log('[BullMQ Workers] All background queue workers shut down cleanly.');
  } catch (err: any) {
    console.error('[BullMQ Workers Shutdown Error]', err.message);
  }
};
