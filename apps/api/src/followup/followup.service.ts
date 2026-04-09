import { Injectable, OnModuleInit } from "@nestjs/common";
import { Job, Queue, Worker } from "bullmq";
import { PrismaService } from "../common/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class FollowUpService implements OnModuleInit {
  private queue!: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService
  ) {}

  onModuleInit() {
    const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
    const connection = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined
    };

    this.queue = new Queue("followup-reminders", { connection });

    new Worker(
      "followup-reminders",
      async (job: Job<{ followUpId: string; ownerId: string; leadId: string }>) => {
        const followUp = await this.prisma.followUp.findUnique({ where: { id: job.data.followUpId } });
        if (!followUp || followUp.completedAt) {
          return;
        }
        await this.prisma.followUp.update({
          where: { id: followUp.id },
          data: { reminderSentAt: new Date() }
        });
        this.notificationsService.notifyUser(job.data.ownerId, "followup-reminder", {
          leadId: job.data.leadId,
          followUpId: followUp.id
        });
      },
      { connection }
    );
  }

  async scheduleInitialFollowUp(leadId: string, ownerId: string) {
    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const followUp = await this.prisma.followUp.create({
      data: {
        leadId,
        ownerId,
        dueAt,
        note: "Initial follow-up after assignment."
      }
    });

    await this.queue.add(
      "send-reminder",
      { followUpId: followUp.id, ownerId, leadId },
      {
        delay: Math.max(5000, dueAt.getTime() - Date.now())
      }
    );

    return followUp;
  }

  async listMyFollowUps(ownerId: string) {
    return this.prisma.followUp.findMany({
      where: { ownerId },
      include: { lead: true },
      orderBy: { dueAt: "asc" }
    });
  }
}
