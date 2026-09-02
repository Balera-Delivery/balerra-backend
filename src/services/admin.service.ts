import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { AccountStatus, RiderAvailability } from '@prisma/client';
import { NotificationService } from './notification.service';
import { Roles } from '../constants/roles';
import { calculateDistanceKm } from '../utils/distance';

export class AdminService {
  /**
   * Get Dashboard Statistics (SRS Chapter 10.4)
   */
  static async getDashboardStats() {
    const [
      totalCustomers,
      totalRiders,
      onlineRiders,
      offlineRiders,
      pendingRiders,
      totalDeliveries,
      pendingDeliveries,
      activeDeliveries,
      completedDeliveries,
      cancelledDeliveries,
      recentDeliveries,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.rider.count(),
      prisma.rider.count({ where: { availabilityStatus: 'ONLINE', accountStatus: 'ACTIVE' } }),
      prisma.rider.count({ where: { availabilityStatus: 'OFFLINE', accountStatus: 'ACTIVE' } }),
      prisma.rider.count({ where: { accountStatus: 'PENDING_APPROVAL' } }),
      prisma.delivery.count(),
      prisma.delivery.count({ where: { status: 'PENDING' } }),
      prisma.delivery.count({
        where: {
          status: { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'] },
        },
      }),
      prisma.delivery.count({ where: { status: 'COMPLETED' } }),
      prisma.delivery.count({ where: { status: 'CANCELLED' } }),
      prisma.delivery.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { id: true, fullName: true, phoneNumber: true } },
          rider: { select: { id: true, fullName: true, phoneNumber: true } },
        },
      }),
    ]);

    return {
      metrics: {
        totalCustomers,
        totalRiders,
        onlineRiders,
        offlineRiders,
        pendingRidersApproval: pendingRiders,
        totalDeliveries,
        pendingDeliveries,
        activeDeliveries,
        completedDeliveries,
        cancelledDeliveries,
      },
      recentDeliveries,
    };
  }

  /**
   * Customer Management: List & Search
   */
  static async getCustomers(params: {
    search?: string;
    status?: AccountStatus;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.search && params.search.trim() !== '') {
      where.OR = [
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { phoneNumber: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          address: true,
          status: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      customers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Customer Management: Create Customer directly by Admin
   */
  static async createCustomer(data: {
    fullName: string;
    phoneNumber: string;
    email?: string;
    password: string;
    address?: string;
  }) {
    const existingPhone = await prisma.customer.findUnique({
      where: { phoneNumber: data.phoneNumber },
    });
    if (existingPhone) throw new Error('Phone number is already registered.');

    if (data.email && data.email.trim() !== '') {
      const existingEmail = await prisma.customer.findUnique({
        where: { email: data.email },
      });
      if (existingEmail) throw new Error('Email is already registered.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prisma.customer.create({
      data: {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        email: data.email && data.email.trim() !== '' ? data.email : null,
        password: hashedPassword,
        address: data.address || null,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        address: true,
        status: true,
        createdAt: true,
      },
    });
  }

  /**
   * Customer Management: Get Customer Details & delivery history
   */
  static async getCustomerById(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          include: {
            rider: { select: { id: true, fullName: true, phoneNumber: true } },
          },
        },
      },
    });

    if (!customer) throw new Error('Customer not found.');

    const { password, ...safeCustomer } = customer;
    return safeCustomer;
  }

  /**
   * Customer Management: Update Info
   */
  static async updateCustomer(
    customerId: string,
    data: { fullName?: string; phoneNumber?: string; email?: string; address?: string }
  ) {
    return prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.fullName && { fullName: data.fullName }),
        ...(data.phoneNumber && { phoneNumber: data.phoneNumber }),
        ...(data.email !== undefined && { email: data.email ? data.email : null }),
        ...(data.address !== undefined && { address: data.address }),
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        address: true,
        status: true,
      },
    });
  }

  /**
   * Customer Management: Suspend or Reactivate
   */
  static async setCustomerStatus(customerId: string, status: AccountStatus) {
    return prisma.customer.update({
      where: { id: customerId },
      data: { status },
      select: { id: true, fullName: true, phoneNumber: true, status: true },
    });
  }

  /**
   * Rider Management: List & Filter
   */
  static async getRiders(params: {
    search?: string;
    accountStatus?: AccountStatus;
    availabilityStatus?: RiderAvailability;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.accountStatus) where.accountStatus = params.accountStatus;
    if (params.availabilityStatus) where.availabilityStatus = params.availabilityStatus;

    if (params.search && params.search.trim() !== '') {
      where.OR = [
        { fullName: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { phoneNumber: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [riders, total] = await Promise.all([
      prisma.rider.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          vehicleInfo: true,
          availabilityStatus: true,
          accountStatus: true,
          createdAt: true,
          _count: { select: { deliveries: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rider.count({ where }),
    ]);

    return {
      riders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Rider Management: Create Rider directly by Admin
   */
  static async createRider(data: {
    fullName: string;
    email: string;
    phoneNumber: string;
    password: string;
    vehicleInfo?: string;
    accountStatus?: AccountStatus;
  }) {
    const existingEmail = await prisma.rider.findUnique({ where: { email: data.email } });
    if (existingEmail) throw new Error('Email address already registered for a rider.');

    const existingPhone = await prisma.rider.findUnique({ where: { phoneNumber: data.phoneNumber } });
    if (existingPhone) throw new Error('Phone number already registered for a rider.');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prisma.rider.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashedPassword,
        vehicleInfo: data.vehicleInfo || null,
        accountStatus: data.accountStatus || 'ACTIVE',
        availabilityStatus: 'OFFLINE',
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        vehicleInfo: true,
        accountStatus: true,
        availabilityStatus: true,
        createdAt: true,
      },
    });
  }

  /**
   * Rider Management: Approve pending rider application
   */
  static async approveRider(riderId: string) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new Error('Rider not found.');

    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { accountStatus: 'ACTIVE' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        accountStatus: true,
      },
    });

    // Notify Rider of account activation
    NotificationService.sendNotification({
      role: Roles.RIDER,
      recipientId: riderId,
      title: 'Account Approved! 🎉',
      message: 'Your rider account has been approved by admin. You can now log in and go online.',
    }).catch(() => {});

    return updated;
  }

  /**
   * Rider Management: Suspend or Activate
   */
  static async setRiderStatus(riderId: string, status: AccountStatus) {
    return prisma.rider.update({
      where: { id: riderId },
      data: {
        accountStatus: status,
        ...(status === 'SUSPENDED' && { availabilityStatus: 'OFFLINE' }),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        accountStatus: true,
        availabilityStatus: true,
      },
    });
  }

  /**
   * Rider Management: Get Rider Details, stats & active tasks
   */
  static async getRiderById(riderId: string) {
    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            customer: { select: { id: true, fullName: true, phoneNumber: true } },
          },
        },
      },
    });

    if (!rider) throw new Error('Rider not found.');

    const [completedCount, cancelledCount] = await Promise.all([
      prisma.delivery.count({ where: { riderId, status: 'COMPLETED' } }),
      prisma.delivery.count({ where: { riderId, status: 'CANCELLED' } }),
    ]);

    const { password, ...safeRider } = rider;
    return {
      ...safeRider,
      stats: {
        completedDeliveries: completedCount,
        cancelledDeliveries: cancelledCount,
      },
    };
  }

  /**
   * Rider Management: Update rider information
   */
  static async updateRider(
    riderId: string,
    data: {
      fullName?: string;
      email?: string;
      phoneNumber?: string;
      vehicleInfo?: string;
      availabilityStatus?: RiderAvailability;
    }
  ) {
    return prisma.rider.update({
      where: { id: riderId },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        vehicleInfo: true,
        availabilityStatus: true,
        accountStatus: true,
      },
    });
  }

  /**
   * System Settings: Get All
   */
  static async getSettings() {
    return prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  /**
   * System Settings: Upsert Setting
   */
  static async setSetting(key: string, value: string) {
    return prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  /**
   * Proximity Search: Find Nearest Online Riders to a Pickup Point
   */
  static async getNearbyRiders(params: {
    pickupLat?: number;
    pickupLng?: number;
    deliveryId?: string;
    radiusKm?: number;
  }) {
    let lat = params.pickupLat;
    let lng = params.pickupLng;

    if ((lat === undefined || lng === undefined) && params.deliveryId) {
      const delivery = await prisma.delivery.findUnique({
        where: { id: params.deliveryId },
      });
      if (delivery && delivery.pickupLatitude && delivery.pickupLongitude) {
        lat = delivery.pickupLatitude;
        lng = delivery.pickupLongitude;
      }
    }

    if (lat === undefined || lng === undefined) {
      throw new Error('Pickup coordinates (pickupLat, pickupLng) or a valid deliveryId with coordinates is required.');
    }

    const radius = params.radiusKm || 50;

    const riders = await prisma.rider.findMany({
      where: {
        accountStatus: 'ACTIVE',
        availabilityStatus: 'ONLINE',
        currentLatitude: { not: null },
        currentLongitude: { not: null },
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        vehicleInfo: true,
        currentLatitude: true,
        currentLongitude: true,
        heading: true,
        lastLocationUpdate: true,
        _count: {
          select: {
            deliveries: {
              where: {
                status: { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'] },
              },
            },
          },
        },
      },
    });

    const nearbyRiders = riders
      .map((r) => {
        const distanceKm = calculateDistanceKm(
          lat!,
          lng!,
          r.currentLatitude!,
          r.currentLongitude!
        );
        return {
          id: r.id,
          fullName: r.fullName,
          phoneNumber: r.phoneNumber,
          email: r.email,
          vehicleInfo: r.vehicleInfo,
          coordinates: {
            latitude: r.currentLatitude,
            longitude: r.currentLongitude,
            heading: r.heading,
            lastUpdate: r.lastLocationUpdate,
          },
          distanceKm,
          activeOrdersCount: r._count.deliveries,
        };
      })
      .filter((r) => r.distanceKm <= radius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return {
      pickupLocation: { latitude: lat, longitude: lng },
      radiusKm: radius,
      totalFound: nearbyRiders.length,
      riders: nearbyRiders,
    };
  }

  /**
   * Live Fleet Map Data: Returns all online riders and active delivery markers
   */
  static async getLiveMapData() {
    const [onlineRiders, activeDeliveries] = await Promise.all([
      prisma.rider.findMany({
        where: {
          accountStatus: 'ACTIVE',
          availabilityStatus: 'ONLINE',
        },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          vehicleInfo: true,
          currentLatitude: true,
          currentLongitude: true,
          heading: true,
          lastLocationUpdate: true,
          deliveries: {
            where: {
              status: { in: ['ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'] },
            },
            select: { id: true, trackingCode: true, status: true },
          },
        },
      }),
      prisma.delivery.findMany({
        where: {
          status: {
            in: ['PENDING', 'ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY', 'DELIVERED'],
          },
        },
        select: {
          id: true,
          trackingCode: true,
          status: true,
          pickupLocation: true,
          pickupLatitude: true,
          pickupLongitude: true,
          destination: true,
          destinationLatitude: true,
          destinationLongitude: true,
          riderId: true,
          customer: {
            select: { fullName: true, phoneNumber: true },
          },
        },
      }),
    ]);

    return {
      onlineRiders: onlineRiders.map((r) => ({
        ...r,
        isBusy: r.deliveries.length > 0,
        activeDelivery: r.deliveries[0] || null,
      })),
      activeDeliveries,
      timestamp: new Date(),
    };
  }
}
