import app from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';

const startServer = async () => {
  try {
    // Verify database connection
    await prisma.$connect();
    console.log('[PostgreSQL] Database connection established successfully via Prisma.');

    const PORT = env.PORT;
    const server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Balerra Delivery Backend API is running!`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`🌱 Environment: ${env.NODE_ENV}`);
      console.log(`====================================================`);
    });

    // Graceful Shutdown handling
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[Shutdown] Received ${signal}. Closing server gracefully...`);
      server.close(async () => {
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
