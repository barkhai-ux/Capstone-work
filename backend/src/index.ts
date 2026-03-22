import 'dotenv/config';
import { createApp } from './app.js';
import { config, getAbsolutePath } from './config/index.js';
import { duckdbService } from './services/duckdb.service.js';
import { cleanupExpiredPreviews } from './controllers/upload.controller.js';
import logger from './utils/logger.js';
import fs from 'fs';

const ensureDirectories = (): void => {
  const dirs = [config.uploadDir, 'data'];
  for (const dir of dirs) {
    const absPath = getAbsolutePath(dir);
    if (!fs.existsSync(absPath)) {
      fs.mkdirSync(absPath, { recursive: true });
      logger.info(`Created directory: ${absPath}`);
    }
  }
};

const startServer = async (): Promise<void> => {
  try {
    // Ensure required directories exist
    ensureDirectories();

    // Initialize DuckDB
    await duckdbService.initialize();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });

    // Cleanup expired previews every hour
    setInterval(cleanupExpiredPreviews, 60 * 60 * 1000);

    // Graceful shutdown
    const shutdown = async (): Promise<void> => {
      logger.info('Shutting down gracefully...');

      server.close(async () => {
        await duckdbService.close();
        logger.info('Server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.warn('Forcing shutdown...');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
