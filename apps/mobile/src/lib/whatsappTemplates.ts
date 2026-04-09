import { leadDisplayName } from "./safeData";

export type WhatsAppMessageTemplate = {
  id: string;
  name: string;
  emoji: string;
  message: string;
};

/** WhatsApp quick messages for Lead Detail (Urdu / Roman Urdu). `{name}` → lead name. */
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
    id: "site_visit",
    name: "Site Visit",
    emoji: "🏠",
    message:
      "Assalam o Alaikum {name}! Kya hum aap ke ghar ka site visit schedule kar sakte hain solar assessment ke liye?",
  },
  {
    id: "payment_plan",
    name: "Payment Plan",
    emoji: "💰",
    message:
      "Dear {name}, hamare paas flexible payment plans hain solar system ke liye. Kya aap details sunna chahenge?",
  },
  {
    id: "deal_closing",
    name: "Deal Closing",
    emoji: "✅",
    message:
      "Dear {name}, aap ka solar system ready hai installation ke liye. Kab convenient hoga aap ke liye?",
  },
  {
    id: "feedback_request",
    name: "Feedback Request",
    emoji: "⭐",
    message:
      "Assalam o Alaikum {name}! Umeed hai solar system theek chal raha hai. Koi feedback dena chahenge?",
  },
];

/** Same as {@link TEMPLATES} (legacy export name). */
export const WHATSAPP_MESSAGE_TEMPLATES = TEMPLATES;

/**
 * Replace `{name}` with the lead's stored name when present, otherwise a display-safe label.
 */
export function applyWhatsAppTemplateWithLeadName(
  template: string,
  leadName: string | null | undefined,
): string {
  const raw = typeof leadName === "string" ? leadName.trim() : "";
  const n = raw.length > 0 ? raw : leadDisplayName(leadName);
  return template.replace(/\{name\}/g, n);
}
