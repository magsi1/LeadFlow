import { Module, OnModuleInit } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "./ai/ai.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AssignmentModule } from "./assignment/assignment.module";
import { AuthModule } from "./auth/auth.module";
import { RolesGuard } from "./common/guards/roles.guard";
import { DemoModule } from "./demo/demo.module";
import { DemoService } from "./demo/demo.service";
import { FollowUpModule } from "./followup/followup.module";
import { InboxModule } from "./inbox/inbox.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { LeadsModule } from "./leads/leads.module";
import { NotificationsModule } from "./notifications/notifications.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    AiModule,
    AnalyticsModule,
    AssignmentModule,
    NotificationsModule,
    FollowUpModule,
    InboxModule,
    IntegrationsModule,
    LeadsModule,
    DemoModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: RolesGuard
    }
  ]
})
export class AppModule implements OnModuleInit {
  constructor(private readonly demoService: DemoService) {}

  async onModuleInit() {
    if ((process.env.DEMO_MODE ?? "true") === "true") {
      await this.demoService.seedDemoData();
    }
  }
}
