import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisClient, isRedisReady } from '../config/redis';

let io: Server | null = null;

export interface RiderLocationPayload {
  riderId: string;
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  deliveryId?: string;
  timestamp?: string;
}

export interface DeliveryStatusPayload {
  deliveryId: string;
  status: string;
  updatedAt: string;
  rider?: any;
  metadata?: Record<string, any>;
}

export interface AdminNotificationPayload {
  id?: string;
  title: string;
  message: string;
  createdAt: string;
  userRole?: string;
  metadata?: Record<string, any>;
}

/**
 * Initialize Socket.io attached to the Node HTTP Server
 */
export const initSocketServer = async (httpServer: HttpServer): Promise<Server> => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  // Attach Redis Adapter for multi-core PM2 clustering if Redis is reachable
  if (isRedisReady()) {
    try {
      const pubClient = createRedisClient();
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.io] Redis Pub/Sub adapter connected for cluster sync.');
    } catch (err: any) {
      console.warn(`[Socket.io Warning] Could not attach Redis adapter: ${err.message}. Running in single-node mode.`);
    }
  } else {
    console.log('[Socket.io] Initialized in standalone in-memory mode.');
  }

  // Socket connection handlers
  io.on('connection', (socket: Socket) => {
    // 1. Admin joins the admin monitoring room
    socket.on('admin:join', () => {
      socket.join('room:admin');
      console.log(`[Socket.io] Admin joined room:admin (socket ${socket.id})`);
    });

    // 2. Rider streams live GPS coordinates
    socket.on('rider:location:update', (data: RiderLocationPayload) => {
      if (!data || !data.riderId || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') {
        return;
      }

      const timestamp = data.timestamp || new Date().toISOString();
      const payload: RiderLocationPayload = { ...data, timestamp };

      // Broadcast live position to the Admin Live Map
      io?.to('room:admin').emit('admin:rider:location', payload);

      // If rider is currently fulfilling an active delivery, stream directly to customer tracking screen
      if (data.deliveryId) {
        io?.to(`room:delivery:${data.deliveryId}`).emit('customer:rider:location', payload);
      }
    });

    // 3. Customer or Rider joins specific delivery tracking room
    socket.on('delivery:track:join', ({ deliveryId }: { deliveryId: string }) => {
      if (deliveryId) {
        const roomName = `room:delivery:${deliveryId}`;
        socket.join(roomName);
        console.log(`[Socket.io] Socket ${socket.id} joined tracking room: ${roomName}`);
      }
    });

    // 4. Leave tracking room
    socket.on('delivery:track:leave', ({ deliveryId }: { deliveryId: string }) => {
      if (deliveryId) {
        socket.leave(`room:delivery:${deliveryId}`);
      }
    });

    socket.on('disconnect', (reason) => {
      // Clean disconnect
    });
  });

  return io;
};

/**
 * Access the active Socket.io singleton instance
 */
export const getIO = (): Server | null => io;

/**
 * Broadcast delivery status update to customer and admin
 */
export const broadcastDeliveryStatus = (payload: DeliveryStatusPayload): void => {
  if (!io) return;
  // Notify customer tracking room
  io.to(`room:delivery:${payload.deliveryId}`).emit('delivery:status:changed', payload);
  // Notify admin dashboard
  io.to('room:admin').emit('admin:delivery:update', payload);
};

/**
 * Broadcast live notification to admin dashboard
 */
export const broadcastAdminNotification = (payload: AdminNotificationPayload): void => {
  if (!io) return;
  io.to('room:admin').emit('admin:notification', payload);
};
