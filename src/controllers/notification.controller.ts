import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { Roles } from '../constants/roles';

export class NotificationController {
  static async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await NotificationService.getUserNotifications(
        req.user!.userId,
        req.user!.role,
        page,
        limit
      );

      sendSuccess({ res, message: 'Notifications retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async markAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const notificationId = String(req.params.id);
      await NotificationService.markAsRead(notificationId, req.user!.userId, req.user!.role);
      sendSuccess({ res, message: 'Notification marked as read.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async markAllAsRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await NotificationService.markAllAsRead(req.user!.userId, req.user!.role);
      sendSuccess({ res, message: 'All notifications marked as read.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async deleteNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const notificationId = String(req.params.id);
      await NotificationService.deleteNotification(notificationId, req.user!.userId, req.user!.role);
      sendSuccess({ res, message: 'Notification deleted successfully.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async clearAllNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await NotificationService.clearAllNotifications(req.user!.userId, req.user!.role);
      sendSuccess({ res, message: 'All notifications cleared successfully.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async sendNotification(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { targetRole, targetUserId, title, message } = req.body;

      if (targetUserId) {
        // Targeted single notification
        const role = targetRole === 'ALL' ? Roles.CUSTOMER : targetRole;
        await NotificationService.sendNotification({
          role,
          recipientId: targetUserId,
          title,
          message,
        });
      } else {
        // Broadcast
        await NotificationService.broadcastNotification({
          targetRole,
          title,
          message,
        });
      }

      sendSuccess({
        res,
        message: 'Notification(s) dispatched successfully.',
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }
}
