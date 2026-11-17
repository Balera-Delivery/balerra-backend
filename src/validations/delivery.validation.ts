import { z } from 'zod';

export const createDeliverySchema = z.object({
  pickupLocation: z.string().min(2, 'Pickup location is required'),
  pickupLatitude: z.number().min(-90).max(90).optional(),
  pickupLongitude: z.number().min(-180).max(180).optional(),
  destination: z.string().min(2, 'Destination is required'),
  destinationLatitude: z.number().min(-90).max(90).optional(),
  destinationLongitude: z.number().min(-180).max(180).optional(),
  itemType: z.string().min(2, 'Item type is required'),
  itemDescription: z.string().min(2, 'Item description is required'),
  receiverName: z.string().min(2, 'Receiver name is required'),
  receiverPhone: z.string().min(8, 'Receiver phone number is required'),
  specialInstructions: z.string().optional(),
  // Optional food order fields if submitted from food/restaurant flow
  restaurantId: z.string().optional(),
  hotelId: z.string().optional(),
  items: z.array(
    z.object({
      foodItemId: z.string().optional(),
      // Name and price are ignored when foodItemId is given (server uses the database values)
      name: z.string().optional().default(''),
      price: z.number().optional(),
      quantity: z.number().int().positive().max(50).default(1),
      notes: z.string().max(300).optional(),
    })
  ).max(100).optional(),
  promoCode: z.string().max(50).optional(),
  // Payment and receipt upload fields
  paymentMethod: z.string().optional(),
  paymentStatus: z.string().optional(),
  receiptUrl: z.string().optional(),
});

// Checkout price quote: food cart (items) or package delivery (no items)
export const checkoutQuoteSchema = z.object({
  items: z.array(
    z.object({
      foodItemId: z.string().min(1, 'foodItemId is required'),
      quantity: z.number().int().positive().max(50).default(1),
      notes: z.string().max(300).optional(),
    })
  ).max(100).optional(),
  promoCode: z.string().max(50).optional(),
});

export const uploadPaymentReceiptSchema = z.object({
  receiptUrl: z.string().min(1, 'Receipt URL / image data is required'),
  paymentMethod: z.string().optional(),
  paymentStatus: z.string().optional(),
});

export const updateDeliveryStatusSchema = z.object({
  status: z.enum([
    'ACCEPTED',
    'ARRIVED_AT_PICKUP',
    'PICKED_UP',
    'ON_THE_WAY',
    'DELIVERED',
  ]),
  notes: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  otpCode: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export const cancelDeliverySchema = z.object({
  reason: z.string().optional(),
});

export const assignRiderSchema = z.object({
  riderId: z.string().uuid('Valid Rider ID is required'),
});
