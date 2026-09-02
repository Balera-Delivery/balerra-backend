import { z } from 'zod';

export const updateRiderProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').optional(),
  phoneNumber: z.string().min(8, 'Phone number must be at least 8 digits').optional(),
  vehicleInfo: z.string().optional(),
});

export const updateRiderStatusSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE']),
});

export const updateRiderLocationSchema = z.object({
  latitude: z.number().min(-90).max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().min(-180).max(180, 'Longitude must be between -180 and 180'),
  heading: z.number().optional(),
});
