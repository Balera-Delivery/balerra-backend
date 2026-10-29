import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { RestaurantController } from '../controllers/restaurant.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { Roles } from '../constants/roles';
import {
  adminCreateCustomerSchema,
  adminCreateRiderSchema,
  adminUpdateCustomerSchema,
  adminUpdateRiderSchema,
  updateAccountStatusSchema,
  updateSystemSettingSchema,
} from '../validations/admin.validation';
import { assignRiderSchema, cancelDeliverySchema } from '../validations/delivery.validation';
import {
  createRestaurantSchema,
  updateRestaurantSchema,
  updateRestaurantPhonesSchema,
  updateRestaurantStatusSchema,
  createFoodItemSchema,
  updateFoodItemSchema,
  toggleFoodAvailabilitySchema,
} from '../validations/restaurant.validation';

const router = Router();

// Guard all admin routes to authenticated ADMIN role
router.use(authenticateJwt, authorizeRole([Roles.ADMIN]));

// Dashboard Overview
router.get('/dashboard', AdminController.getDashboard);

// Customer Management
router.get('/customers', AdminController.getCustomers);
router.post('/customers', validateRequest(adminCreateCustomerSchema), AdminController.createCustomer);
router.get('/customers/:id', AdminController.getCustomerById);
router.put('/customers/:id', validateRequest(adminUpdateCustomerSchema), AdminController.updateCustomer);
router.patch('/customers/:id/status', validateRequest(updateAccountStatusSchema), AdminController.setCustomerStatus);

// Rider Management
router.get('/riders', AdminController.getRiders);
router.get('/riders/nearby', AdminController.getNearbyRiders);
router.get('/riders/payouts', AdminController.getRiderPayoutsSummary);
router.get('/riders/:id/payouts', AdminController.getRiderPaymentHistory);
router.post('/riders/:id/pay', AdminController.markRiderPaid);
router.patch('/riders/:id/deactivate', AdminController.toggleRiderDeactivation);
router.delete('/riders/:id', AdminController.deleteRider);
router.post('/riders', validateRequest(adminCreateRiderSchema), AdminController.createRider);
router.get('/riders/:id', AdminController.getRiderById);
router.patch('/riders/:id/approve', AdminController.approveRider);
router.patch('/riders/:id/status', validateRequest(updateAccountStatusSchema), AdminController.setRiderStatus);
router.put('/riders/:id', validateRequest(adminUpdateRiderSchema), AdminController.updateRider);

// Fleet Live Map
router.get('/map/live', AdminController.getLiveMap);

// Delivery Management
router.get('/deliveries', AdminController.getDeliveries);
router.get('/deliveries/:id', AdminController.getDeliveryById);
router.put('/deliveries/:id/assign', validateRequest(assignRiderSchema), AdminController.assignRider);
router.post('/deliveries/:id/assign', validateRequest(assignRiderSchema), AdminController.assignRider);
router.put('/deliveries/:id/reassign', validateRequest(assignRiderSchema), AdminController.reassignRider);
router.put('/assign-rider', validateRequest(assignRiderSchema), (req, res, next) => {
  // Support /assign-rider?id=xxx
  if (req.query.id) {
    req.params.id = req.query.id as string;
    return AdminController.assignRider(req, res);
  }
  next();
});
router.post('/deliveries/:id/cancel', validateRequest(cancelDeliverySchema), AdminController.cancelDelivery);
router.patch('/deliveries/:id/payment-status', AdminController.updatePaymentStatus);

// Hotels & Restaurants Management
router.get('/restaurants', RestaurantController.getRestaurants);
router.post('/restaurants', validateRequest(createRestaurantSchema), RestaurantController.createRestaurant);
router.get('/restaurants/:id', RestaurantController.getRestaurantById);
router.put('/restaurants/:id', validateRequest(updateRestaurantSchema), RestaurantController.updateRestaurant);
router.patch('/restaurants/:id/status', validateRequest(updateRestaurantStatusSchema), RestaurantController.toggleRestaurantStatus);
router.patch('/restaurants/:id/phones', validateRequest(updateRestaurantPhonesSchema), RestaurantController.updateRestaurantPhones);
router.delete('/restaurants/:id', RestaurantController.deleteRestaurant);

// Restaurant Food Items
router.post('/restaurants/:id/foods', validateRequest(createFoodItemSchema), RestaurantController.addFoodItem);
router.put('/restaurants/foods/:foodId', validateRequest(updateFoodItemSchema), RestaurantController.updateFoodItem);
router.patch('/restaurants/foods/:foodId/availability', validateRequest(toggleFoodAvailabilitySchema), RestaurantController.toggleFoodAvailability);
router.delete('/restaurants/foods/:foodId', RestaurantController.deleteFoodItem);

// Direct Food routes (shortcuts)
router.put('/foods/:foodId', validateRequest(updateFoodItemSchema), RestaurantController.updateFoodItem);
router.patch('/foods/:foodId/availability', validateRequest(toggleFoodAvailabilitySchema), RestaurantController.toggleFoodAvailability);
router.delete('/foods/:foodId', RestaurantController.deleteFoodItem);
router.get('/foods', RestaurantController.getMasterFoods);

// Seed / Sync Default Establishments into Database
router.post('/restaurants/seed-defaults', RestaurantController.seedDefaults);

// Reports
router.get('/reports', AdminController.getReports);
router.get('/reports/deliveries', AdminController.getDeliveriesReport);
router.get('/reports/export', AdminController.exportDeliveriesReport);

// System Settings
router.get('/settings', AdminController.getSettings);
router.put('/settings', validateRequest(updateSystemSettingSchema), AdminController.updateSetting);
router.get('/settings/payment', AdminController.getPaymentSettings);
router.put('/settings/payment', AdminController.updatePaymentSettings);

export default router;
