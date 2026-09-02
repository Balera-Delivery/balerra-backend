import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
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

// Reports
router.get('/reports', AdminController.getReports);

// System Settings
router.get('/settings', AdminController.getSettings);
router.put('/settings', validateRequest(updateSystemSettingSchema), AdminController.updateSetting);

export default router;
