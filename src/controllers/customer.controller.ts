import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { CustomerService } from '../services/customer.service';
import { DeliveryService } from '../services/delivery.service';
import { OtpService } from '../services/otp.service';
import { NotificationService } from '../services/notification.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { Roles } from '../constants/roles';

export class CustomerController {
  static async createDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const delivery = await DeliveryService.createDelivery(customerId, req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Delivery request submitted successfully.',
        data: delivery,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getDeliveries(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const status = req.query.status as any;
      const search = req.query.search as string;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await DeliveryService.getDeliveries({
        customerId,
        status,
        search,
        page,
        limit,
      });

      sendSuccess({
        res,
        message: 'Customer deliveries retrieved successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getDeliveryById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const delivery = await DeliveryService.getDeliveryById(deliveryId);

      if (delivery.customerId !== customerId) {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Unauthorized to view this delivery.' });
        return;
      }

      sendSuccess({
        res,
        message: 'Delivery details retrieved successfully.',
        data: delivery,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async getDeliveryOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const delivery = await DeliveryService.getDeliveryById(deliveryId);

      if (delivery.customerId !== customerId) {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Unauthorized to view OTP for this delivery.' });
        return;
      }

      const otp = await OtpService.getDeliveryOtp(deliveryId);
      sendSuccess({
        res,
        message: 'Delivery completion OTP retrieved.',
        data: otp,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async cancelDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { reason } = req.body;
      const result = await DeliveryService.cancelDelivery(deliveryId, customerId, Roles.CUSTOMER, reason);
      sendSuccess({
        res,
        message: 'Delivery request cancelled successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const profile = await CustomerService.getProfile(req.user!.userId);
      sendSuccess({ res, message: 'Customer profile loaded.', data: profile });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const profile = await CustomerService.updateProfile(req.user!.userId, req.body);
      sendSuccess({ res, message: 'Profile updated successfully.', data: profile });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getNotifications(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const result = await NotificationService.getUserNotifications(req.user!.userId, Roles.CUSTOMER, page, limit);
      sendSuccess({ res, message: 'Customer notifications loaded.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async trackDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const delivery = await DeliveryService.getDeliveryById(deliveryId);

      if (delivery.customerId !== customerId) {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Unauthorized to track this delivery.' });
        return;
      }

      const trackingInfo = await DeliveryService.getDeliveryTrackingInfo(deliveryId);
      sendSuccess({
        res,
        message: 'Live tracking data loaded.',
        data: trackingInfo,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async uploadPaymentReceipt(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { receiptUrl, paymentMethod, paymentStatus } = req.body;

      const updated = await DeliveryService.uploadPaymentReceipt(deliveryId, {
        receiptUrl,
        paymentMethod,
        paymentStatus,
        userId: customerId,
      });

      sendSuccess({
        res,
        message: 'Payment receipt uploaded successfully and submitted for verification.',
        data: updated,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }
}
