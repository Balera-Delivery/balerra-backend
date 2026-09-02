import crypto from 'crypto';

/**
 * Generates a human-readable unique delivery tracking code.
 * Example format: BAL-2026-X7K9M2
 */
export const generateTrackingCode = (): string => {
  const currentYear = new Date().getFullYear();
  const randomSegment = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BAL-${currentYear}-${randomSegment}`;
};
