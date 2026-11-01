import { Router } from 'express';
import { RiderController } from '../controllers/rider.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { idempotencyMiddleware } from '../middleware/idempotency.middleware';
import { Roles } from '../constants/roles';
import {
  updateRiderProfileSchema,
  updateRiderStatusSchema,
  updateRiderLocationSchema,
} from '../validations/rider.validation';
import { updateDeliveryStatusSchema, verifyOtpSchema } from '../validations/delivery.validation';

const router = Router();

// Guard all rider routes to authenticated RIDER role
router.use(authenticateJwt, authorizeRole([Roles.RIDER]));

// Status & Availability
router.put('/status', validateRequest(updateRiderStatusSchema), RiderController.updateAvailability);

// GPS Live Location Updates (called periodically by mobile app)
router.put('/location', validateRequest(updateRiderLocationSchema), RiderController.updateLocation);

// Assigned Deliveries & Actions
router.get('/assigned', RiderController.getAssignedDeliveries);
router.get('/active', RiderController.getActiveDelivery);
router.post('/deliveries/:id/accept', idempotencyMiddleware('rider_accept'), RiderController.acceptDelivery);
router.post('/deliveries/:id/reject', RiderController.rejectDelivery);
router.put('/deliveries/:id/status', validateRequest(updateDeliveryStatusSchema), RiderController.updateDeliveryStatus);
router.put('/delivery-status', validateRequest(updateDeliveryStatusSchema), (req, res, next) => {
  // Support both /delivery-status?id=xxx or /deliveries/:id/status
  if (req.query.id) {
    req.params.id = req.query.id as string;
    return RiderController.updateDeliveryStatus(req, res);
  }
  next();
});

// OTP Verification to complete delivery
router.post('/deliveries/:id/verify-otp', idempotencyMiddleware('rider_verify'), validateRequest(verifyOtpSchema), RiderController.verifyOtp);
router.post('/verify-otp', idempotencyMiddleware('rider_verify'), validateRequest(verifyOtpSchema), (req, res, next) => {
  // Support both /verify-otp?id=xxx or /deliveries/:id/verify-otp
  if (req.query.id) {
    req.params.id = req.query.id as string;
    return RiderController.verifyOtp(req, res);
  }
  next();
});

// QR Code Verification to complete delivery
router.post('/deliveries/:id/verify-qr', idempotencyMiddleware('rider_verify'), RiderController.verifyQr);
router.post('/verify-qr', idempotencyMiddleware('rider_verify'), (req, res, next) => {
  if (req.query.id) {
    (req.params as any).id = req.query.id as string;
    return RiderController.verifyQr(req, res);
  }
  next();
});

// Earnings Summary
router.get('/earnings', RiderController.getEarnings);

// Delivery History
router.get('/history', RiderController.getDeliveryHistory);

// Profile
router.get('/profile', RiderController.getProfile);
router.put('/profile', validateRequest(updateRiderProfileSchema), RiderController.updateProfile);

// Notifications
router.get('/notifications', RiderController.getNotifications);

export default router;
