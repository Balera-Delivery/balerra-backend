import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate.middleware';
import { authenticateJwt } from '../middleware/auth.middleware';
import {
  customerRegisterSchema,
  customerLoginSchema,
  riderRegisterSchema,
  riderLoginSchema,
  adminLoginSchema,
  changePasswordSchema,
  updateFcmTokenSchema,
  sendPhoneOtpSchema,
  verifyPhoneOtpSchema,
  resetPasswordPhoneSchema,
} from '../validations/auth.validation';

const router = Router();

// Phone OTP verification & Password Reset (for Riders and Customers)
router.post('/phone/send-otp', validateRequest(sendPhoneOtpSchema), AuthController.sendPhoneOtp);
router.post('/phone/verify-otp', validateRequest(verifyPhoneOtpSchema), AuthController.verifyPhoneOtp);
router.post('/phone/reset-password', validateRequest(resetPasswordPhoneSchema), AuthController.resetPasswordPhone);

// Customer Auth
router.post('/register', validateRequest(customerRegisterSchema), AuthController.registerCustomer);
router.post('/customer/register', validateRequest(customerRegisterSchema), AuthController.registerCustomer);
router.post('/login', validateRequest(customerLoginSchema), AuthController.loginCustomer);
router.post('/customer/login', validateRequest(customerLoginSchema), AuthController.loginCustomer);

// Rider Auth
router.post('/rider/register', validateRequest(riderRegisterSchema), AuthController.registerRider);
router.post('/rider/login', validateRequest(riderLoginSchema), AuthController.loginRider);

// Admin Auth
router.post('/admin/login', validateRequest(adminLoginSchema), AuthController.loginAdmin);

// Common Authenticated User Endpoints
router.get('/me', authenticateJwt, AuthController.getMe);
router.post('/logout', authenticateJwt, AuthController.logout);
router.put('/change-password', authenticateJwt, validateRequest(changePasswordSchema), AuthController.changePassword);
router.put('/fcm-token', authenticateJwt, validateRequest(updateFcmTokenSchema), AuthController.updateFcmToken);

export default router;
