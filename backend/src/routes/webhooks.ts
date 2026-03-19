import { Router } from 'express';

import {
  handleMetaWebhook,
  verifyMetaWebhook,
} from '../controllers/metaWebhookController.js';
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhook,
} from '../controllers/whatsappWebhookController.js';

export const webhooksRouter = Router();

webhooksRouter.get('/meta', verifyMetaWebhook);
webhooksRouter.post('/meta', handleMetaWebhook);
webhooksRouter.get('/whatsapp', verifyWhatsAppWebhook);
webhooksRouter.post('/whatsapp', handleWhatsAppWebhook);
