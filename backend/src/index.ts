import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
dotenv.config();

console.log('ENV CHECK:', {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN ? 'loaded' : 'missing',
});
if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
  console.warn('⚠️ Missing WhatsApp environment variables');
}
console.log('WhatsApp Auto Reply Ready ✅');

const PORT = process.env.PORT || 8080;

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const bootstrap = async (): Promise<void> => {
  const [{ buildApp }, { env }, { logger }, { testSupabaseConnection }] =
    await Promise.all([
      import('./app.js'),
      import('./lib/env.js'),
      import('./lib/logger.js'),
      import('./lib/supabaseAdmin.js'),
    ]);

  const app = buildApp();
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  }));
  app.options('*', cors());
  app.use(express.json());

  const startServer = (port: number | string, retryCount = 0): void => {
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      logger.info('LeadFlow webhook backend started', {
        port,
        api_base_url: env.apiBaseUrl,
      });
      void (async () => {
        await testSupabaseConnection();
      })();
    });

    server.on('error', (error) => {
      const errorObj = error as NodeJS.ErrnoException;
      if (errorObj.code === 'EADDRINUSE' && retryCount < 10) {
        const fallbackPort = Number(port) + 1;
        logger.warn('Port is in use, retrying on fallback port', {
          requested_port: port,
          fallback_port: fallbackPort,
        });
        startServer(fallbackPort, retryCount + 1);
        return;
      }

      logger.error('Backend server failed to start', {
        port,
        error: errorObj.message,
      });
    });
  };

  startServer(PORT);
};

void bootstrap();
