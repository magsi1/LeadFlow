import { Controller, Get, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { FollowUpService } from "./followup.service";

@Controller("followups")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALESPERSON)
  async list(@CurrentUser() user: { id: string }) {
    return this.followUpService.listMyFollowUps(user.id);
  }
}
