import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { Roles } from '../constants/roles';
import { createDeliverySchema, cancelDeliverySchema } from '../validations/delivery.validation';
import { updateCustomerProfileSchema } from '../validations/customer.validation';

const router = Router();

// Guard all customer routes to authenticated CUSTOMER role
router.use(authenticateJwt, authorizeRole([Roles.CUSTOMER]));

// Deliveries
router.post('/delivery', validateRequest(createDeliverySchema), CustomerController.createDelivery);
router.post('/deliveries', validateRequest(createDeliverySchema), CustomerController.createDelivery);
router.get('/deliveries', CustomerController.getDeliveries);
router.get('/deliveries/:id', CustomerController.getDeliveryById);
router.get('/deliveries/:id/track', CustomerController.trackDelivery);
router.get('/deliveries/:id/otp', CustomerController.getDeliveryOtp);
router.post('/deliveries/:id/cancel', validateRequest(cancelDeliverySchema), CustomerController.cancelDelivery);

// Profile
router.get('/profile', CustomerController.getProfile);
router.put('/profile', validateRequest(updateCustomerProfileSchema), CustomerController.updateProfile);

// Notifications
router.get('/notifications', CustomerController.getNotifications);

export default router;
