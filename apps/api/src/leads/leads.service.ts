import { Injectable } from "@nestjs/common";
import { LeadStatus } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: LeadStatus) {
    return this.prisma.lead.findMany({
      where: status ? { status } : undefined,
      include: { assignedTo: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async updateStatus(leadId: string, status: LeadStatus) {
    return this.prisma.lead.update({
      where: { id: leadId },
      data: { status }
    });
  }
}
