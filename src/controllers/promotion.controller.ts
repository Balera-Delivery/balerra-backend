import { Request, Response } from 'express';
import { PromotionService } from '../services/promotion.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

export class PromotionController {
  /**
   * List all promotions (Admin)
   */
  static async getPromotions(req: Request, res: Response): Promise<void> {
    try {
      const { type, isActive, search } = req.query;
      const promotions = await PromotionService.getPromotions({
        type: type as any,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        search: search as string
      });

      sendSuccess({
        res,
        message: 'Promotions retrieved successfully.',
        data: promotions
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Get promotion by ID
   */
  static async getPromotionById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const promo = await PromotionService.getPromotionById(id);
      sendSuccess({
        res,
        message: 'Promotion retrieved successfully.',
        data: promo
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  /**
   * Create promotion (Admin)
   */
  static async createPromotion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const promo = await PromotionService.createPromotion(req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Promotion campaign created successfully.',
        data: promo
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Update promotion (Admin)
   */
  static async updatePromotion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const promo = await PromotionService.updatePromotion(id, req.body);
      sendSuccess({
        res,
        message: 'Promotion campaign updated successfully.',
        data: promo
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Toggle promotion status (Admin)
   */
  static async toggleStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const promo = await PromotionService.togglePromotionStatus(id);
      sendSuccess({
        res,
        message: `Promotion campaign ${promo.isActive ? 'activated' : 'paused'} successfully.`,
        data: promo
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Delete promotion (Admin)
   */
  static async deletePromotion(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      await PromotionService.deletePromotion(id);
      sendSuccess({ res, message: 'Promotion campaign deleted successfully.' });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Validate promotion code for an order (Customer checkout / Admin order creation)
   */
  static async validatePromotion(req: Request, res: Response): Promise<void> {
    try {
      const { code, orderAmount, deliveryFee, deliveryType, restaurantId, customerId } = req.body;

      if (!code || typeof code !== 'string') {
        sendError({
          res,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Promo code is required.'
        });
        return;
      }

      const result = await PromotionService.validatePromotion({
        code,
        orderAmount: Number(orderAmount) || 0,
        deliveryFee: deliveryFee !== undefined ? Number(deliveryFee) : 60.0,
        deliveryType,
        restaurantId,
        customerId
      });

      if (!result.valid) {
        sendError({
          res,
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: result.message
        });
        return;
      }

      sendSuccess({
        res,
        message: result.message,
        data: result
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }
}
