import { Body, Controller, Get, Headers, Post, Query, Req } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get("meta/webhook")
  verifyMetaWebhook(
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string
  ) {
    this.integrationsService.verifyWebhook(token);
    return challenge;
  }

  @Post("meta/webhook")
  handleMetaWebhook(
    @Body() payload: any,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Req() req: { rawBody?: string }
  ) {
    this.integrationsService.verifyMetaSignature(signature, req.rawBody ?? JSON.stringify(payload));
    return this.integrationsService.handleMetaMessage(payload);
  }

  @Post("whatsapp/webhook")
  handleWhatsAppWebhook(
    @Body() payload: any,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Req() req: { rawBody?: string }
  ) {
    this.integrationsService.verifyWhatsAppSignature(signature, req.rawBody ?? JSON.stringify(payload));
    return this.integrationsService.handleWhatsAppMessage(payload);
  }

  @Post("website-chat/webhook")
  handleWebsiteChatWebhook(@Body() payload: any) {
    return this.integrationsService.handleWebsiteChat(payload);
  }
}
