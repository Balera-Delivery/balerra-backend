import { prisma } from '../config/prisma';
import { generateTrackingCode } from '../utils/trackingCode';
import { OtpService } from './otp.service';
import { NotificationService } from './notification.service';
import { Roles } from '../constants/roles';
import { DeliveryStatus } from '@prisma/client';
import { broadcastDeliveryStatus } from '../socket';

export class DeliveryService {
  /**
   * Create a new delivery request (by Customer)
   * Supports both regular parcel/custom items AND food/restaurant orders with full menu items
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
    restaurantId?: string;
    hotelId?: string;
    items?: Array<{
      foodItemId?: string;
      name: string;
      price?: number;
      quantity?: number;
      notes?: string;
    }>;
    paymentMethod?: string;
    paymentStatus?: string;
    receiptUrl?: string;
  }) {
    const trackingCode = generateTrackingCode();

    // If restaurant identifier is passed, find matching restaurant
    const targetRestaurantId = data.restaurantId || data.hotelId;
    let restaurant: any = null;
    if (targetRestaurantId) {
      restaurant = await prisma.restaurant.findFirst({
        where: {
          OR: [
            { id: targetRestaurantId },
            { code: targetRestaurantId },
            { name: { contains: targetRestaurantId, mode: 'insensitive' } },
          ],
        },
      });
    }

    // Auto-detect restaurant by name if not explicitly passed
    if (!restaurant) {
      const allRestaurants = await prisma.restaurant.findMany();
      const combinedText = `${data.pickupLocation || ''} ${data.itemDescription || ''} ${data.itemType || ''}`.toLowerCase();
      restaurant = allRestaurants.find(r => 
        combinedText.includes(r.name.toLowerCase()) || 
        (r.aliases && r.aliases.some(a => combinedText.includes(a.toLowerCase()))) ||
        (r.code && combinedText.includes(r.code.toLowerCase()))
      ) || null;
    }

    const isFood =
      (data.itemType &&
        (data.itemType.toLowerCase().includes('food') ||
          data.itemType.toLowerCase().includes('restaurant') ||
          data.itemType.toLowerCase().includes('meal'))) ||
      !!restaurant ||
      (Array.isArray(data.items) && data.items.length > 0);

    // Determine pickup location and description
    const pickupLocation = restaurant
      ? `${restaurant.name}, ${restaurant.address}`
      : data.pickupLocation;

    let itemsToSave = Array.isArray(data.items) && data.items.length > 0 ? data.items : [];

    // If items array was empty but itemDescription has dish text (e.g. "2x Faxiraa (600 Birr) - SANA'A RESTAURANT")
    if (itemsToSave.length === 0 && data.itemDescription && isFood) {
      const match = data.itemDescription.match(/(\d+)\s*x\s*([^(]+?)(?:\s*\((?:ETB\s*|Birr\s*)?(\d+(?:\.\d+)?)\s*(?:Birr|ETB)?\))?(?:\s*-\s*(.+))?$/i);
      if (match) {
        const qty = parseInt(match[1], 10) || 1;
        const itemName = match[2].trim();
        const rawTotal = match[3] ? parseFloat(match[3]) : 0;
        const unitPrice = rawTotal > 0 ? (rawTotal / qty) : 250;
        itemsToSave = [{
          name: itemName,
          price: unitPrice,
          quantity: qty,
          notes: ''
        }];
      }
    }

    let itemDescription = data.itemDescription;
    if (isFood && restaurant && itemsToSave.length > 0) {
      const summary = itemsToSave.map((it) => `${it.quantity || 1}x ${it.name}`).join(', ');
      itemDescription = `Food Order from ${restaurant.name}: ${summary}`;
    }

    const paymentMethod = data.paymentMethod || (data.receiptUrl ? 'DIGITAL_TRANSFER' : 'TELEBIRR');
    const paymentStatus = data.paymentStatus || (data.receiptUrl ? 'PAID_PENDING_VERIFICATION' : 'PENDING');

    const qrCodeToken = `BALERA-${trackingCode}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const delivery = await prisma.delivery.create({
      data: {
        trackingCode,
        qrCodeToken,
        customerId,
        pickupLocation,
        pickupLatitude: data.pickupLatitude || (restaurant ? restaurant.latitude : null),
        pickupLongitude: data.pickupLongitude || (restaurant ? restaurant.longitude : null),
        destination: data.destination,
        destinationLatitude: data.destinationLatitude || null,
        destinationLongitude: data.destinationLongitude || null,
        itemType: data.itemType || (isFood ? 'Food' : 'Package'),
        itemDescription,
        receiverName: data.receiverName,
        receiverPhone: data.receiverPhone,
        specialInstructions: data.specialInstructions || null,
        paymentMethod,
        paymentStatus,
        receiptUrl: data.receiptUrl || null,
        status: 'PENDING',
        statusLogs: {
          create: {
            status: 'PENDING',
            updatedBy: customerId,
            notes: isFood && restaurant
              ? `Food order created for ${restaurant.name}.${data.receiptUrl ? ' Payment receipt uploaded.' : ''}`
              : `Delivery request created by customer.${data.receiptUrl ? ' Payment receipt uploaded.' : ''}`,
          },
        },
      },
      include: {
        customer: {
          select: { id: true, fullName: true, phoneNumber: true, email: true },
        },
      },
    });

    // If food order items or restaurant is present, create linked Order
    if (isFood && restaurant) {
      let subtotal = 0;
      const orderItemsData = [];

      for (const it of itemsToSave) {
        let verifiedPrice = 0;
        if (it.foodItemId) {
          const dbItem = await prisma.foodItem.findUnique({
            where: { id: it.foodItemId },
          });
          if (dbItem) {
            verifiedPrice = dbItem.price;
          }
        }
        // Fallback only if no foodItemId found in DB
        if (!verifiedPrice) {
          verifiedPrice = Number(it.price) || 0;
        }
        const qty = Math.max(1, Number(it.quantity) || 1);
        const itemSub = verifiedPrice * qty;
        subtotal += itemSub;

        orderItemsData.push({
          foodItemId: it.foodItemId || null,
          name: it.name,
          price: verifiedPrice,
          quantity: qty,
          subtotal: itemSub,
          notes: it.notes || null,
        });
      }

      const deliveryFee = restaurant.deliveryFee || 60;
      const totalAmount = subtotal + deliveryFee;
      const orderCount = await prisma.order.count();
      const orderNumber = `ORD-${new Date().getFullYear()}-${String(orderCount + 1001).padStart(5, '0')}`;

      await prisma.order.create({
        data: {
          orderNumber,
          customerId,
          restaurantId: restaurant.id,
          deliveryId: delivery.id,
          subtotal,
          deliveryFee,
          totalAmount,
          status: 'PENDING',
          paymentMethod,
          paymentStatus,
          receiptUrl: data.receiptUrl || null,
          specialInstructions: data.specialInstructions || null,
          items: {
            create: orderItemsData,
          },
        },
      });
    }

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

    // Return complete delivery record
    const completeDelivery = await this.getDeliveryById(delivery.id);

    return {
      ...completeDelivery,
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
        order: {
          include: {
            restaurant: true,
            items: true,
          },
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

    // Notify Customer of rider dispatch
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Rider Dispatched for Your Order',
      message: `Rider ${rider.fullName} (${rider.phoneNumber}) has been assigned to order ${delivery.trackingCode} and is heading to pickup.`,
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
            notes: `Rider ${delivery.rider?.fullName} accepted the delivery.`,
          },
        },
      },
      include: { customer: true, rider: true },
    });

    // Notify Customer
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Rider Heading to Pickup',
      message: `Rider ${delivery.rider?.fullName || 'Your rider'} accepted your delivery and is heading to pickup.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Rider of confirmation
    NotificationService.sendNotification({
      role: Roles.RIDER,
      recipientId: riderId,
      title: 'Delivery Confirmed',
      message: `You accepted order ${delivery.trackingCode}. Please proceed to pickup at: ${delivery.pickupLocation}`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

    return updated;
  }

  /**
   * Rider Rejects assigned delivery
   */
  static async rejectDelivery(deliveryId: string, riderId: string, reason?: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true },
    });

    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.riderId !== riderId) throw new Error('You are not authorized for this delivery assignment.');
    if (delivery.status !== 'ASSIGNED') throw new Error(`Cannot reject delivery with status ${delivery.status}.`);

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
      include: { customer: true },
    });

    // Notify Admins
    NotificationService.notifyAdmins(
      'Delivery Assignment Rejected',
      `Rider ${delivery.rider?.fullName} rejected assignment for order ${delivery.trackingCode}. Returned to pending queue.`,
      { deliveryId: delivery.id, trackingCode: delivery.trackingCode }
    ).catch(() => {});

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

    return updated;
  }

  /**
   * Rider Updates Delivery Progress Status (Alias)
   */
  static async updateRiderDeliveryStatus(
    deliveryId: string,
    riderId: string,
    nextStatus: DeliveryStatus,
    notes?: string
  ) {
    return this.updateDeliveryStatus(deliveryId, riderId, nextStatus, notes);
  }

  /**
   * Rider Updates Delivery Progress Status
   */
  static async updateDeliveryStatus(
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
    const statusMessages: Record<string, { customerTitle: string; customerBody: string; riderTitle: string; riderBody: string }> = {
      ARRIVED_AT_PICKUP: {
        customerTitle: 'Rider Arrived at Pickup',
        customerBody: `Your rider has arrived at the pickup location (${delivery.pickupLocation}).`,
        riderTitle: 'Arrived at Pickup',
        riderBody: `You arrived at ${delivery.pickupLocation}. Confirm package details before departure.`,
      },
      PICKED_UP: {
        customerTitle: 'Package Picked Up',
        customerBody: `Your package for ${delivery.receiverName} has been picked up and is on the way.`,
        riderTitle: 'Package Picked Up',
        riderBody: `Package collected. Head to destination: ${delivery.destination} (Recipient: ${delivery.receiverName}).`,
      },
      ON_THE_WAY: {
        customerTitle: 'Package On The Way',
        customerBody: `Your package is on the way to ${delivery.destination}.`,
        riderTitle: 'On The Way',
        riderBody: `En route to ${delivery.destination}. Recipient: ${delivery.receiverName} (${delivery.receiverPhone}).`,
      },
      DELIVERED: {
        customerTitle: 'Rider Arrived at Destination',
        customerBody: `Your rider has arrived at ${delivery.destination}. Please provide your 6-digit OTP code to complete delivery.`,
        riderTitle: 'Arrived at Destination',
        riderBody: `You arrived at ${delivery.destination}. Ask recipient ${delivery.receiverName} for the 6-digit OTP or scan their QR code.`,
      },
    };

    if (statusMessages[nextStatus]) {
      // Notify Customer
      NotificationService.sendNotification({
        role: Roles.CUSTOMER,
        recipientId: delivery.customerId,
        title: statusMessages[nextStatus].customerTitle,
        message: statusMessages[nextStatus].customerBody,
        metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode, status: nextStatus },
      }).catch(() => {});

      // Notify Rider
      if (delivery.riderId) {
        NotificationService.sendNotification({
          role: Roles.RIDER,
          recipientId: delivery.riderId,
          title: statusMessages[nextStatus].riderTitle,
          message: statusMessages[nextStatus].riderBody,
          metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode, status: nextStatus },
        }).catch(() => {});
      }

      // Notify Admins
      NotificationService.notifyAdmins(
        statusMessages[nextStatus].customerTitle,
        `Order ${delivery.trackingCode} (${delivery.customer?.fullName}): ${statusMessages[nextStatus].customerBody}`,
        { deliveryId: delivery.id, trackingCode: delivery.trackingCode, status: nextStatus }
      ).catch(() => {});
    }

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

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

    if (delivery.status !== 'DELIVERED' && delivery.status !== 'ON_THE_WAY') {
      throw new Error(`OTP can only be verified when delivery is ON THE WAY or DELIVERED. Current status: ${delivery.status}`);
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

    // If linked to Order, also update order status
    await prisma.order.updateMany({
      where: { deliveryId: delivery.id },
      data: { status: 'COMPLETED', paymentStatus: 'PAID' },
    });

    // Notify Customer
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Delivery Completed! 🎉',
      message: `Your package (${delivery.trackingCode}) has been safely delivered and confirmed.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Rider
    NotificationService.sendNotification({
      role: Roles.RIDER,
      recipientId: riderId,
      title: 'Delivery Completed! 💰',
      message: `Order ${delivery.trackingCode} completed successfully. Delivery fee credited to your earnings.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Admins
    NotificationService.notifyAdmins(
      'Delivery Completed',
      `Order ${delivery.trackingCode} successfully delivered by ${delivery.rider?.fullName}.`,
      { deliveryId: delivery.id }
    ).catch(() => {});

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

    return updated;
  }

  /**
   * Rider Verifies Customer QR Code to complete delivery
   */
  static async completeDeliveryWithQr(deliveryId: string, riderId: string, qrCodeToken: string) {
    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { customer: true, rider: true, otp: true, order: true },
    });

    if (!delivery) throw new Error('Delivery not found.');
    if (delivery.riderId && delivery.riderId !== riderId) {
      throw new Error('You are not the assigned rider for this delivery.');
    }

    if (delivery.status !== 'ON_THE_WAY' && delivery.status !== 'DELIVERED') {
      throw new Error(`QR can only be verified when delivery is ON THE WAY or DELIVERED. Current status: ${delivery.status}`);
    }

    if (!delivery.qrCodeToken || delivery.qrCodeToken.trim() !== qrCodeToken.trim()) {
      throw new Error('Invalid QR code token. Please ask the recipient to refresh their code or use OTP.');
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        status: 'COMPLETED',
        riderId: delivery.riderId || riderId,
        statusLogs: {
          create: {
            status: 'COMPLETED',
            updatedBy: riderId,
            notes: 'Delivery completed successfully via Customer QR code scan.',
          },
        },
      },
      include: { customer: true, rider: true, otp: true, order: true },
    });

    // If linked to Order, also update order status
    if (delivery.order) {
      await prisma.order.update({
        where: { id: delivery.order.id },
        data: { status: 'COMPLETED', paymentStatus: 'PAID' },
      });
    }

    // Mark OTP as verified as well
    await prisma.oTP.updateMany({
      where: { deliveryId: delivery.id },
      data: { isVerified: true, verifiedAt: new Date() },
    });

    // Notify Customer
    NotificationService.sendNotification({
      role: Roles.CUSTOMER,
      recipientId: delivery.customerId,
      title: 'Delivery Completed! 🎉',
      message: `Your package (${delivery.trackingCode}) has been safely handed over via QR scan.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Rider
    NotificationService.sendNotification({
      role: Roles.RIDER,
      recipientId: delivery.riderId || riderId,
      title: 'Delivery Completed! 💰',
      message: `Order ${delivery.trackingCode} completed successfully via QR scan. Delivery fee credited to your earnings.`,
      metadata: { deliveryId: delivery.id, trackingCode: delivery.trackingCode },
    }).catch(() => {});

    // Notify Admins
    NotificationService.notifyAdmins(
      'Delivery Completed',
      `Order ${delivery.trackingCode} successfully delivered via QR scan by ${delivery.rider?.fullName || 'rider'}.`,
      { deliveryId: delivery.id }
    ).catch(() => {});

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

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
        throw new Error(`Cannot cancel delivery once it is in ${delivery.status} state.`);
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
            notes: `Delivery cancelled. Reason: ${reason || 'Not specified'}`,
          },
        },
      },
      include: { customer: true, rider: true },
    });

    // If linked to Order, also cancel order
    await prisma.order.updateMany({
      where: { deliveryId: delivery.id },
      data: { status: 'CANCELLED' },
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

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

    return updated;
  }

  /**
   * Get Deliveries list with filters & pagination
   * Includes Customer, Rider, OTP, StatusLogs, AND Order with Restaurant & Items
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
        { order: { restaurant: { name: { contains: params.search, mode: 'insensitive' } } } },
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
          order: {
            include: {
              restaurant: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  category: true,
                  cuisineType: true,
                  phone1: true,
                  phone2: true,
                  address: true,
                  rating: true,
                  deliveryFee: true,
                  deliveryTime: true,
                  banner: true,
                  avatar: true,
                  status: true,
                },
              },
              items: {
                include: {
                  foodItem: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                      category: true,
                      image: true,
                      tag: true,
                      price: true,
                    },
                  },
                },
              },
            },
          },
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
   * Includes Customer, Rider, OTP, StatusLogs, AND Order with Restaurant & Items
   */
  static async getDeliveryById(deliveryId: string) {
    const delivery = await prisma.delivery.findFirst({
      where: {
        OR: [
          { id: deliveryId },
          { trackingCode: deliveryId },
          { trackingCode: `#${deliveryId}` },
        ],
      },
      include: {
        customer: { select: { id: true, fullName: true, phoneNumber: true, email: true, address: true } },
        rider: { select: { id: true, fullName: true, phoneNumber: true, email: true, vehicleInfo: true } },
        otp: { select: { otpCode: true, isVerified: true, createdAt: true } },
        statusLogs: { orderBy: { createdAt: 'asc' } },
        order: {
          include: {
            restaurant: true,
            items: {
              include: {
                foodItem: true,
              },
            },
          },
        },
      },
    });

    if (!delivery) throw new Error('Delivery not found.');
    return delivery;
  }

  /**
   * Get real-time delivery tracking information with live coordinates
   */
  static async getDeliveryTrackingInfo(deliveryId: string) {
    const delivery = await prisma.delivery.findFirst({
      where: {
        OR: [
          { id: deliveryId },
          { trackingCode: deliveryId },
        ],
      },
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
        order: {
          include: {
            restaurant: true,
            items: true,
          },
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
      order: delivery.order,
      recentUpdates: delivery.statusLogs,
      payment: {
        method: delivery.paymentMethod,
        status: delivery.paymentStatus,
        receiptUrl: delivery.receiptUrl,
      },
    };
  }

  /**
   * Customer uploads / attaches payment receipt for delivery
   */
  static async uploadPaymentReceipt(
    deliveryId: string,
    data: {
      receiptUrl: string;
      paymentMethod?: string;
      paymentStatus?: string;
      userId?: string;
    }
  ) {
    const delivery = await this.getDeliveryById(deliveryId);

    const paymentMethod = data.paymentMethod || delivery.paymentMethod || 'DIGITAL_TRANSFER';
    const paymentStatus = data.paymentStatus || 'PAID_PENDING_VERIFICATION';

    // Update Delivery and linked Order (if any)
    const updatedDelivery = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        receiptUrl: data.receiptUrl,
        paymentMethod,
        paymentStatus,
        statusLogs: {
          create: {
            status: delivery.status,
            updatedBy: data.userId || delivery.customerId,
            notes: `Payment receipt uploaded (${paymentMethod}). Verification status: ${paymentStatus}.`,
          },
        },
      },
      include: {
        customer: true,
        order: {
          include: {
            restaurant: true,
            items: true,
          },
        },
      },
    });

    if (delivery.order) {
      await prisma.order.update({
        where: { id: delivery.order.id },
        data: {
          receiptUrl: data.receiptUrl,
          paymentMethod,
          paymentStatus,
        },
      });
    }

    // Notify Admin of Payment Receipt Upload
    NotificationService.notifyAdmins(
      'Payment Receipt Uploaded',
      `Payment receipt uploaded for delivery ${delivery.trackingCode} by ${delivery.customer.fullName}.`,
      { deliveryId: delivery.id, trackingCode: delivery.trackingCode, receiptUrl: data.receiptUrl }
    ).catch(() => {});

    return updatedDelivery;
  }

  /**
   * Admin verifies / updates payment status
   */
  static async updatePaymentStatus(
    deliveryId: string,
    paymentStatus: string,
    adminId: string
  ) {
    const delivery = await this.getDeliveryById(deliveryId);

    const updated = await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        paymentStatus,
        statusLogs: {
          create: {
            status: delivery.status,
            updatedBy: adminId,
            notes: `Payment status updated to: ${paymentStatus}.`,
          },
        },
      },
    });

    if (delivery.order) {
      await prisma.order.update({
        where: { id: delivery.order.id },
        data: { paymentStatus },
      });
    }

    // Broadcast status to Customer tracking room and Admin Dashboard via WebSockets
    broadcastDeliveryStatus({
      deliveryId: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
      rider: (updated as any).rider ? { id: (updated as any).rider.id, fullName: (updated as any).rider.fullName } : (updated.riderId ? { id: updated.riderId } : undefined),
    });

    return updated;
  }
}
