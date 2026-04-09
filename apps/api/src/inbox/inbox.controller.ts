import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { IngestInboundMessageDto } from "./dto/ingest-inbound-message.dto";
import { InboxService } from "./inbox.service";

@Controller("inbox")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InboxController {
  constructor(private readonly inboxService: InboxService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALESPERSON)
  async listInbox() {
    return this.inboxService.listInbox();
  }

  @Post("ingest")
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async ingest(@Body() dto: IngestInboundMessageDto) {
    return this.inboxService.ingestInboundMessage(dto);
  }
}
