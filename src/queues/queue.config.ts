import { QueueOptions, WorkerOptions } from 'bullmq';
import { createRedisClient, isRedisReady } from '../config/redis';
import { env } from '../config/env';

export const getQueueRedisConnection = () => {
  return createRedisClient({
    maxRetriesPerRequest: null,
  });
};

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: {
    age: 24 * 3600, // keep for 24 hours
    count: 500,     // keep last 500
  },
  removeOnFail: {
    age: 7 * 24 * 3600, // keep for 7 days
    count: 1000,
  },
};
