import { prisma } from '../config/prisma';
import { firebaseApp } from '../config/firebase';
import { RoleType, Roles } from '../constants/roles';
import { queuePushNotification } from '../queues/notification.queue';
import { broadcastAdminNotification } from '../socket';

export interface CreateNotificationParams {
  role: RoleType;
  recipientId: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  /**
   * Save in-app notification and send Firebase push notification if token exists.
   */
  static async sendNotification({
    role,
    recipientId,
    title,
    message,
    metadata,
  }: CreateNotificationParams) {
    let fcmToken: string | null = null;

    // 1. Create in-app database record
    const notificationData: any = {
      userRole: role,
      title,
      message,
      metadata: metadata || {},
    };

    if (role === Roles.CUSTOMER) {
      notificationData.customerId = recipientId;
      notificationData.riderId = null;
      notificationData.adminId = null;
      const customer = await prisma.customer.findUnique({
        where: { id: recipientId },
        select: { fcmToken: true },
      });
      fcmToken = customer?.fcmToken || null;
    } else if (role === Roles.RIDER) {
      notificationData.riderId = recipientId;
      notificationData.customerId = null;
      notificationData.adminId = null;
      const rider = await prisma.rider.findUnique({
        where: { id: recipientId },
        select: { fcmToken: true },
      });
      fcmToken = rider?.fcmToken || null;
    } else if (role === Roles.ADMIN) {
      notificationData.adminId = recipientId;
      notificationData.customerId = null;
      notificationData.riderId = null;
      const admin = await prisma.admin.findUnique({
        where: { id: recipientId },
        select: { fcmToken: true },
      });
      fcmToken = admin?.fcmToken || null;
    }

    const savedNotification = await prisma.notification.create({
      data: notificationData,
    });

    // If notification is for Admin, broadcast immediately to Admin WebSockets
    if (role === Roles.ADMIN) {
      broadcastAdminNotification({
        id: savedNotification.id,
        title: savedNotification.title,
        message: savedNotification.message,
        createdAt: savedNotification.createdAt.toISOString(),
        userRole: Roles.ADMIN,
        metadata: savedNotification.metadata as Record<string, any>,
      });
    }

    // 2. Dispatch FCM Push Notification via BullMQ background queue (with automatic fallback)
    if (fcmToken) {
      queuePushNotification({
        token: fcmToken,
        title,
        body: message,
        data: metadata ? Object.fromEntries(
          Object.entries(metadata).map(([k, v]) => [k, String(v)])
        ) : undefined,
      }).catch((err) => {
        console.error(`[Notification Queue] Failed to queue FCM push to ${recipientId}:`, err);
      });
    }

    return savedNotification;
  }

  /**
   * Notify all system administrators (e.g., when a new delivery request is submitted)
   */
  static async notifyAdmins(title: string, message: string, metadata?: Record<string, any>) {
    const admins = await prisma.admin.findMany({ select: { id: true } });
    const promises = admins.map((admin) =>
      this.sendNotification({
        role: Roles.ADMIN,
        recipientId: admin.id,
        title,
        message,
        metadata,
      })
    );
    await Promise.allSettled(promises);
  }

  /**
   * Broadcast notification to all users of a specific role or ALL
   */
  static async broadcastNotification({
    targetRole,
    title,
    message,
    metadata,
  }: {
    targetRole: 'ALL' | 'CUSTOMER' | 'RIDER' | 'ADMIN';
    title: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    if (targetRole === 'ALL' || targetRole === 'CUSTOMER') {
      const customers = await prisma.customer.findMany({ select: { id: true } });
      for (const c of customers) {
        await this.sendNotification({ role: Roles.CUSTOMER, recipientId: c.id, title, message, metadata });
      }
    }

    if (targetRole === 'ALL' || targetRole === 'RIDER') {
      const riders = await prisma.rider.findMany({ select: { id: true } });
      for (const r of riders) {
        await this.sendNotification({ role: Roles.RIDER, recipientId: r.id, title, message, metadata });
      }
    }

    if (targetRole === 'ALL' || targetRole === 'ADMIN') {
      const admins = await prisma.admin.findMany({ select: { id: true } });
      for (const a of admins) {
        await this.sendNotification({ role: Roles.ADMIN, recipientId: a.id, title, message, metadata });
      }
    }
  }

  /**
   * Get user notifications
   */
  static async getUserNotifications(userId: string, role: RoleType, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = { userRole: role };

    if (role === Roles.CUSTOMER) where.customerId = userId;
    else if (role === Roles.RIDER) where.riderId = userId;
    else if (role === Roles.ADMIN) where.adminId = userId;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Mark single notification as read
   */
  static async markAsRead(notificationId: string, userId: string, role: RoleType) {
    const where: any = { id: notificationId, userRole: role };
    if (role === Roles.CUSTOMER) where.customerId = userId;
    else if (role === Roles.RIDER) where.riderId = userId;
    else if (role === Roles.ADMIN) where.adminId = userId;

    return prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read for current user
   */
  static async markAllAsRead(userId: string, role: RoleType) {
    const where: any = { userRole: role, isRead: false };
    if (role === Roles.CUSTOMER) where.customerId = userId;
    else if (role === Roles.RIDER) where.riderId = userId;
    else if (role === Roles.ADMIN) where.adminId = userId;

    return prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
  }

  /**
   * Delete single notification
   */
  static async deleteNotification(notificationId: string, userId: string, role: RoleType) {
    const where: any = { id: notificationId, userRole: role };
    if (role === Roles.CUSTOMER) where.customerId = userId;
    else if (role === Roles.RIDER) where.riderId = userId;
    else if (role === Roles.ADMIN) where.adminId = userId;

    return prisma.notification.deleteMany({
      where,
    });
  }

  /**
   * Clear all notifications for current user
   */
  static async clearAllNotifications(userId: string, role: RoleType) {
    const where: any = { userRole: role };
    if (role === Roles.CUSTOMER) where.customerId = userId;
    else if (role === Roles.RIDER) where.riderId = userId;
    else if (role === Roles.ADMIN) where.adminId = userId;

    return prisma.notification.deleteMany({
      where,
    });
  }
}
