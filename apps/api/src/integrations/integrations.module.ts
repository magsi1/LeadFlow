import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { InboxModule } from "../inbox/inbox.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

@Module({
  imports: [InboxModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, PrismaService],
  exports: [IntegrationsService]
})
export class IntegrationsModule {}
