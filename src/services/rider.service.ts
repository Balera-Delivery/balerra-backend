import { prisma } from '../config/prisma';
import { RiderAvailability } from '@prisma/client';

// What the rider app needs for each order: customer contact and every pickup restaurant with
// its dishes (multi-restaurant carts). Prices and the customer's QR/OTP secrets are not included.
const riderDeliveryInclude = {
  customer: { select: { id: true, fullName: true, phoneNumber: true } },
  order: {
    select: {
      id: true,
      restaurant: { select: { id: true, name: true, phone1: true, address: true, latitude: true, longitude: true } },
      items: {
        select: {
          name: true,
          quantity: true,
          notes: true,
          restaurantId: true,
          restaurantName: true,
          restaurant: { select: { id: true, name: true, phone1: true, address: true, latitude: true, longitude: true } },
        },
      },
    },
  },
} as const;

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

    // Real work numbers for the rider app (counted like the admin's Rider Payments page)
    const done = await prisma.delivery.findMany({
      where: { riderId, status: { in: ['DELIVERED', 'COMPLETED'] } },
      select: { riderFee: true, isPaidToRider: true, updatedAt: true },
    });
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const fee = (d: { riderFee: number | null }) => d.riderFee ?? 50;
    const today = done.filter((d) => d.updatedAt >= startOfToday);
    const assignedNow = await prisma.delivery.count({
      where: { riderId, status: { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'] } },
    });
    const totalEarnings = done.reduce((s, d) => s + fee(d), 0);
    const totalPaid = done.filter((d) => d.isPaidToRider).reduce((s, d) => s + fee(d), 0);

    // Support number riders call for help (Admin → Settings → General → Contact Phone Number)
    const supportRow = await prisma.systemSetting.findUnique({ where: { key: 'companyPhone' } });

    return {
      ...rider,
      supportPhone: supportRow?.value?.trim() || '',
      todayAssigned: assignedNow,
      todayCompleted: today.length,
      todayEarnings: today.reduce((s, d) => s + fee(d), 0),
      totalDeliveries: done.length,
      totalEarnings,
      totalPaid,
      amountOwed: totalEarnings - totalPaid,
    };
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
      include: riderDeliveryInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * One delivery of this rider (any status), for the details screen and live status checks
   */
  static async getDeliveryForRider(riderId: string, deliveryId: string) {
    const delivery = await prisma.delivery.findFirst({
      where: { riderId, OR: [{ id: deliveryId }, { trackingCode: deliveryId }] },
      include: riderDeliveryInclude,
    });
    if (!delivery) throw new Error('Delivery not found.');
    return delivery;
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
      include: riderDeliveryInclude,
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
          status: { in: ['DELIVERED', 'COMPLETED'] },
        },
        include: {
          customer: { select: { id: true, fullName: true, phoneNumber: true } },
          order: {
            include: {
              restaurant: { select: { id: true, name: true, phone1: true, address: true, avatar: true } },
              items: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.delivery.count({
        where: {
          riderId,
          status: { in: ['DELIVERED', 'COMPLETED'] },
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

  /**
   * Get Earnings and Payout Summary for Rider
   */
  static async getEarningsSummary(riderId: string) {
    const completed = await prisma.delivery.findMany({
      where: {
        riderId,
        status: { in: ['DELIVERED', 'COMPLETED'] },
      },
      include: {
        order: {
          include: {
            restaurant: { select: { name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const totalEarned = completed.reduce((sum, d) => sum + (d.riderFee || 50), 0);
    const totalPaid = completed.filter((d) => d.isPaidToRider).reduce((sum, d) => sum + (d.riderFee || 50), 0);
    const amountOwed = totalEarned - totalPaid;

    return {
      totalDeliveries: completed.length,
      totalEarned,
      totalPaid,
      amountOwed,
      unpaidDeliveries: completed.filter((d) => !d.isPaidToRider),
      paidDeliveries: completed.filter((d) => d.isPaidToRider),
    };
  }
}
