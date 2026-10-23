import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db/index.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import wardenRoutes from './routes/warden.js';
import { notFound, errorHandler } from './middleware/errors.js';
import { startAlertJob } from './services/alerts.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(',') }));
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Brute-force protection on credential endpoints.
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/register-warden', authLimiter);

  app.use('/api/auth', authRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/warden', wardenRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

import { fileURLToPath } from 'node:url';

// Only start listening when run directly (keeps createApp importable for tests).
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  createApp().listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
    startAlertJob();
  });
}
