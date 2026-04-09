import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class AssignmentService {
  constructor(private readonly prisma: PrismaService) {}

  async assignLeadIfNeeded(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.assignedToId) {
      return null;
    }

    const team = await this.prisma.user.findMany({
      where: { role: "SALESPERSON", isActive: true },
      include: { _count: { select: { assignedLeads: true } } },
      orderBy: { createdAt: "asc" }
    });

    if (!team.length) {
      return null;
    }

    team.sort((a, b) => a._count.assignedLeads - b._count.assignedLeads);
    const chosen = team[0];

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assignedToId: chosen.id, status: "ASSIGNED" }
    });

    return chosen;
  }
}
