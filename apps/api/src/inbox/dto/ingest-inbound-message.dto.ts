import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";
import { ChannelType } from "@prisma/client";

export class IngestInboundMessageDto {
  @IsEnum(ChannelType)
  channel!: ChannelType;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  conversationExternalId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  senderId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  senderName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}
