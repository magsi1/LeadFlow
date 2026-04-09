/**
 * POST lead to Next.js `/api/leads/create`.
 *
 * Verification checklist (local dev):
 * [ ] Next.js terminal shows "API HIT" on every submission
 * [ ] Next.js terminal shows the received body
 * [ ] Supabase "leads" table receives a new row
 * [ ] Frontend shows success or a real error message (never silent)
 */

/**
 * @param {Record<string, unknown>} leadData - JSON body (e.g. name, phone, message)
 * @returns {Promise<{ success: true, data: unknown } | { success: false, error: string }>}
 */
export async function saveLead(leadData) {
  const base = typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL
    ? String(process.env.EXPO_PUBLIC_API_URL).trim()
    : "";

  if (!base) {
    const msg =
      "EXPO_PUBLIC_API_URL is not set. Add EXPO_PUBLIC_API_URL=http://[YOUR_LAN_IP]:3000 to .env.local (see apps/mobile/README.md).";
    console.error("[saveLead]", msg);
    return { success: false, error: msg };
  }

  const endpoint = `${base.replace(/\/$/, "")}/api/leads/create`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(leadData ?? {}),
    });

    const rawText = await res.text();
    let parsed = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      console.error("[saveLead] Response was not JSON:", rawText, parseErr);
      return {
        success: false,
        error: `Invalid response (${res.status}): ${rawText.slice(0, 200)}`,
      };
    }

    if (!res.ok) {
      const errMsg =
        typeof parsed.error === "string"
          ? parsed.error
          : typeof parsed.message === "string"
            ? parsed.message
            : rawText || `HTTP ${res.status}`;
      console.error("[saveLead] Request failed:", res.status, errMsg);
      return { success: false, error: `${errMsg} (${res.status})` };
    }

    return { success: true, data: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[saveLead] Network or fetch error:", err);
    return { success: false, error: message };
  }
}
