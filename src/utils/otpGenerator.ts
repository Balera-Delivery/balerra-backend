import crypto from 'crypto';

/**
 * Generates a secure, random 6-digit OTP string (e.g. "482910").
 */
export const generate6DigitOTP = (): string => {
  // Generate a random integer between 100000 and 999999
  const otp = crypto.randomInt(100000, 1000000).toString();
  return otp;
};
