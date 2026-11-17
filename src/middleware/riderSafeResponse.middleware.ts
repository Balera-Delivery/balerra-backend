import { Request, Response, NextFunction } from 'express';

/**
 * Riders must never receive the customer's handover secrets: the QR code token and the OTP
 * are what prove the rider actually met the customer. Delivery records contain them, so every
 * response on rider routes is cleaned before it is sent.
 */
const SECRET_KEYS = new Set(['qrCodeToken', 'otp', 'otpCode', 'password']);

const stripSecrets = (value: unknown, depth = 0): unknown => {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key)) continue;
    out[key] = stripSecrets(v, depth + 1);
  }
  return out;
};

export const riderSafeResponse = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(stripSecrets(body))) as Response['json'];
  next();
};
