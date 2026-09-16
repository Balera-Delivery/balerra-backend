import { z } from 'zod';

export const createRestaurantSchema = z.object({
  name: z.string().min(2, 'Restaurant name must be at least 2 characters'),
  code: z.string().optional(),
  aliases: z.array(z.string()).optional().default([]),
  category: z.string().optional().default('Cafe & Restaurant'),
  cuisineType: z.string().optional().default('Local & Traditional Cuisine'),
  phone1: z.string().optional().default(''),
  phone2: z.string().optional().default(''),
  address: z.string().min(2, 'Address is required'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  rating: z.number().min(0).max(5).optional().default(4.8),
  totalReviews: z.number().int().min(0).optional().default(0),
  deliveryTime: z.string().optional().default('25 - 40 min'),
  deliveryFee: z.number().min(0).optional().default(60),
  priceRange: z.string().optional().default('$$'),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
  openingHours: z.string().optional().default('07:00 AM - 10:00 PM'),
  isPartner: z.boolean().optional().default(true),
  banner: z.string().optional(),
  avatar: z.string().optional(),
});

export const updateRestaurantSchema = createRestaurantSchema.partial();

export const updateRestaurantPhonesSchema = z.object({
  phone1: z.string().optional(),
  phone2: z.string().optional(),
});

export const updateRestaurantStatusSchema = z.object({
  status: z.enum(['Active', 'Inactive']),
});

export const createFoodItemSchema = z.object({
  name: z.string().min(2, 'Food name must be at least 2 characters'),
  code: z.string().optional(),
  category: z.string().optional().default('Main Dishes'),
  price: z.number().positive('Price must be greater than 0'),
  description: z.string().optional(),
  isAvailable: z.boolean().optional().default(true),
  tag: z.string().optional().default(''),
  image: z.string().optional(),
});

export const updateFoodItemSchema = createFoodItemSchema.partial();

export const toggleFoodAvailabilitySchema = z.object({
  isAvailable: z.boolean().optional(),
});

export const createFoodOrderSchema = z.object({
  restaurantId: z.string().min(1, 'Restaurant identifier is required'),
  items: z.array(
    z.object({
      foodItemId: z.string().optional(),
      name: z.string().min(1, 'Item name is required'),
      price: z.number().positive('Item price must be positive'),
      quantity: z.number().int().positive('Quantity must be at least 1'),
      notes: z.string().optional(),
    })
  ).min(1, 'Order must contain at least one item'),
  destination: z.string().min(2, 'Delivery destination is required'),
  destinationLatitude: z.number().min(-90).max(90).optional(),
  destinationLongitude: z.number().min(-180).max(180).optional(),
  receiverName: z.string().min(2, 'Receiver name is required'),
  receiverPhone: z.string().min(9, 'Valid receiver phone is required'),
  specialInstructions: z.string().optional(),
  paymentMethod: z.string().optional().default('TELEBIRR'),
  paymentStatus: z.string().optional().default('PENDING'),
  receiptUrl: z.string().optional(),
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
export type CreateFoodItemInput = z.infer<typeof createFoodItemSchema>;
export type UpdateFoodItemInput = z.infer<typeof updateFoodItemSchema>;
export type CreateFoodOrderInput = z.infer<typeof createFoodOrderSchema>;
