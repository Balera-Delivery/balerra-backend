import { Router, Request, Response, NextFunction } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticateJwt } from '../middleware/auth.middleware';
import { authorizeRole } from '../middleware/role.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import { Roles } from '../constants/roles';
import { sendNotificationSchema } from '../validations/admin.validation';

const router = Router();

// Base authentication for notification access
router.use(authenticateJwt);

// User notification actions
router.get('/', NotificationController.getNotifications);
router.put('/read-all', NotificationController.markAllAsRead);
router.put('/:id/read', NotificationController.markAsRead);
router.put('/read', (req: Request, res: Response, next: NextFunction) => {
  // Support /read?id=xxx from SRS Chapter 12.7
  const idQuery = (req.query as Record<string, string>).id;
  if (idQuery) {
    req.params.id = idQuery;
    return NotificationController.markAsRead(req as any, res);
  }
  return NotificationController.markAllAsRead(req as any, res);
});

// Admin-only notification dispatch
router.post(
  '/send',
  authorizeRole([Roles.ADMIN]),
  validateRequest(sendNotificationSchema),
  NotificationController.sendNotification
);

export default router;
