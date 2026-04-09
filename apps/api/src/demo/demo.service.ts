import { Injectable } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../common/prisma.service";
import { InboxService } from "../inbox/inbox.service";

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxService: InboxService
  ) {}

  async seedDemoData() {
    const enabled = (process.env.DEMO_MODE ?? "true") === "true";
    if (!enabled) {
      return { enabled: false, seeded: false };
    }

    const existing = await this.prisma.user.count();
    if (existing > 0) {
      return { enabled: true, seeded: false };
    }

    const passwordHash = await bcrypt.hash("leadflow123", 10);
    const [admin, manager, rep1, rep2] = await Promise.all([
      this.prisma.user.create({
        data: { email: "admin@leadflow.demo", fullName: "Avery Admin", role: "ADMIN", passwordHash }
      }),
      this.prisma.user.create({
        data: { email: "manager@leadflow.demo", fullName: "Maya Manager", role: "MANAGER", passwordHash }
      }),
      this.prisma.user.create({
        data: { email: "alex@leadflow.demo", fullName: "Alex Sales", role: "SALESPERSON", passwordHash }
      }),
      this.prisma.user.create({
        data: { email: "jordan@leadflow.demo", fullName: "Jordan Sales", role: "SALESPERSON", passwordHash }
      })
    ]);

    await this.inboxService.ingestInboundMessage({
      channel: "INSTAGRAM",
      conversationExternalId: "ig-001",
      senderId: "ig-user-1",
      senderName: "Nina Carter",
      text: "Can I buy this package today? What is the price?"
    });
    await this.inboxService.ingestInboundMessage({
      channel: "WHATSAPP",
      conversationExternalId: "wa-001",
      senderId: "wa-user-1",
      senderName: "Brian Wells",
      text: "Need more info and a quick demo."
    });

    return { enabled: true, seeded: true, users: [admin, manager, rep1, rep2] };
  }
}
