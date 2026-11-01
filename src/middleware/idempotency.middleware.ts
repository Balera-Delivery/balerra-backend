import { Request, Response, NextFunction } from 'express';
import { redisClient, isRedisReady } from '../config/redis';

interface CachedResponse {
  status: 'PENDING' | 'COMPLETED';
  statusCode?: number;
  headers?: Record<string, string>;
  body?: any;
}

const IDEMPOTENCY_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours
const PENDING_LOCK_SECONDS = 60; // 1 minute in-flight lock

/**
 * Idempotency Middleware
 * 
 * Safely prevents duplicate operations (orders, payments, delivery acceptance)
 * when client networks retry or users double-tap.
 * 
 * Progressive: If no `Idempotency-Key` header is present, the request proceeds normally.
 */
export const idempotencyMiddleware = (prefix = 'global') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to mutating HTTP methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = (req.headers['idempotency-key'] || req.headers['x-idempotency-key']) as string | undefined;

    // If client didn't supply an idempotency key, continue as normal
    if (!idempotencyKey) {
      return next();
    }

    // If Redis is offline, continue without caching to avoid blocking users
    if (!isRedisReady()) {
      return next();
    }

    const userId = (req as any).user?.id || (req as any).user?.userId || 'anonymous';
    const redisKey = `idempotency:${prefix}:${userId}:${idempotencyKey}`;

    try {
      // 1. Check if response is already cached or currently processing
      const cachedData = await redisClient.get(redisKey);

      if (cachedData) {
        const parsed: CachedResponse = JSON.parse(cachedData);

        if (parsed.status === 'PENDING') {
          res.status(409).json({
            status: 'error',
            message: 'A duplicate request is currently being processed. Please wait a moment.',
            code: 'CONCURRENT_REQUEST',
          });
          return;
        }

        if (parsed.status === 'COMPLETED' && parsed.statusCode) {
          res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT');
          res.status(parsed.statusCode).json(parsed.body);
          return;
        }
      }

      // 2. Acquire in-flight lock for this idempotency key
      const pendingRecord: CachedResponse = { status: 'PENDING' };
      const setSuccess = await redisClient.set(
        redisKey,
        JSON.stringify(pendingRecord),
        'EX',
        PENDING_LOCK_SECONDS,
        'NX' // only set if it does not already exist
      );

      if (!setSuccess) {
        // Another concurrent request grabbed the lock right before us
        res.status(409).json({
          status: 'error',
          message: 'A duplicate request is currently being processed. Please wait a moment.',
          code: 'CONCURRENT_REQUEST',
        });
        return;
      }

      // 3. Intercept response to store result upon successful completion
      const originalJson = res.json.bind(res);

      res.json = function (body: any): Response {
        // Only cache successful or client validation responses (not server crashes)
        if (res.statusCode < 500) {
          const completedRecord: CachedResponse = {
            status: 'COMPLETED',
            statusCode: res.statusCode,
            body,
          };
          redisClient.set(redisKey, JSON.stringify(completedRecord), 'EX', IDEMPOTENCY_EXPIRY_SECONDS).catch((err) => {
            console.error('[Idempotency] Failed to cache response in Redis:', err);
          });
        } else {
          // If 500 server error, release the lock so the client can retry
          redisClient.del(redisKey).catch(() => {});
        }

        return originalJson(body);
      };

      next();
    } catch (err: any) {
      console.warn(`[Idempotency Warning] Cache error (${err.message}). Bypassing idempotency check.`);
      next();
    }
  };
};
