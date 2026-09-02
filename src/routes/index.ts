import { Router } from 'express';
import authRoutes from './auth.routes';
import customerRoutes from './customer.routes';
import riderRoutes from './rider.routes';
import adminRoutes from './admin.routes';
import notificationRoutes from './notification.routes';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Balerra Delivery Backend API',
  });
});

// Mounted Routes
router.use('/auth', authRoutes);
router.use('/customer', customerRoutes);
router.use('/rider', riderRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);

export default router;
