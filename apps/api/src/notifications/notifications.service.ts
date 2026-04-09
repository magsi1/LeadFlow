import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Expo, ExpoPushMessage } from "expo-server-sdk";
import { Server } from "socket.io";
import { PrismaService } from "../common/prisma.service";
import { RegisterPushTokenDto } from "./dto/register-push-token.dto";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private io: Server | null = null;
  private readonly expo = new Expo();

  constructor(private readonly prisma: PrismaService) {}

  bindGateway(io: Server) {
    this.io = io;
  }

  notifyUser(userId: string, event: string, payload: unknown) {
    this.io?.to(`user:${userId}`).emit(event, payload);
    this.sendPushNotification(userId, event, payload).catch(() => undefined);
  }

  async registerExpoToken(userId: string, dto: RegisterPushTokenDto) {
    if (!Expo.isExpoPushToken(dto.expoToken)) {
      throw new BadRequestException("Invalid Expo push token");
    }
    return this.prisma.userPushToken.upsert({
      where: { expoToken: dto.expoToken },
      create: {
        userId,
        expoToken: dto.expoToken,
        deviceLabel: dto.deviceLabel
      },
      update: {
        userId,
        isActive: true,
        deviceLabel: dto.deviceLabel
      }
    });
  }

  private async sendPushNotification(userId: string, event: string, payload: unknown) {
    const tokens = await this.prisma.userPushToken.findMany({
      where: { userId, isActive: true }
    });
    if (!tokens.length) {
      return;
    }

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.expoToken))
      .map((t) => ({
        to: t.expoToken,
        sound: "default",
        title: "LeadFlow Mobile",
        body: this.buildPushBody(event, payload),
        data: { event, payload }
      }));

    if (!messages.length) {
      return;
    }

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        this.logger.warn(`Expo push failed for chunk: ${(error as Error).message}`);
      }
    }
  }

  private buildPushBody(event: string, payload: unknown) {
    if (event === "lead-assigned") {
      return "A new lead was assigned to you.";
    }
    if (event === "followup-reminder") {
      return "A follow-up reminder is due.";
    }
    return typeof payload === "object" ? "You have a new LeadFlow notification." : String(payload);
  }
}
