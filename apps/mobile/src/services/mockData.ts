import { ChannelType, LeadStatus, type LeadDto } from "../types/models";

export const mockLeads: LeadDto[] = [
  {
    id: "l-1001",
    fullName: "Nina Carter",
    email: "nina@example.com",
    sourceChannel: ChannelType.INSTAGRAM,
    status: LeadStatus.ASSIGNED,
    buyingIntent: "HOT",
    assignedToId: "u-sales-1",
    score: 91,
    createdAt: new Date().toISOString(),
  },
  {
    id: "l-1002",
    fullName: "Brian Wells",
    phone: "+15551230000",
    sourceChannel: ChannelType.WHATSAPP,
    status: LeadStatus.QUALIFYING,
    buyingIntent: "WARM",
    score: 64,
    createdAt: new Date().toISOString(),
  },
];
