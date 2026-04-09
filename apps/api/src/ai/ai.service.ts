import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";

type Intent = "HOT" | "WARM" | "COLD";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openai = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

  async classifyBuyingIntent(text: string): Promise<{ intent: Intent; score: number; reason: string }> {
    if (!this.openai || (process.env.DEMO_MODE ?? "true") === "true") {
      return this.mockIntent(text);
    }

    try {
      const response = await this.openai.responses.create({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Classify lead buying intent into HOT/WARM/COLD with score 0-100 and short reason. Return JSON: {intent, score, reason}."
          },
          { role: "user", content: text }
        ]
      });

      const output = response.output_text || "{}";
      const parsed = JSON.parse(output) as { intent: Intent; score: number; reason: string };
      return parsed;
    } catch (error) {
      this.logger.error("OpenAI classification failed, falling back to heuristic.");
      return this.mockIntent(text);
    }
  }

  async generateAutoReply(message: string): Promise<string> {
    if (!this.openai || (process.env.DEMO_MODE ?? "true") === "true") {
      return "Thanks for reaching out! A specialist will get back to you shortly. Could you share your budget and timeline?";
    }

    const response = await this.openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are a sales assistant. Reply concisely, ask one qualification question, and keep a friendly professional tone."
        },
        { role: "user", content: message }
      ]
    });

    return response.output_text || "Thanks for your message! Can you share your preferred timeline?";
  }

  private mockIntent(text: string): { intent: Intent; score: number; reason: string } {
    const lowered = text.toLowerCase();
    if (lowered.includes("buy") || lowered.includes("price") || lowered.includes("today")) {
      return { intent: "HOT", score: 88, reason: "User asks direct purchase-priority questions." };
    }
    if (lowered.includes("info") || lowered.includes("details") || lowered.includes("demo")) {
      return { intent: "WARM", score: 63, reason: "User is interested but not yet requesting checkout." };
    }
    return { intent: "COLD", score: 35, reason: "Early exploration with low buying urgency." };
  }
}
