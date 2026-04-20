import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { config } from './config/index.js';
import logger from './utils/logger.js';

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS configuration — FRONTEND_URL may be a comma-separated list of origins.
  const allowedOrigins =
    config.nodeEnv === 'development'
      ? ['http://localhost:5173', 'http://localhost:3001']
      : (process.env.FRONTEND_URL ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);

  if (config.nodeEnv !== 'development' && allowedOrigins.length === 0) {
    logger.warn('FRONTEND_URL is not set — cross-origin browser requests will fail.');
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true); // curl, server-to-server
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Rate limiting
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many upload requests, please try again later.' },
  });

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many AI requests, please try again later.' },
  });

  app.use('/api', generalLimiter);
  app.use('/api/v1/upload', uploadLimiter);
  app.use('/api/v1/chart', aiLimiter);
  app.use('/api/v1/query', aiLimiter);
  app.use('/api/v1/star-schema/analyze', aiLimiter);
  app.use('/api/v1/normalization/analyze', aiLimiter);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use('/api/v1', routes);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
};
