import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) { }

  async track(eventType: string, actorUserId?: string, leadId?: string, metadata?: unknown) {
    return this.prisma.analyticsEvent.create({
      data: {
        eventType,
        actorUserId,
        leadId,
        metadata: metadata as object | undefined
      }
    });
  }

  async dashboard() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [totalLeads, hotLeads, wonLeads, lostLeads, followUpsDue, leadsToday] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { buyingIntent: "HOT" } }),
      this.prisma.lead.count({ where: { status: "WON" } }),
      this.prisma.lead.count({ where: { status: "LOST" } }),
      this.prisma.followUp.count({ where: { completedAt: null, dueAt: { lte: new Date() } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: startOfToday } } }),
    ]);

    const closed = wonLeads + lostLeads;
    const conversionRate =
      closed > 0 ? Number(((wonLeads / closed) * 100).toFixed(2)) : null;

    return {
      totals: { totalLeads, hotLeads, wonLeads, followUpsDue, leadsToday },
      conversionRate,
    };
  }
}
