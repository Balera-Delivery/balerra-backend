import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { Roles } from '../constants/roles';

export class AuthController {
  static async registerCustomer(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.registerCustomer(req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Customer account registered successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async loginCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { identifier, password } = req.body;
      const result = await AuthService.loginCustomer(identifier, password);
      sendSuccess({
        res,
        message: 'Customer logged in successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: error.message });
    }
  }

  static async registerRider(req: Request, res: Response): Promise<void> {
    try {
      const result = await AuthService.registerRider(req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async loginRider(req: Request, res: Response): Promise<void> {
    try {
      const identifier = req.body.phoneNumber || req.body.identifier || req.body.email;
      const { password } = req.body;
      const result = await AuthService.loginRider(identifier, password);
      sendSuccess({
        res,
        message: 'Rider logged in successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: error.message });
    }
  }

  static async sendPhoneOtp(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber } = req.body;
      const result = await AuthService.sendPhoneOtp(phoneNumber);
      sendSuccess({
        res,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async verifyPhoneOtp(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber, code } = req.body;
      const result = await AuthService.verifyPhoneOtp(phoneNumber, code);
      sendSuccess({
        res,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async resetPasswordPhone(req: Request, res: Response): Promise<void> {
    try {
      const { phoneNumber, code, newPassword } = req.body;
      const result = await AuthService.resetPasswordWithOtp(phoneNumber, code, newPassword);
      sendSuccess({
        res,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async loginAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const result = await AuthService.loginAdmin(email, password);
      sendSuccess({
        res,
        message: 'Admin logged in successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: error.message });
    }
  }

  /** POST /auth/admin/refresh: returns a new admin token so an active admin stays signed in. */
  static async refreshAdminToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Authentication required.' });
        return;
      }
      const result = await AuthService.refreshAdminToken(req.user.userId, req.user.role);
      sendSuccess({ res, message: 'Session refreshed.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: error.message });
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Authentication required.' });
        return;
      }
      const result = await AuthService.getMe(req.user.userId, req.user.role);
      sendSuccess({ res, message: 'Current user profile loaded.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  /** POST /auth/account/delete: customer deletes their own account (password required). */
  static async deleteAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Authentication required.' });
        return;
      }
      if (req.user.role !== Roles.CUSTOMER) {
        sendError({ res, statusCode: HttpStatus.FORBIDDEN, message: 'Please contact support to delete this account.' });
        return;
      }
      const result = await AuthService.deleteCustomerAccount(req.user.userId, req.body.password);
      sendSuccess({ res, message: 'Your account has been deleted.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Authentication required.' });
        return;
      }
      const { currentPassword, newPassword } = req.body;
      await AuthService.changePassword(req.user.userId, req.user.role, currentPassword, newPassword);
      sendSuccess({ res, message: 'Password changed successfully.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updateFcmToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        sendError({ res, statusCode: HttpStatus.UNAUTHORIZED, message: 'Authentication required.' });
        return;
      }
      const { fcmToken } = req.body;
      await AuthService.updateFcmToken(req.user.userId, req.user.role, fcmToken);
      sendSuccess({ res, message: 'FCM push token registered successfully.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    // JWT is stateless (the app drops it). Clear this account's push token so the phone stops
    // receiving this user's notifications after logout (important on shared phones).
    try {
      if (req.user) await AuthService.clearFcmToken(req.user.userId, req.user.role);
    } catch (error: any) {
      console.warn('[Logout] Could not clear FCM token:', error.message);
    }
    sendSuccess({ res, message: 'Logged out successfully.' });
  }
}
