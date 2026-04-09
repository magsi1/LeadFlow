import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { FollowUpController } from "./followup.controller";
import { FollowUpService } from "./followup.service";

@Module({
  imports: [NotificationsModule],
  controllers: [FollowUpController],
  providers: [FollowUpService, PrismaService],
  exports: [FollowUpService]
})
export class FollowUpModule {}
