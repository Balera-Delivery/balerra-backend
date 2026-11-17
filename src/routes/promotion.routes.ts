import { Router } from 'express';
import { PromotionController } from '../controllers/promotion.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { Roles } from '../constants/roles';

const router = Router();

// Public / Customer validation route
router.post('/validate', PromotionController.validatePromotion);

// Public / discovery of active promotions
router.get('/', PromotionController.getPromotions);
router.get('/:id', PromotionController.getPromotionById);

// Admin-only management endpoints
router.post('/', authenticateJwt, authorizeRole([Roles.ADMIN]), PromotionController.createPromotion);
router.put('/:id', authenticateJwt, authorizeRole([Roles.ADMIN]), PromotionController.updatePromotion);
router.patch('/:id/toggle', authenticateJwt, authorizeRole([Roles.ADMIN]), PromotionController.toggleStatus);
router.delete('/:id', authenticateJwt, authorizeRole([Roles.ADMIN]), PromotionController.deletePromotion);

export default router;
