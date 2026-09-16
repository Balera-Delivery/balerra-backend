import { prisma } from '../config/prisma';
import { RiderAvailability } from '@prisma/client';

export class RiderService {
  /**
   * Get Rider Profile
   */
  static async getProfile(riderId: string) {
    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        vehicleInfo: true,
        availabilityStatus: true,
        accountStatus: true,
        createdAt: true,
      },
    });

    if (!rider) throw new Error('Rider profile not found.');
    return rider;
  }

  /**
   * Update Rider Profile
   */
  static async updateProfile(
    riderId: string,
    data: {
      fullName?: string;
      phoneNumber?: string;
      vehicleInfo?: string;
    }
  ) {
    if (data.phoneNumber) {
      const existingPhone = await prisma.rider.findFirst({
        where: {
          phoneNumber: data.phoneNumber,
          NOT: { id: riderId },
        },
      });
      if (existingPhone) throw new Error('Phone number is already in use by another rider.');
    }

    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: {
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
        ...(data.vehicleInfo !== undefined && { vehicleInfo: data.vehicleInfo }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        vehicleInfo: true,
        availabilityStatus: true,
        accountStatus: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  /**
   * Update Availability Status (ONLINE / OFFLINE)
   */
  static async updateAvailability(riderId: string, status: RiderAvailability) {
    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { availabilityStatus: status },
      select: {
        id: true,
        fullName: true,
        availabilityStatus: true,
        accountStatus: true,
      },
    });

    return updated;
  }

  /**
   * Update Rider's Current GPS Location (called periodically by mobile app)
   */
  static async updateLocation(
    riderId: string,
    latitude: number,
    longitude: number,
    heading?: number
  ) {
    return prisma.rider.update({
      where: { id: riderId },
      data: {
        currentLatitude: latitude,
        currentLongitude: longitude,
        heading: heading || null,
        lastLocationUpdate: new Date(),
      },
      select: {
        id: true,
        fullName: true,
        currentLatitude: true,
        currentLongitude: true,
        heading: true,
        lastLocationUpdate: true,
      },
    });
  }

  /**
   * Get Assigned Deliveries for Rider (ASSIGNED, ACCEPTED, in-progress)
   */
  static async getAssignedDeliveries(riderId: string) {
    return prisma.delivery.findMany({
      where: {
        riderId,
        status: {
          in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'],
        },
      },
      include: {
        customer: { select: { id: true, fullName: true, phoneNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get Current Active Delivery for Rider
   */
  static async getActiveDelivery(riderId: string) {
    return prisma.delivery.findFirst({
      where: {
        riderId,
        status: {
          in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'],
        },
      },
      include: {
        customer: { select: { id: true, fullName: true, phoneNumber: true, address: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get Completed Delivery History for Rider
   */
  static async getDeliveryHistory(riderId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [deliveries, total] = await Promise.all([
      prisma.delivery.findMany({
        where: {
          riderId,
          status: 'COMPLETED',
        },
        include: {
          customer: { select: { id: true, fullName: true, phoneNumber: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.delivery.count({
        where: {
          riderId,
          status: 'COMPLETED',
        },
      }),
    ]);

    return {
      deliveries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
