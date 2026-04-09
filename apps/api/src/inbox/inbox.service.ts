import { ChannelType } from "@prisma/client";
import { Injectable } from "@nestjs/common";
import { AiService } from "../ai/ai.service";
import { AnalyticsService } from "../analytics/analytics.service";
import { AssignmentService } from "../assignment/assignment.service";
import { PrismaService } from "../common/prisma.service";
import { FollowUpService } from "../followup/followup.service";
import { NotificationsService } from "../notifications/notifications.service";

interface InboundMessageInput {
  channel: ChannelType;
  conversationExternalId: string;
  senderId: string;
  senderName: string;
  text: string;
}

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly assignmentService: AssignmentService,
    private readonly followUpService: FollowUpService,
    private readonly analyticsService: AnalyticsService,
    private readonly notificationsService: NotificationsService
  ) {}

  async ingestInboundMessage(input: InboundMessageInput) {
    const conversation = await this.prisma.conversation.upsert({
      where: {
        channel_externalId: {
          channel: input.channel,
          externalId: input.conversationExternalId
        }
      },
      update: {},
      create: {
        channel: input.channel,
        externalId: input.conversationExternalId
      }
    });

    const intent = await this.aiService.classifyBuyingIntent(input.text);
    const existingLead = conversation.leadId
      ? await this.prisma.lead.findUnique({ where: { id: conversation.leadId } })
      : null;
    const lead = existingLead
      ? await this.prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            fullName: input.senderName,
            sourceChannel: input.channel,
            buyingIntent: intent.intent,
            score: intent.score,
            status: "QUALIFYING"
          }
        })
      : await this.prisma.lead.create({
          data: {
            fullName: input.senderName,
            sourceChannel: input.channel,
            buyingIntent: intent.intent,
            score: intent.score,
            status: "QUALIFYING"
          }
        });

    if (!conversation.leadId) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadId: lead.id }
      });
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: input.senderId,
        senderName: input.senderName,
        text: input.text,
        isInbound: true,
        aiIntentLabel: intent.intent,
        aiIntentScore: intent.score
      }
    });

    // Lightweight FAQ and qualification auto-reply.
    const autoReplyText = await this.aiService.generateAutoReply(input.text);
    const autoReply = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: "leadflow-ai",
        senderName: "LeadFlow Assistant",
        text: autoReplyText,
        isInbound: false
      }
    });

    const assignee = await this.assignmentService.assignLeadIfNeeded(lead.id);
    if (assignee) {
      await this.followUpService.scheduleInitialFollowUp(lead.id, assignee.id);
      this.notificationsService.notifyUser(assignee.id, "lead-assigned", { leadId: lead.id, message: input.text });
    }

    await this.analyticsService.track("INBOUND_MESSAGE_INGESTED", assignee?.id, lead.id, {
      conversationId: conversation.id,
      channel: input.channel,
      intent: intent.intent
    });

    return { conversation, lead, message, autoReply, intent, assignee };
  }

  async listInbox() {
    return this.prisma.conversation.findMany({
      include: {
        lead: true,
        messages: { take: 1, orderBy: { createdAt: "desc" } }
      },
      orderBy: { updatedAt: "desc" }
    });
  }
}
