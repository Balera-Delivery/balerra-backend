import { prisma } from '../config/prisma';
import { generateTrackingCode } from '../utils/trackingCode';
import { OtpService } from './otp.service';
import { NotificationService } from './notification.service';
import { Roles } from '../constants/roles';
import { DeliveryStatus } from '@prisma/client';

export class DeliveryService {
  /**
   * Create a new delivery request (by Customer)
   */
  static async createDelivery(customerId: string, data: {
    pickupLocation: string;
    pickupLatitude?: number;
    pickupLongitude?: number;
    destination: string;
    destinationLatitude?: number;
    destinationLongitude?: number;
    itemType: string;
    itemDescription: string;
    receiverName: string;
    receiverPhone: string;
    specialInstructions?: string;
  }) {
    const trackingCode = generateTrackingCode();

    const delivery = await prisma.delivery.create({
      data: {
        trackingCode,
        customerId,
        pickupLocation: data.pickupLocation,
        pickupLatitude: data.pickupLatitude || null,
        pickupLongitude: data.pickupLongitude || null,
        destination: data.destination,
        destinationLatitude: data.destinationLatitude || null,
        destinationLongitude: data.destinationLongitude || null,
        itemType: data.itemType,
        itemDescription: data.itemDescription,
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        specialInstructions: data.specialInstructions || null,
        status: 'PENDING',
        statusLogs: {
          create: {
            status: 'PENDING',
            updatedBy: customerId,
            notes: 'Delivery request created by customer.',
          },
        },
      },
      include: {
        customer: {
          select: { id: true, fullName: true, phoneNumber: true, email: true },
        },
      },
    });

    // Generate 6-digit OTP for delivery completion
    const otpCode = await OtpService.generateDeliveryOtp(delivery.id);

    // Notify Admins
    NotificationService.notifyAdmins(
      'New Delivery Request',
      `New request ${delivery.trackingCode} from ${delivery.customer.fullName}. Pickup: ${delivery.pickupLocation}`,
      { deliveryId: delivery.id, trackingCode: delivery.trackingCode }
    ).catch(() => {});

    // Notify Customer of submission
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: customerId,
      title: 'Delivery Request Submitted',
      message: `Your request (${delivery.trackingCode}) has been received and is pending assignment.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    return {
      ...delivery,
      otpCode,
    };
  }

  /**
   * Assign or Reassign an available/online Rider (by Admin)
   */
  static async assignRider(deliveryId: string, riderId: string, adminId: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true },
    });

    if (!delivery) {
      throw new Error('Delivery not found.');
    }

    if (delivery.status === 'COMPLETED' || delivery.status === 'CANCELLED') {
      throw new Error(`Cannot assign rider to a ${delivery.status.toLowerCase()} delivery.`);
    }

    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
    });

    if (!rider) {
      throw new Error('Rider not found.');
    }

    if (rider.accountStatus !== 'ACTIVE') {
      throw new Error('Selected rider account is not active.');
    }

    if (rider.availabilityStatus !== 'ONLINE') {
      throw new Error('Selected rider is currently offline.');
    }

    const updatedDelivery = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        riderId,
        status: 'ASSIGNED',
        statusLogs: {
          create: {
            status: 'ASSIGNED',
            updatedBy: adminId,
            notes: `Assigned to rider ${rider.fullName} (${rider.phoneNumber}).`,
          },
        },
      },
      include: {
        rider: {
          select: { id: true, fullName: true, phoneNumber: true, vehicleInfo: true },
        },
        customer: {
          select: { id: true, fullName: true, phoneNumber: true },
        },
      },
    });

    // Notify Rider of new assignment
    NotificationService.sendNotification({
      role: Roles.RIDER,
      recipientId: riderId,
      title: 'New Delivery Assigned',
      message: `You have been assigned order ${delivery.trackingCode}. Pickup: ${delivery.pickupLocation}`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Customer of rider assignment
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Rider Assigned',
      message: `Rider ${rider.fullName} (${rider.phoneNumber}) has been assigned to your order ${delivery.trackingCode}.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    return updatedDelivery;
  }

  /**
   * Rider Accepts assigned delivery
   */
  static async acceptDelivery(deliveryId: string, riderId: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true },
    });

    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.riderId !== riderId) throw new Error('You are not authorized for this delivery assignment.');
    if (delivery.status !== 'ASSIGNED') throw new Error(`Cannot accept delivery with status ${delivery.status}.`);

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'ACCEPTED',
        statusLogs: {
          create: {
            status: 'ACCEPTED',
            updatedBy: riderId,
            notes: 'Rider accepted the delivery assignment.',
          },
        },
      },
      include: { customer: true, rider: true },
    });

    // Notify Customer
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Delivery Accepted',
      message: `Rider ${delivery.rider?.fullName || ''} has accepted your delivery and will head to pickup soon.`,
      metadata: { deliveryId: delivery.id },
    }).catch(() => {});

    // Notify Admin
    NotificationService.notifyAdmins(
      'Delivery Accepted by Rider',
      `Rider ${delivery.rider?.fullName} accepted order ${delivery.trackingCode}.`,
      { deliveryId: delivery.id }
    ).catch(() => {});

    return updated;
  }

  /**
   * Rider Rejects assigned delivery
   */
  static async rejectDelivery(deliveryId: string, riderId: string, reason?: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { rider: true },
    });

    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.riderId !== riderId) throw new Error('You are not authorized for this delivery assignment.');

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        riderId: null,
        status: 'PENDING',
        statusLogs: {
          create: {
            status: 'PENDING',
            updatedBy: riderId,
            notes: `Rider ${delivery.rider?.fullName} rejected assignment. Reason: ${reason || 'Not specified'}`,
          },
        },
      },
    });

    // Notify Admin to reassign
    NotificationService.notifyAdmins(
      'Delivery Assignment Rejected',
      `Rider ${delivery.rider?.fullName} rejected order ${delivery.trackingCode}. Please reassign.`,
      { deliveryId: delivery.id }
    ).catch(() => {});

    return updated;
  }

  /**
   * Rider Updates Delivery Stage (ARRIVED_AT_PICKUP, PICKED_UP, ON_THE_WAY, DELIVERED)
   */
  static async updateRiderDeliveryStatus(
    deliveryId: string,
    riderId: string,
    nextStatus: DeliveryStatus,
    notes?: string
  ) {
    const validTransitions: Record<string, DeliveryStatus[]> = {
      ACCEPTED: ['ARRIVED_AT_PICKUP', 'PICKED_UP'],
      ARRIVED_AT_PICKUP: ['PICKED_UP'],
      PICKED_UP: ['ON_THE_WAY', 'DELIVERED'],
      ON_THE_WAY: ['DELIVERED'],
    };

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true },
    });

    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.riderId !== riderId) throw new Error('You are not the assigned rider for this delivery.');

    const allowedNext = validTransitions[delivery.status];
    if (!allowedNext || !allowedNext.includes(nextStatus)) {
      throw new Error(`Invalid status transition from ${delivery.status} to ${nextStatus}.`);
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: nextStatus,
        statusLogs: {
          create: {
            status: nextStatus,
            updatedBy: riderId,
            notes: notes || `Status updated to ${nextStatus}`,
          },
        },
      },
      include: { customer: true, rider: true },
    });

    // Notification messages based on status
    const statusMessages: Record<string, { title: string; body: string }> = {
      ARRIVED_AT_PICKUP: {
        title: 'Rider Arrived at Pickup',
        body: `Rider has arrived at the pickup location (${delivery.pickupLocation}).`,
      },
      PICKED_UP: {
        title: 'Package Picked Up',
        body: `Your package for ${delivery.receiverName} has been picked up.`,
      },
      ON_THE_WAY: {
        title: 'Package On The Way',
        body: `Your package is on the way to ${delivery.destination}.`,
      },
      DELIVERED: {
        title: 'Rider Arrived at Destination',
        body: `Rider has arrived at ${delivery.destination}. Please provide your 6-digit OTP to complete delivery.`,
      },
    };

    if (statusMessages[nextStatus]) {
      NotificationService.sendNotification({
        role: Roles.CUSTOMER,
        recipientId: delivery.customerId,
        title: statusMessages[nextStatus].title,
        message: statusMessages[nextStatus].body,
        metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode, status: nextStatus },
      }).catch(() => {});
    }

    return updated;
  }

  /**
   * Rider Verifies 6-digit OTP to complete delivery
   */
  static async completeDeliveryWithOtp(deliveryId: string, riderId: string, enteredOtp: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true, otp: true },
    });

    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.riderId !== riderId) throw new Error('You are not the assigned rider for this delivery.');

    if (delivery.status !== 'DELIVERED') {
      throw new Error(`OTP can only be verified when delivery is in DELIVERED state. Current status: ${delivery.status}`);
    }

    const isValid = await OtpService.verifyDeliveryOtp(deliveryId, enteredOtp);

    if (!isValid) {
      throw new Error('Invalid OTP code. Please ask the recipient for the correct 6-digit code.');
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'COMPLETED',
        statusLogs: {
          create: {
            status: 'COMPLETED',
            updatedBy: riderId,
            notes: 'Delivery completed successfully with 6-digit OTP verification.',
          },
        },
      },
      include: { customer: true, rider: true, otp: true },
    });

    // Notify Customer
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Delivery Completed! 🎉',
      message: `Your package (${delivery.trackingCode}) has been safely delivered and confirmed.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Admins
    NotificationService.notifyAdmins(
      'Delivery Completed',
      `Order ${delivery.trackingCode} successfully delivered by ${delivery.rider?.fullName}.`,
      { deliveryId: delivery.id }
    ).catch(() => {});

    return updated;
  }

  /**
   * Cancel Delivery (by Customer if pending, or by Admin anytime before completion)
   */
  static async cancelDelivery(deliveryId: string, cancelledByUserId: string, userRole: string, reason?: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true },
    });

    if (!delivery) throw new Error('Delivery not found.');

    if (delivery.status === 'COMPLETED') {
      throw new Error('Cannot cancel an already completed delivery.');
    }

    if (delivery.status === 'CANCELLED') {
      throw new Error('Delivery is already cancelled.');
    }

    if (userRole === Roles.CUSTOMER) {
      if (delivery.customerId !== cancelledByUserId) {
        throw new Error('Unauthorized: You can only cancel your own deliveries.');
      }
      if (delivery.status !== 'PENDING' && delivery.status !== 'ASSIGNED') {
        throw new Error(`Customers can only cancel pending or uncollected requests. Current status: ${delivery.status}`);
      }
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason || 'Cancelled by user',
        statusLogs: {
          create: {
            status: 'CANCELLED',
            updatedBy: cancelledByUserId,
            notes: `Delivery cancelled. Reason: ${reason || 'None provided'}`,
          },
        },
      },
      include: { customer: true, rider: true },
    });

    // Notify Customer if cancelled by admin
    if (userRole === Roles.ADMIN) {
      NotificationService.sendNotification({
        role: Roles.CUSTOMER,
        recipientId: delivery.customerId,
        title: 'Delivery Cancelled',
        message: `Your order ${delivery.trackingCode} was cancelled. Reason: ${reason || 'Administrative action'}`,
        metadata: { deliveryId: delivery.id },
      }).catch(() => {});
    }

    // Notify Rider if one was assigned
    if (delivery.riderId) {
      NotificationService.sendNotification({
        role: Roles.RIDER,
        recipientId: delivery.riderId,
        title: 'Delivery Assignment Cancelled',
        message: `Order ${delivery.trackingCode} assigned to you has been cancelled.`,
        metadata: { deliveryId: delivery.id },
      }).catch(() => {});
    }

    return updated;
  }

  /**
   * Get Deliveries list with filters & pagination
   */
  static async getDeliveries(params: {
    customerId?: string;
    riderId?: string;
    status?: DeliveryStatus;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? params.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.customerId) where.customerId = params.customerId;
    if (params.riderId) where.riderId = params.riderId;
    if (params.status) where.status = params.status;

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) where.createdAt.lte = new Date(params.endDate);
    }

    if (params.search && params.search.trim() !== '') {
      where.OR = [
        { trackingCode: { contains: params.search, mode: 'insensitive' } },
        { receiverName: { contains: params.search, mode: 'insensitive' } },
        { receiverPhone: { contains: params.search, mode: 'insensitive' } },
        { pickupLocation: { contains: params.search, mode: 'insensitive' } },
        { destination: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [deliveries, total] = await Promise.all([
      prisma.delivery.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, phoneNumber: true, email: true } },
          rider: { select: { id: true, fullName: true, phoneNumber: true, email: true, vehicleInfo: true } },
          otp: { select: { otpCode: true, isVerified: true } },
          statusLogs: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.delivery.count({ where }),
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
   * Get single delivery by ID
   */
  static async getDeliveryById(deliveryId: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        customer: { select: { id: true, fullName: true, phoneNumber: true, email: true, address: true } },
        rider: { select: { id: true, fullName: true, phoneNumber: true, email: true, vehicleInfo: true } },
        otp: { select: { otpCode: true, isVerified: true, createdAt: true } },
        statusLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!delivery) throw new Error('Delivery not found.');
    return delivery;
  }

  /**
   * Get real-time delivery tracking information with live coordinates
   */
  static async getDeliveryTrackingInfo(deliveryId: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        rider: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
            vehicleInfo: true,
            currentLatitude: true,
            currentLongitude: true,
            heading: true,
            lastLocationUpdate: true,
          },
        },
        statusLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!delivery) throw new Error('Delivery not found.');

    return {
      deliveryId: delivery.id,
      trackingCode: delivery.trackingCode,
      status: delivery.status,
      pickup: {
        address: delivery.pickupLocation,
        latitude: delivery.pickupLatitude,
        longitude: delivery.pickupLongitude,
      },
      destination: {
        address: delivery.destination,
        latitude: delivery.destinationLatitude,
        longitude: delivery.destinationLongitude,
      },
      assignedRider: delivery.rider
        ? {
            id: delivery.rider.id,
            fullName: delivery.rider.fullName,
            phoneNumber: delivery.rider.phoneNumber,
            vehicleInfo: delivery.rider.vehicleInfo,
            currentLocation: {
              latitude: delivery.rider.currentLatitude,
              longitude: delivery.rider.currentLongitude,
              heading: delivery.rider.heading,
              lastUpdate: delivery.rider.lastLocationUpdate,
            },
          }
        : null,
      recentUpdates: delivery.statusLogs,
    };
  }
}
