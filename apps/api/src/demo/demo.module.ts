import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { InboxModule } from "../inbox/inbox.module";
import { DemoController } from "./demo.controller";
import { DemoService } from "./demo.service";

@Module({
  imports: [InboxModule],
  controllers: [DemoController],
  providers: [DemoService, PrismaService],
  exports: [DemoService]
})
export class DemoModule {}
