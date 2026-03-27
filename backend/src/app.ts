import express, { type Request } from 'express';
import cors from 'cors';

import { analyticsRouter } from './routes/analytics.js';
import {
  handleMetaWebhook,
  verifyMetaWebhook,
} from './controllers/metaWebhookController.js';
import { integrationsRouter } from './routes/integrations.js';
import { leadsRouter } from './routes/leads.js';
import { messagesRouter } from './routes/messages.js';
import { webhooksRouter } from './routes/webhooks.js';
import { workspacesRouter } from './routes/workspaces.js';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

export function buildApp() {
  const app = express();

  app.use(
    express.json({
      verify: (req: Request, _res: unknown, buf: Buffer) => {
        req.rawBody = Buffer.from(buf);
      },
      limit: '1mb',
    }),
  );

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
    }),
  );

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Meta Lead Ads webhook shortcut path (in addition to /webhooks/meta).
  app.get('/meta-webhook', verifyMetaWebhook);
  app.post('/meta-webhook', handleMetaWebhook);

  app.get('/', (_req, res) => {
    res.status(200).send('API is running');
  });

  app.use('/analytics', analyticsRouter);
  app.use('/webhooks', webhooksRouter);
  app.use('/webhook', webhooksRouter);
  // Same leads router: clients may use `/leads` or `/api/leads` (no behavior difference).
  app.use('/api/leads', leadsRouter);
  app.use('/leads', leadsRouter);
  app.use('/api/integrations', integrationsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/workspaces', workspacesRouter);

  return app;
}
