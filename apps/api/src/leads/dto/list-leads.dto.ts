import { IsEnum, IsOptional } from "class-validator";
import { LeadStatus } from "@prisma/client";

export class ListLeadsDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
