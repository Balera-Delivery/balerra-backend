import { z } from 'zod';

export const adminCreateCustomerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  address: z.string().optional(),
});

export const adminCreateRiderSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Valid email is required'),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  vehicleInfo: z.string().optional(),
  accountStatus: z.enum(['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED']).optional(),
});

export const adminUpdateCustomerSchema = z.object({
  fullName: z.string().min(2).optional(),
  phoneNumber: z.string().min(8).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
});

export const adminUpdateRiderSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().min(8).optional(),
  vehicleInfo: z.string().optional(),
  availabilityStatus: z.enum(['ONLINE', 'OFFLINE']).optional(),
});

export const updateAccountStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

export const sendNotificationSchema = z.object({
  targetRole: z.enum(['ALL', 'CUSTOMER', 'RIDER', 'ADMIN']),
  targetUserId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
});

export const updateSystemSettingSchema = z.object({
  key: z.string().min(1, 'Setting key is required'),
  value: z.string().min(1, 'Setting value is required'),
});
