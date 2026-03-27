import { Router } from 'express';

import {
  handleMetaWebhook,
  verifyMetaWebhook,
} from '../controllers/metaWebhookController.js';
import {
  handleWhatsAppWebhook,
  verifyWhatsAppWebhook,
} from '../controllers/whatsappWebhookController.js';
import { handleLeadIntakeWebhook } from '../controllers/leadIntakeWebhookController.js';

export const webhooksRouter = Router();

webhooksRouter.get('/meta', verifyMetaWebhook);
webhooksRouter.post('/meta', handleMetaWebhook);
webhooksRouter.get('/whatsapp', verifyWhatsAppWebhook);
webhooksRouter.post('/whatsapp', handleWhatsAppWebhook);
webhooksRouter.post('/lead', handleLeadIntakeWebhook);
