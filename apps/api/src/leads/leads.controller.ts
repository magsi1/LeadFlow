import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ListLeadsDto } from "./dto/list-leads.dto";
import { UpdateLeadStatusDto } from "./dto/update-lead-status.dto";
import { LeadsService } from "./leads.service";

@Controller("leads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALESPERSON)
  async list(@Query() query: ListLeadsDto) {
    return this.leadsService.list(query.status);
  }

  @Patch(":leadId/status")
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALESPERSON)
  async updateStatus(
    @Param("leadId", new ParseUUIDPipe()) leadId: string,
    @Body() dto: UpdateLeadStatusDto
  ) {
    return this.leadsService.updateStatus(leadId, dto.status);
  }
}
