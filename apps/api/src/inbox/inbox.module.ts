import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AssignmentModule } from "../assignment/assignment.module";
import { PrismaService } from "../common/prisma.service";
import { FollowUpModule } from "../followup/followup.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InboxController } from "./inbox.controller";
import { InboxGateway } from "./inbox.gateway";
import { InboxService } from "./inbox.service";

@Module({
  imports: [AiModule, AssignmentModule, FollowUpModule, AnalyticsModule, NotificationsModule],
  controllers: [InboxController],
  providers: [InboxService, InboxGateway, PrismaService],
  exports: [InboxService]
})
export class InboxModule {}
