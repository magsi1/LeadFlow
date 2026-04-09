import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ChannelType } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import { InboxService } from "../inbox/inbox.service";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: InboxService
  ) {}

  verifyWebhook(verifyToken: string) {
    const expected = process.env.META_VERIFY_TOKEN ?? "leadflow-verify-token";
    if (verifyToken !== expected) {
      throw new UnauthorizedException("Invalid verify token");
    }
    return true;
  }

  verifyMetaSignature(signature: string | undefined, rawBody: string) {
    const secret = process.env.META_APP_SECRET;
    if (!secret) {
      throw new UnauthorizedException("META_APP_SECRET not configured");
    }
    this.verifySignatureWithSecret(signature, rawBody, secret);
  }

  verifyWhatsAppSignature(signature: string | undefined, rawBody: string) {
    const secret = process.env.WHATSAPP_APP_SECRET ?? process.env.META_APP_SECRET;
    if (!secret) {
      throw new UnauthorizedException("WHATSAPP_APP_SECRET or META_APP_SECRET not configured");
    }
    this.verifySignatureWithSecret(signature, rawBody, secret);
  }

  async handleMetaMessage(payload: any) {
    const messageText = payload?.message?.text ?? payload?.text ?? "Inbound message";
    const senderName = payload?.from?.name ?? "Meta Contact";
    const senderId = payload?.from?.id ?? "meta-user";
    const conversationExternalId = payload?.conversationId ?? senderId;
    const channel: ChannelType =
      payload?.platform === "instagram" ? "INSTAGRAM" : payload?.platform === "facebook" ? "FACEBOOK" : "FACEBOOK";

    await this.prisma.webhookEvent.create({
      data: {
        channel,
        eventType: "META_MESSAGE",
        payload
      }
    });

    return this.inboxService.ingestInboundMessage({
      channel,
      senderId,
      senderName,
      text: messageText,
      conversationExternalId
    });
  }

  async handleWhatsAppMessage(payload: any) {
    const text = payload?.messages?.[0]?.text?.body ?? payload?.text ?? "WhatsApp message";
    const senderId = payload?.messages?.[0]?.from ?? "wa-user";
    const senderName = payload?.contacts?.[0]?.profile?.name ?? "WhatsApp Contact";
    const conversationExternalId = payload?.conversationId ?? senderId;

    await this.prisma.webhookEvent.create({
      data: {
        channel: "WHATSAPP",
        eventType: "WHATSAPP_MESSAGE",
        payload
      }
    });

    return this.inboxService.ingestInboundMessage({
      channel: "WHATSAPP",
      senderId,
      senderName,
      text,
      conversationExternalId
    });
  }

  async handleWebsiteChat(payload: any) {
    return this.inboxService.ingestInboundMessage({
      channel: "WEBSITE_CHAT",
      senderId: payload.senderId ?? "website-user",
      senderName: payload.senderName ?? "Website Visitor",
      text: payload.text ?? "Website chat message",
      conversationExternalId: payload.sessionId ?? payload.senderId ?? "website-conversation"
    });
  }

  private verifySignatureWithSecret(signatureHeader: string | undefined, rawBody: string, secret: string) {
    if (!signatureHeader?.startsWith("sha256=")) {
      throw new UnauthorizedException("Missing or invalid signature header");
    }

    const provided = signatureHeader.replace("sha256=", "");
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const providedBuffer = Buffer.from(provided, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
  }
}
