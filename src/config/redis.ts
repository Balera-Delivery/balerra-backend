import Redis, { RedisOptions } from 'ioredis';
import { env } from './env';

const redisOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    // Retry with exponential backoff capped at 3 seconds
    if (times > 10 && env.NODE_ENV !== 'production') {
      // In dev mode, stop endlessly spamming if Redis isn't running
      return null;
    }
    return Math.min(times * 200, 3000);
  },
};

let redisConnected = false;

const buildClient = (overrides?: Partial<RedisOptions>): Redis => {
  const mergedOptions: RedisOptions = { ...redisOptions, ...overrides };
  return env.REDIS_URL
    ? new Redis(env.REDIS_URL, mergedOptions)
    : new Redis(mergedOptions);
};

// Primary Redis instance for caching, idempotency, and session helpers
export const redisClient = buildClient();

redisClient.on('connect', () => {
  redisConnected = true;
  console.log(`[Redis] Connection established successfully to ${env.REDIS_HOST}:${env.REDIS_PORT}`);
});

redisClient.on('ready', () => {
  redisConnected = true;
  console.log('[Redis] Client ready for commands.');
});

redisClient.on('error', (err: Error) => {
  redisConnected = false;
  // Graceful warning in dev mode instead of fatal crash
  if (env.NODE_ENV === 'production') {
    console.error('[Redis Error]', err.message);
  } else {
    console.warn(`[Redis Notice] Redis is not reachable at ${env.REDIS_HOST}:${env.REDIS_PORT} (${err.message}). Features using Redis will gracefully degrade.`);
  }
});

redisClient.on('close', () => {
  redisConnected = false;
});

/**
 * Factory to create dedicated Redis connections (required by BullMQ and Socket.io)
 */
export const createRedisClient = (overrides?: Partial<RedisOptions>): Redis => {
  return buildClient(overrides);
};

/**
 * Check if Redis is currently connected and responsive
 */
export const isRedisReady = (): boolean => redisConnected;

/**
 * Initial connection verification during server boot
 */
export const initRedis = async (): Promise<boolean> => {
  try {
    await redisClient.connect();
    const ping = await redisClient.ping();
    redisConnected = ping === 'PONG';
    return redisConnected;
  } catch (err: any) {
    redisConnected = false;
    console.warn(`[Redis] Initial connection attempt: ${err.message}. Proceeding with graceful fallback.`);
    return false;
  }
};

/**
 * Gracefully disconnect Redis client
 */
export const closeRedis = async (): Promise<void> => {
  try {
    if (redisConnected || redisClient.status === 'ready' || redisClient.status === 'connecting') {
      await redisClient.quit();
    }
  } catch {
    redisClient.disconnect();
  } finally {
    redisConnected = false;
    console.log('[Redis] Disconnected successfully.');
  }
};
