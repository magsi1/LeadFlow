import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  expoToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}
