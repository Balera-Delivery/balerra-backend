import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { RestaurantController } from '../controllers/restaurant.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { Roles } from '../constants/roles';
import { createDeliverySchema, cancelDeliverySchema, uploadPaymentReceiptSchema } from '../validations/delivery.validation';
import { updateCustomerProfileSchema } from '../validations/customer.validation';
import { createFoodOrderSchema } from '../validations/restaurant.validation';

const router = Router();

// Guard all customer routes to authenticated CUSTOMER role
router.use(authenticateJwt, authorizeRole([Roles.CUSTOMER]));

// Food Ordering & Restaurant Browsing for Authenticated Customer
router.get('/restaurants', RestaurantController.getCustomerRestaurants);
router.get('/restaurants/:id', RestaurantController.getCustomerRestaurantMenu);
router.get('/foods', RestaurantController.getMasterFoods);

// Customer Food Orders
router.post('/orders', validateRequest(createFoodOrderSchema), RestaurantController.createCustomerFoodOrder);
router.get('/orders', RestaurantController.getCustomerOrders);
router.get('/orders/:id', RestaurantController.getOrderById);

// Deliveries
router.post('/delivery', validateRequest(createDeliverySchema), CustomerController.createDelivery);
router.post('/deliveries', validateRequest(createDeliverySchema), CustomerController.createDelivery);
router.get('/deliveries', CustomerController.getDeliveries);
router.get('/deliveries/:id', CustomerController.getDeliveryById);
router.get('/deliveries/:id/track', CustomerController.trackDelivery);
router.get('/deliveries/:id/otp', CustomerController.getDeliveryOtp);
router.post('/deliveries/:id/cancel', validateRequest(cancelDeliverySchema), CustomerController.cancelDelivery);
router.post('/deliveries/:id/payment', validateRequest(uploadPaymentReceiptSchema), CustomerController.uploadPaymentReceipt);
router.post('/deliveries/:id/receipt', validateRequest(uploadPaymentReceiptSchema), CustomerController.uploadPaymentReceipt);

// Profile
router.get('/profile', CustomerController.getProfile);
router.put('/profile', validateRequest(updateCustomerProfileSchema), CustomerController.updateProfile);

// Notifications
router.get('/notifications', CustomerController.getNotifications);

export default router;
