import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './docs/swagger.json';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

const app: Application = express();

// Security and standard middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI CDN assets to load cleanly
  })
);
app.use(
  cors({
    origin: '*', // Allow all client origins (mobile app & admin dashboard)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-idempotency-key'],
    exposedHeaders: ['X-Cache-Lookup'],
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Swagger UI Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Standalone HTML documentation
app.get('/swagger', (req, res) => {
  res.sendFile(path.resolve(process.cwd(), 'swagger.html'));
});

// Swagger JSON Schema Endpoint
app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDocument);
});

// API Routes mounted on /api and /api/v1 for standard compatibility
app.use('/api/v1', routes);
app.use('/api', routes);

// Welcome Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'Balerra Delivery Management Platform API',
    version: '1.0.0',
    status: 'Running',
    documentation: '/api-docs',
    standaloneSwagger: '/swagger',
    swaggerJson: '/swagger.json',
    health: '/api/v1/health',
  });
});

// 404 & Global Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
