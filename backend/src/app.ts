import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { issuesRouter } from './routes/issues';
import { adminRouter } from './routes/admin';
import { JiraApiError } from './lib/jira';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.APP_ORIGIN ?? true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/issues', issuesRouter);
  app.use('/api/admin', adminRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof JiraApiError) {
      const status = err.status === 404 ? 404 : 502;
      res.status(status).json({ error: 'Erreur Jira', details: err.message });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Erreur interne' });
  });

  return app;
}
