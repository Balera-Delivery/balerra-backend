import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { AdminService } from '../services/admin.service';
import { DeliveryService } from '../services/delivery.service';
import { AuthService } from '../services/auth.service';
import { ReportService } from '../services/report.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { Roles } from '../constants/roles';

export class AdminController {
  /**
   * Dashboard Statistics
   */
  static async getDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const stats = await AdminService.getDashboardStats();
      sendSuccess({ res, message: 'Admin dashboard overview loaded.', data: stats });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Customer Management
   */
  static async getCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { search, status } = req.query;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await AdminService.getCustomers({
        search: search as string,
        status: status as any,
        page,
        limit,
      });

      sendSuccess({ res, message: 'Customers retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async createCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customer = await AdminService.createCustomer(req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Customer account created by admin.',
        data: customer,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getCustomerById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const customer = await AdminService.getCustomerById(customerId);
      sendSuccess({ res, message: 'Customer details retrieved.', data: customer });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async updateCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const customer = await AdminService.updateCustomer(customerId, req.body);
      sendSuccess({ res, message: 'Customer updated successfully.', data: customer });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async setCustomerStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const { status } = req.body;
      const result = await AdminService.setCustomerStatus(customerId, status);
      sendSuccess({ res, message: `Customer account status updated to ${status}.`, data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Rider Management
   */
  static async getRiders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { search, accountStatus, availabilityStatus } = req.query;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await AdminService.getRiders({
        search: search as string,
        accountStatus: accountStatus as any,
        availabilityStatus: availabilityStatus as any,
        page,
        limit,
      });

      sendSuccess({ res, message: 'Riders retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async createRider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const rider = await AdminService.createRider(req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Rider account created successfully by admin.',
        data: rider,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getRiderById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const rider = await AdminService.getRiderById(riderId);
      sendSuccess({ res, message: 'Rider details retrieved.', data: rider });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async approveRider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const rider = await AdminService.approveRider(riderId);
      sendSuccess({ res, message: 'Rider application approved. Account is now active.', data: rider });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async setRiderStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const { status } = req.body;
      const result = await AdminService.setRiderStatus(riderId, status);
      sendSuccess({ res, message: `Rider account status updated to ${status}.`, data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updateRider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const rider = await AdminService.updateRider(riderId, req.body);
      sendSuccess({ res, message: 'Rider updated successfully.', data: rider });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async setRiderAvailability(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const status = String(req.body?.status || '').toUpperCase();
      if (status !== 'ONLINE' && status !== 'OFFLINE') {
        throw new Error('Status must be ONLINE or OFFLINE.');
      }
      const rider = await AdminService.setRiderAvailability(riderId, status);
      sendSuccess({ res, message: `Rider is now ${status === 'ONLINE' ? 'online' : 'offline'}.`, data: rider });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async resetRiderPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const password = String(req.body?.password || '');
      if (password.length < 6) throw new Error('Password must be at least 6 characters.');
      await AdminService.resetRiderPassword(riderId, password);
      sendSuccess({ res, message: 'Rider password updated.', data: { id: riderId } });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async toggleRiderDeactivation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const { isDeactivated } = req.body;
      const rider = await AdminService.toggleRiderDeactivation(riderId, Boolean(isDeactivated));
      sendSuccess({
        res,
        message: `Rider ${isDeactivated ? 'deactivated' : 'reactivated'} successfully.`,
        data: rider,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async deleteRider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const result = await AdminService.softDeleteRider(riderId);
      sendSuccess({
        res,
        message: 'Rider removed successfully. Previous delivery history is preserved.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getRiderPayoutsSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await AdminService.getRiderPayoutsSummary();
      sendSuccess({
        res,
        message: 'Rider payouts summary retrieved.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getPayoutHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await AdminService.getPayoutHistory();
      sendSuccess({ res, message: 'Payout history retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getRiderPaymentHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const result = await AdminService.getRiderPaymentHistory(riderId);
      sendSuccess({
        res,
        message: 'Rider payment history retrieved.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async markRiderPaid(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const riderId = String(req.params.id);
      const { deliveryIds, payoutReference } = req.body;
      const result = await AdminService.markRiderPaid(riderId, deliveryIds, payoutReference);
      sendSuccess({
        res,
        message: `Rider payouts updated. Marked ${result.count} deliveries as paid ($${result.totalAmount}).`,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Delivery Management
   */
  static async getDeliveries(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { customerId, riderId, status, search, startDate, endDate } = req.query;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      const result = await DeliveryService.getDeliveries({
        customerId: customerId as string,
        riderId: riderId as string,
        status: status as any,
        search: search as string,
        startDate: startDate as string,
        endDate: endDate as string,
        page,
        limit,
      });

      sendSuccess({ res, message: 'All deliveries retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getDeliveryById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const deliveryId = String(req.params.id);
      const delivery = await DeliveryService.getDeliveryById(deliveryId);
      sendSuccess({ res, message: 'Delivery details retrieved.', data: delivery });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  static async assignRider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { riderId } = req.body;
      const result = await DeliveryService.assignRider(deliveryId, riderId, adminId);
      sendSuccess({ res, message: 'Rider successfully assigned to delivery.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async reassignRider(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { riderId } = req.body;
      const result = await DeliveryService.assignRider(deliveryId, riderId, adminId);
      sendSuccess({ res, message: 'Rider successfully reassigned to delivery.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async cancelDelivery(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { reason } = req.body;
      const result = await DeliveryService.cancelDelivery(deliveryId, adminId, Roles.ADMIN, reason);
      sendSuccess({ res, message: 'Delivery cancelled successfully by admin.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /** PATCH /admin/deliveries/:id/status: admin moves a delivery forward (support override). */
  static async overrideDeliveryStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const deliveryId = String(req.params.id);
      // Accept "Picked Up" / "On the Way" (admin labels) as well as PICKED_UP / ON_THE_WAY
      const status = String(req.body?.status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
      const notes = typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : undefined;
      const result = await DeliveryService.adminOverrideStatus(deliveryId, adminId, status as any, notes);
      sendSuccess({ res, message: `Delivery status changed to ${status}.`, data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /** DELETE /admin/customers/:id: removes the customer's personal data (orders are kept anonymously). */
  static async deleteCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await AuthService.adminDeleteCustomer(String(req.params.id));
      sendSuccess({ res, message: 'Customer account deleted.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updatePaymentStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const adminId = req.user!.userId;
      const deliveryId = String(req.params.id);
      const { paymentStatus } = req.body;
      const result = await DeliveryService.updatePaymentStatus(deliveryId, paymentStatus, adminId);
      sendSuccess({ res, message: `Payment status updated to ${paymentStatus}.`, data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Reports & Analytics
   */
  static async getReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const period = (req.query.period as any) || 'all';
      const reports = await ReportService.generateReports(period);
      sendSuccess({ res, message: `Operational reports generated for period [${period}].`, data: reports });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getDeliveriesReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { status, startDate, endDate, page, limit } = req.query;
      const report = await AdminService.getDeliveriesReport({
        status: status as any,
        startDate: startDate as string,
        endDate: endDate as string,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });
      sendSuccess({ res, message: 'Deliveries report retrieved.', data: report });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async exportDeliveriesReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { format = 'csv', status, startDate, endDate } = req.query;
      const exportResult = await AdminService.exportDeliveriesReport({
        format: format as any,
        status: status as any,
        startDate: startDate as string,
        endDate: endDate as string,
      });

      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.send(exportResult.data);
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Settings
   */
  static async getSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const settings = await AdminService.getSettings();
      sendSuccess({ res, message: 'System settings loaded.', data: settings });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updateSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { key, value } = req.body;
      const setting = await AdminService.setSetting(key, value);
      sendSuccess({ res, message: `Setting "${key}" updated successfully.`, data: setting });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getPaymentSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const settings = await AdminService.getPaymentSettings();
      sendSuccess({ res, message: 'Payment settings loaded.', data: settings });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async updatePaymentSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const settings = await AdminService.updatePaymentSettings(req.body);
      sendSuccess({ res, message: 'Payment settings updated successfully.', data: settings });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Proximity / Map Operations
   */
  static async getNearbyRiders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { pickupLat, pickupLng, deliveryId, radiusKm } = req.query;
      const result = await AdminService.getNearbyRiders({
        pickupLat: pickupLat ? parseFloat(pickupLat as string) : undefined,
        pickupLng: pickupLng ? parseFloat(pickupLng as string) : undefined,
        deliveryId: deliveryId as string,
        radiusKm: radiusKm ? parseFloat(radiusKm as string) : undefined,
      });
      sendSuccess({ res, message: 'Nearby online riders retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  static async getLiveMap(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await AdminService.getLiveMapData();
      sendSuccess({ res, message: 'Live fleet map data retrieved.', data: result });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }
}
