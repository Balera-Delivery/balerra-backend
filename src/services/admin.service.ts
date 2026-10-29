import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { AccountStatus, RiderAvailability } from '@prisma/client';
import { NotificationService } from './notification.service';
import { Roles } from '../constants/roles';
import { calculateDistanceKm } from '../utils/distance';
import { ExportUtils, DeliveryExportItem } from '../utils/export.utils';

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
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
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
    includeDeleted?: boolean;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (!params.includeDeleted) {
      where.isDeleted = false;
    }
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
          isDeactivated: true,
          isDeleted: true,
          isPhoneVerified: true,
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
        isDeactivated: true,
        isDeleted: true,
      },
    });
  }

  /**
   * Rider Management: Toggle Deactivation
   */
  static async toggleRiderDeactivation(riderId: string, isDeactivated: boolean) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new Error('Rider not found.');

    return prisma.rider.update({
      where: { id: riderId },
      data: {
        isDeactivated,
        ...(isDeactivated && { availabilityStatus: 'OFFLINE' }),
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        isDeactivated: true,
        isDeleted: true,
        accountStatus: true,
        availabilityStatus: true,
      },
    });
  }

  /**
   * Rider Management: Soft Delete Rider
   * A removed rider cannot log in anymore, but old delivery history is preserved.
   */
  static async softDeleteRider(riderId: string) {
    const rider = await prisma.rider.findUnique({ where: { id: riderId } });
    if (!rider) throw new Error('Rider not found.');

    return prisma.rider.update({
      where: { id: riderId },
      data: {
        isDeleted: true,
        isDeactivated: true,
        accountStatus: 'SUSPENDED',
        availabilityStatus: 'OFFLINE',
      },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        isDeleted: true,
        isDeactivated: true,
        accountStatus: true,
      },
    });
  }

  /**
   * Rider Payouts: Summary of earnings, amount owed, and paid for each rider
   */
  static async getRiderPayoutsSummary() {
    const riders = await prisma.rider.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        fullName: true,
        phoneNumber: true,
        email: true,
        deliveries: {
          where: { status: { in: ['COMPLETED', 'DELIVERED'] } },
          select: {
            id: true,
            riderFee: true,
            isPaidToRider: true,
          },
        },
      },
    });

    return riders.map((r) => {
      let totalEarned = 0;
      let totalPaid = 0;
      let amountOwed = 0;
      let completedCount = r.deliveries.length;
      let unpaidCount = 0;

      for (const d of r.deliveries) {
        const fee = d.riderFee ?? 50.0;
        totalEarned += fee;
        if (d.isPaidToRider) {
          totalPaid += fee;
        } else {
          amountOwed += fee;
          unpaidCount++;
        }
      }

      return {
        riderId: r.id,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        email: r.email,
        completedDeliveriesCount: completedCount,
        unpaidDeliveriesCount: unpaidCount,
        totalEarned,
        totalPaid,
        amountOwed,
      };
    });
  }

  /**
   * Rider Payouts: Payment history and unpaid deliveries for a rider
   */
  static async getRiderPaymentHistory(riderId: string) {
    const deliveries = await prisma.delivery.findMany({
      where: {
        riderId,
        status: { in: ['COMPLETED', 'DELIVERED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        trackingCode: true,
        destination: true,
        riderFee: true,
        isPaidToRider: true,
        riderPaidAt: true,
        payoutReference: true,
        createdAt: true,
        customer: {
          select: { fullName: true, phoneNumber: true },
        },
      },
    });

    let totalEarned = 0;
    let totalPaid = 0;
    let amountOwed = 0;

    deliveries.forEach((d) => {
      const fee = d.riderFee ?? 50.0;
      totalEarned += fee;
      if (d.isPaidToRider) {
        totalPaid += fee;
      } else {
        amountOwed += fee;
      }
    });

    return {
      riderId,
      totalEarned,
      totalPaid,
      amountOwed,
      deliveries,
    };
  }

  /**
   * Rider Payouts: Mark rider deliveries as paid
   */
  static async markRiderPaid(riderId: string, deliveryIds?: string[], payoutReference?: string) {
    const where: any = {
      riderId,
      status: { in: ['COMPLETED', 'DELIVERED'] },
      isPaidToRider: false,
    };

    if (deliveryIds && deliveryIds.length > 0) {
      where.id = { in: deliveryIds };
    }

    const unpaidDeliveries = await prisma.delivery.findMany({
      where,
      select: { id: true, riderFee: true },
    });

    if (unpaidDeliveries.length === 0) {
      return { count: 0, totalAmount: 0, message: 'No unpaid completed deliveries found for this rider.' };
    }

    const totalAmount = unpaidDeliveries.reduce((sum, d) => sum + (d.riderFee ?? 50.0), 0);
    const ref = payoutReference || `PAYOUT-${Date.now()}`;
    const paidAt = new Date();

    const result = await prisma.delivery.updateMany({
      where: {
        id: { in: unpaidDeliveries.map((d) => d.id) },
      },
      data: {
        isPaidToRider: true,
        riderPaidAt: paidAt,
        payoutReference: ref,
      },
    });

    return {
      count: result.count,
      totalAmount,
      payoutReference: ref,
      paidAt,
    };
  }

  /**
   * Payment Settings: Bank and Mobile Money configuration
   */
  static async getPaymentSettings() {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            'bank_name',
            'bank_account_number',
            'bank_account_holder',
            'mobile_money_provider',
            'mobile_money_number',
            'mobile_money_name',
          ],
        },
      },
    });

    const map: Record<string, string> = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });

    return {
      bankName: map['bank_name'] || '',
      bankAccountNumber: map['bank_account_number'] || '',
      bankAccountHolder: map['bank_account_holder'] || '',
      mobileMoneyProvider: map['mobile_money_provider'] || '',
      mobileMoneyNumber: map['mobile_money_number'] || '',
      mobileMoneyName: map['mobile_money_name'] || '',
    };
  }

  static async updatePaymentSettings(data: {
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountHolder?: string;
    mobileMoneyProvider?: string;
    mobileMoneyNumber?: string;
    mobileMoneyName?: string;
  }) {
    const entries: [string, string | undefined][] = [
      ['bank_name', data.bankName],
      ['bank_account_number', data.bankAccountNumber],
      ['bank_account_holder', data.bankAccountHolder],
      ['mobile_money_provider', data.mobileMoneyProvider],
      ['mobile_money_number', data.mobileMoneyNumber],
      ['mobile_money_name', data.mobileMoneyName],
    ];

    for (const [key, val] of entries) {
      if (val !== undefined) {
        await prisma.systemSetting.upsert({
          where: { key },
          update: { value: val },
          create: { key, value: val },
        });
      }
    }

    return this.getPaymentSettings();
  }

  /**
   * Reports: Completed, In Progress, Pending, Cancelled deliveries
   */
  static async getDeliveriesReport(params: {
    status?: 'completed' | 'in_progress' | 'pending' | 'cancelled' | 'all';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.status) {
      if (params.status === 'completed') {
        where.status = { in: ['COMPLETED', 'DELIVERED'] };
      } else if (params.status === 'in_progress') {
        where.status = { in: ['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY'] };
      } else if (params.status === 'pending') {
        where.status = 'PENDING';
      } else if (params.status === 'cancelled') {
        where.status = 'CANCELLED';
      }
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    const [deliveries, total, countsByStatus] = await Promise.all([
      prisma.delivery.findMany({
        where,
        include: {
          customer: { select: { fullName: true, phoneNumber: true } },
          rider: { select: { fullName: true, phoneNumber: true } },
          order: {
            include: {
              restaurant: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.delivery.count({ where }),
      prisma.delivery.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
    ]);

    const statusCounts: Record<string, number> = {
      completed: 0,
      in_progress: 0,
      pending: 0,
      cancelled: 0,
      total: 0,
    };

    countsByStatus.forEach((c) => {
      statusCounts.total += c._count.id;
      if (['COMPLETED', 'DELIVERED'].includes(c.status)) {
        statusCounts.completed += c._count.id;
      } else if (['ASSIGNED', 'ACCEPTED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'ON_THE_WAY'].includes(c.status)) {
        statusCounts.in_progress += c._count.id;
      } else if (c.status === 'PENDING') {
        statusCounts.pending += c._count.id;
      } else if (c.status === 'CANCELLED') {
        statusCounts.cancelled += c._count.id;
      }
    });

    return {
      statusCounts,
      deliveries: deliveries.map((d) => ({
        id: d.id,
        trackingCode: d.trackingCode,
        status: d.status,
        customerName: d.customer?.fullName || 'N/A',
        customerPhone: d.customer?.phoneNumber || 'N/A',
        riderName: d.rider?.fullName || 'Unassigned',
        riderPhone: d.rider?.phoneNumber || 'N/A',
        partner: d.order?.restaurant?.name || 'Custom / Partner',
        destination: d.destination,
        pickupLocation: d.pickupLocation,
        paymentMethod: d.paymentMethod,
        orderNumber: d.order?.orderNumber || 'N/A',
        totalAmount: d.order?.totalAmount ?? (d.riderFee ?? 50.0),
        riderFee: d.riderFee ?? 50.0,
        isPaidToRider: d.isPaidToRider,
        createdAt: d.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Export deliveries report to CSV, Excel, or PDF
   */
  static async exportDeliveriesReport(params: {
    format: 'csv' | 'excel' | 'pdf';
    status?: 'completed' | 'in_progress' | 'pending' | 'cancelled' | 'all';
    startDate?: string;
    endDate?: string;
  }) {
    const reportData = await this.getDeliveriesReport({
      status: params.status,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: 1000,
    });

    const exportItems: DeliveryExportItem[] = reportData.deliveries.map((d: any) => ({
      trackingCode: d.trackingCode,
      orderNumber: d.orderNumber || 'N/A',
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      riderName: d.riderName,
      restaurantName: d.partner,
      pickupLocation: d.pickupLocation || 'Bale Robe',
      destination: d.destination,
      status: d.status,
      paymentMethod: d.paymentMethod || 'CASH_ON_DELIVERY',
      totalAmount: d.totalAmount,
      riderFee: d.riderFee,
      isPaidToRider: d.isPaidToRider,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : '',
    }));

    const title = `Balera Delivery Report - ${params.status ? params.status.toUpperCase() : 'ALL'}`;

    if (params.format === 'csv') {
      const csv = ExportUtils.generateCsv(exportItems);
      return {
        data: Buffer.from(csv, 'utf-8'),
        filename: `report-${Date.now()}.csv`,
        contentType: 'text/csv',
      };
    } else if (params.format === 'excel') {
      const buffer = await ExportUtils.generateExcel(exportItems);
      return {
        data: buffer,
        filename: `report-${Date.now()}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    } else {
      const buffer = await ExportUtils.generatePdf(exportItems, title);
      return {
        data: buffer,
        filename: `report-${Date.now()}.pdf`,
        contentType: 'application/pdf',
      };
    }
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
