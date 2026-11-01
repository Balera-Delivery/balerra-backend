import http from 'http';
import app from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { initRedis, closeRedis } from './config/redis';
import { startAllWorkers, closeAllWorkers } from './workers';
import { initSocketServer, getIO } from './socket';

const startServer = async () => {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('[PostgreSQL] Database connection established successfully via Prisma.');

    // Initialize Redis (with graceful fallback if not reachable)
    await initRedis();

    // Start background BullMQ queue workers
    startAllWorkers();

    // Create standard HTTP server and attach Socket.io
    const httpServer = http.createServer(app);
    await initSocketServer(httpServer);

    const PORT = env.PORT;
    const server = httpServer.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Balerra Delivery Backend API is running!`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`⚡ WebSockets: ws://localhost:${PORT}`);
      console.log(`🌱 Environment: ${env.NODE_ENV}`);
      console.log(`====================================================`);
    });

    // Graceful Shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[Shutdown] Received ${signal}. Closing server gracefully...`);
      const io = getIO();
      if (io) {
        io.close();
      }
      server.close(async () => {
        await closeAllWorkers();
        await closeRedis();
        await prisma.$disconnect();
        console.log('[PostgreSQL] Prisma disconnected. Process exiting.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('[Server Error] Failed to start backend server:', error);
    process.exit(1);
  }
};

startServer();
