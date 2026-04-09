import { Module } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service";
import { AssignmentService } from "./assignment.service";

@Module({
  providers: [AssignmentService, PrismaService],
  exports: [AssignmentService]
})
export class AssignmentModule {}
