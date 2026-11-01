import { Router } from 'express';
import authRoutes from './auth.routes';
import customerRoutes from './customer.routes';
import riderRoutes from './rider.routes';
import adminRoutes from './admin.routes';
import notificationRoutes from './notification.routes';
import promotionRoutes from './promotion.routes';
import { RestaurantController } from '../controllers/restaurant.controller';

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Balerra Delivery Backend API',
  });
});

// Public / Guest Restaurant & Food Menu Discovery
router.get('/restaurants', RestaurantController.getCustomerRestaurants);
router.get('/restaurants/:id', RestaurantController.getCustomerRestaurantMenu);
router.get('/foods', RestaurantController.getMasterFoods);

// Mounted Routes
router.use('/auth', authRoutes);
router.use('/customer', customerRoutes);
router.use('/rider', riderRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/promotions', promotionRoutes);

export default router;
