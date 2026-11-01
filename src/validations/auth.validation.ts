import { z } from 'zod';

export const customerRegisterSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  address: z.string().optional(),
  fcmToken: z.string().optional(),
});

export const customerLoginSchema = z.object({
  identifier: z.string().min(1, 'Phone number or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const riderRegisterSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email is required for rider login').optional().or(z.literal('')),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  vehicleInfo: z.string().optional(),
  fcmToken: z.string().optional(),
});

export const riderLoginSchema = z.object({
  phoneNumber: z.string().min(1, 'Phone number is required').optional(),
  email: z.string().optional(),
  identifier: z.string().optional(),
  password: z.string().min(1, 'Password is required'),
}).refine(data => data.phoneNumber || data.email || data.identifier, {
  message: 'Phone number or email is required',
  path: ['phoneNumber'],
});

export const sendPhoneOtpSchema = z.object({
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
});

export const verifyPhoneOtpSchema = z.object({
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  code: z.string().min(4, 'Verification code must be at least 4 digits'),
});

export const resetPasswordPhoneSchema = z.object({
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  code: z.string().min(4, 'Verification code must be at least 4 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const adminLoginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const updateFcmTokenSchema = z.object({
  fcmToken: z.string().min(1, 'FCM token is required'),
});
