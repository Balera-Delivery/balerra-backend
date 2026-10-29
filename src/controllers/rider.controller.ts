import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { RiderService } from '../services/rider.service';
import { DeliveryService } from '../services/delivery.service';
import { NotificationService } from '../services/notification.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { Roles } from '../constants/roles';

export class RiderController {
  static async getAssignedDeliveries(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const deliveries = await RiderService.getAssignedDeliveries(riderId);
      sendSuccess({
        res,
        message: 'Assigned deliveries retrieved successfully.',
        data: deliveries,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getActiveDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const delivery = await RiderService.getActiveDelivery(riderId);
      sendSuccess({
        res,
        message: 'Active delivery retrieved successfully.',
        data: delivery || null,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updateAvailability(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const { status } = req.body;
      const result = await RiderService.updateAvailability(riderId, status);
      sendSuccess({
        res,
        message: `Rider availability status changed to ${status}.`,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async acceptDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const result = await DeliveryService.acceptDelivery(deliveryId, riderId);
      sendSuccess({
        res,
        message: 'Delivery assignment accepted.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async rejectDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { reason } = req.body;
      const result = await DeliveryService.rejectDelivery(deliveryId, riderId, reason);
      sendSuccess({
        res,
        message: 'Delivery assignment rejected.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updateDeliveryStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { status, notes } = req.body;
      const result = await DeliveryService.updateRiderDeliveryStatus(deliveryId, riderId, status, notes);
      sendSuccess({
        res,
        message: `Delivery status updated to ${status}.`,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async verifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { otpCode } = req.body;
      const result = await DeliveryService.completeDeliveryWithOtp(deliveryId, riderId, otpCode);
      sendSuccess({
        res,
        message: 'OTP verified successfully. Delivery completed! 🎉',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async verifyQr(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { qrCodeToken } = req.body;
      const result = await DeliveryService.completeDeliveryWithQr(deliveryId, riderId, qrCodeToken);
      sendSuccess({
        res,
        message: 'QR code verified successfully. Delivery completed! 🎉',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getEarnings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const result = await RiderService.getEarningsSummary(riderId);
      sendSuccess({
        res,
        message: 'Rider earnings summary loaded.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getDeliveryHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await RiderService.getDeliveryHistory(riderId, page, limit);
      sendSuccess({
        res,
        message: 'Rider delivery history loaded.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const profile = await RiderService.getProfile(req.user!.userId);
      sendSuccess({ res, message: 'Rider profile loaded.', data: profile });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const profile = await RiderService.updateProfile(req.user!.userId, req.body);
      sendSuccess({ res, message: 'Profile updated successfully.', data: profile });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const result = await NotificationService.getUserNotifications(req.user!.userId, Roles.RIDER, page, limit);
      sendSuccess({ res, message: 'Rider notifications loaded.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updateLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = req.user!.userId;
      const { latitude, longitude, heading } = req.body;
      const result = await RiderService.updateLocation(riderId, latitude, longitude, heading);
      sendSuccess({ res, message: 'Rider GPS coordinates updated successfully.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }
}
