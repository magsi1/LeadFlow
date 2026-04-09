import { leadDisplayName } from "./safeData";

export type WhatsAppMessageTemplate = {
  id: string;
  name: string;
  emoji: string;
  message: string;
};

/** WhatsApp quick messages for Lead Detail (Urdu / Roman Urdu). */
export const TEMPLATES: WhatsAppMessageTemplate[] = [
  {
    id: "greeting",
    name: "Initial Greeting",
    emoji: "👋",
    message:
      "Assalam o Alaikum {name}! Solar Solutions ki taraf se. Aap ki kia madad kar sakte hain?",
  },
  {
    id: "followup",
    name: "Follow Up",
    emoji: "🔄",
    message:
      "Assalam o Alaikum {name}! Solar system ke baare mein follow up kar raha tha. Koi update?",
  },
  {
    id: "quotation",
    name: "Quotation Ready",
    emoji: "📋",
    message: "Dear {name}, aap ka quotation tayyar hai. Kab discuss kar sakte hain?",
  },
  {
    id: "meeting",
    name: "Site Visit",
    emoji: "📅",
    message:
      "Assalam o Alaikum {name}! Is week site visit schedule kar sakte hain assessment ke liye?",
  },
  {
    id: "thanks",
    name: "Thank You",
    emoji: "🌟",
    message:
      "Thank you {name} for choosing us! Best solar solution provide karenge. JazakAllah!",
  },
  {
    id: "reminder",
    name: "Payment Reminder",
    emoji: "💳",
    message: "Dear {name}, payment reminder. Koi problem ho to batayein.",
  },
];

/** Same as {@link TEMPLATES} (legacy export name). */
export const WHATSAPP_MESSAGE_TEMPLATES = TEMPLATES;

/**
 * Replace `{name}` with the lead's stored name when present, otherwise a display-safe label.
 * Opens use `https://wa.me/{phone}?text=${encodeURIComponent(message)}` via {@link openWhatsAppWithPrefilledText}.
 */
export function applyWhatsAppTemplateWithLeadName(
  template: string,
  leadName: string | null | undefined,
): string {
  const raw = typeof leadName === "string" ? leadName.trim() : "";
  const n = raw.length > 0 ? raw : leadDisplayName(leadName);
  return template.replace(/\{name\}/g, n);
}
