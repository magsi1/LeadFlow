import { Controller, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { DemoService } from "./demo.service";

@Controller("demo")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post("seed")
  @Roles(UserRole.ADMIN)
  seed() {
    return this.demoService.seedDemoData();
  }
}
