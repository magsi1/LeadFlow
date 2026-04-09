export enum UserRole {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  SALESPERSON = "SALESPERSON"
}

export enum ChannelType {
  INSTAGRAM = "INSTAGRAM",
  FACEBOOK = "FACEBOOK",
  WHATSAPP = "WHATSAPP",
  WEBSITE_CHAT = "WEBSITE_CHAT"
}

export enum LeadStatus {
  NEW = "NEW",
  QUALIFYING = "QUALIFYING",
  ASSIGNED = "ASSIGNED",
  NURTURING = "NURTURING",
  WON = "WON",
  LOST = "LOST"
}

export type BuyingIntent = "HOT" | "WARM" | "COLD";

export interface LeadDto {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  sourceChannel: ChannelType;
  status: LeadStatus;
  buyingIntent: BuyingIntent;
  assignedToId?: string;
  score: number;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  channel: ChannelType;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string;
  isInbound: boolean;
}
