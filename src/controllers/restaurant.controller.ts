import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { RestaurantService } from '../services/restaurant.service';
import { sendSuccess, sendError } from '../utils/apiResponse';
import { HttpStatus } from '../constants/httpCodes';

export class RestaurantController {
  // ==========================================
  // ADMIN RESTAURANT & FOOD ACTIONS
  // ==========================================

  /**
   * Get all hotels / restaurants with search, filters & statistics
   */
  static async getRestaurants(req: Request, res: Response): Promise<void> {
    try {
      const { search, category, status } = req.query;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      const result = await RestaurantService.getRestaurants({
        search: search as string,
        category: category as string,
        status: status as string,
        page,
        limit,
      });

      sendSuccess({
        res,
        message: 'Hotels and restaurants retrieved successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Get single restaurant details with foods
   */
  static async getRestaurantById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const restaurant = await RestaurantService.getRestaurantById(id);

      sendSuccess({
        res,
        message: 'Restaurant profile and menu retrieved.',
        data: restaurant,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  /**
   * Create new Hotel / Restaurant
   */
  static async createRestaurant(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const restaurant = await RestaurantService.createRestaurant(req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Hotel / Restaurant registered successfully.',
        data: restaurant,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Update Hotel / Restaurant Details
   */
  static async updateRestaurant(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const updated = await RestaurantService.updateRestaurant(id, req.body);
      sendSuccess({
        res,
        message: 'Hotel / Restaurant updated successfully.',
        data: updated,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Update Hotel contact phone numbers
   */
  static async updateRestaurantPhones(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { phone1, phone2 } = req.body;
      const updated = await RestaurantService.updateRestaurantPhones(id, phone1, phone2);
      sendSuccess({
        res,
        message: 'Hotel contact phone numbers updated.',
        data: updated,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Toggle Hotel status Active / Inactive
   */
  static async toggleRestaurantStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { status } = req.body;
      const updated = await RestaurantService.toggleRestaurantStatus(id, status);
      sendSuccess({
        res,
        message: `Hotel status is now ${updated.status}.`,
        data: updated,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Delete Hotel / Restaurant
   */
  static async deleteRestaurant(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const result = await RestaurantService.deleteRestaurant(id);
      sendSuccess({
        res,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Add food item to restaurant menu
   */
  static async addFoodItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const foodItem = await RestaurantService.addFoodItem(id, req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Food dish added to menu.',
        data: foodItem,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Update food item
   */
  static async updateFoodItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const foodId = String(req.params.foodId);
      const updated = await RestaurantService.updateFoodItem(foodId, req.body);
      sendSuccess({
        res,
        message: 'Food dish updated.',
        data: updated,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Toggle food item availability (In-Stock / Out-of-Stock)
   */
  static async toggleFoodAvailability(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const foodId = String(req.params.foodId);
      const { isAvailable } = req.body;
      const updated = await RestaurantService.toggleFoodAvailability(foodId, isAvailable);
      sendSuccess({
        res,
        message: `Dish is now ${updated.isAvailable ? 'Available (In Stock)' : 'Disabled (Out of Stock)'}.`,
        data: updated,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Delete food item
   */
  static async deleteFoodItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const foodId = String(req.params.foodId);
      const result = await RestaurantService.deleteFoodItem(foodId);
      sendSuccess({
        res,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Master dishes explorer across all establishments
   */
  static async getMasterFoods(req: Request, res: Response): Promise<void> {
    try {
      const { search, restaurantId, category, isAvailable } = req.query;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      const parsedIsAvailable = isAvailable !== undefined ? isAvailable === 'true' : undefined;

      const result = await RestaurantService.getMasterFoods({
        search: search as string,
        restaurantId: restaurantId as string,
        category: category as string,
        isAvailable: parsedIsAvailable,
        page,
        limit,
      });

      sendSuccess({
        res,
        message: 'Master foods list retrieved.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Seed / Sync Default Bale Robe establishments & menus
   */
  static async seedDefaults(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const force = req.query.force === 'true' || req.body?.force === true;
      const result = await RestaurantService.seedDefaults(force);
      sendSuccess({
        res,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  // ==========================================
  // CUSTOMER / PUBLIC RESTAURANT ACTIONS
  // ==========================================

  /**
   * Public & Customer: Browse active partner establishments
   */
  static async getCustomerRestaurants(req: Request, res: Response): Promise<void> {
    try {
      const { search, category, cuisineType } = req.query;
      const restaurants = await RestaurantService.getCustomerRestaurants({
        search: search as string,
        category: category as string,
        cuisineType: cuisineType as string,
      });

      sendSuccess({
        res,
        message: 'Active partner restaurants retrieved.',
        data: restaurants,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Public & Customer: Get restaurant details and full categorized menu
   */
  static async getCustomerRestaurantMenu(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const menuData = await RestaurantService.getCustomerRestaurantMenu(id);
      sendSuccess({
        res,
        message: 'Restaurant menu loaded.',
        data: menuData,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }

  /**
   * Customer: Place a Food Delivery Order
   */
  static async createCustomerFoodOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const result = await RestaurantService.createCustomerFoodOrder(customerId, req.body);
      sendSuccess({
        res,
        statusCode: HttpStatus.CREATED,
        message: 'Food order placed successfully.',
        data: result,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Customer: Get customer's food orders list
   */
  static async getCustomerOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const customerId = req.user!.userId;
      const orders = await RestaurantService.getCustomerOrders(customerId);
      sendSuccess({
        res,
        message: 'Customer food orders retrieved.',
        data: orders,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.BAD_REQUEST, message: error.message });
    }
  }

  /**
   * Customer / Admin: Get specific Food Order details & live delivery tracking
   */
  static async getOrderById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orderId = String(req.params.id);
      // If customer, restrict to customer's own order
      const customerId = req.user!.role === 'CUSTOMER' ? req.user!.userId : undefined;
      const order = await RestaurantService.getOrderById(orderId, customerId);

      sendSuccess({
        res,
        message: 'Food order details retrieved.',
        data: order,
      });
    } catch (error: any) {
      sendError({ res, statusCode: HttpStatus.NOT_FOUND, message: error.message });
    }
  }
}
