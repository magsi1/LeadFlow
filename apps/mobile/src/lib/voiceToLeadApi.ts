import {
  getSupabaseClient,
  getSupabaseFunctionFetchConfig,
  isSupabaseConfigured,
} from "./supabaseClient";
import type { StoppedRecording } from "./voiceRecording";

export type VoiceLeadData = {
  name: string;
  phone: string;
  city: string;
  dealValue: number | null;
  notes: string;
  stage: string;
  priority: string;
};

export type VoiceToLeadResult = {
  action: "create" | "update";
  leadId?: string;
  leadData: VoiceLeadData;
  summary: string;
  transcript: string;
};

async function getAuthHeaders(): Promise<{ url: string; anonKey: string; accessToken: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  const fnCfg = getSupabaseFunctionFetchConfig();
  if (!fnCfg) {
    throw new Error("Supabase is not configured.");
  }
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token?.trim();
  if (!accessToken) {
    throw new Error("Sign in to use voice-to-lead.");
  }
  return { ...fnCfg, accessToken };
}

function parseVoiceToLeadResponse(
  raw: string,
  response: Response,
): VoiceToLeadResult {
  let parsed: VoiceToLeadResult & { error?: string; code?: string };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    console.error("[voiceToLeadApi] non-JSON body", raw.slice(0, 400));
    throw new Error("Invalid response from server.");
  }
  if (!response.ok) {
    const code = typeof parsed.code === "string" ? parsed.code : "";
    const err =
      typeof parsed.error === "string" && parsed.error.trim()
        ? parsed.error.trim()
        : `Request failed (${response.status})`;
    const e = new Error(err) as Error & { code?: string; httpStatus: number };
    e.code = code;
    e.httpStatus = response.status;
    throw e;
  }
  if (!parsed.leadData || typeof parsed.leadData !== "object") {
    throw new Error("Invalid AI response.");
  }
  const transcript =
    typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
  const action = parsed.action === "update" ? "update" : "create";
  return {
    action,
    leadId: typeof parsed.leadId === "string" ? parsed.leadId : undefined,
    leadData: parsed.leadData,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    transcript,
  };
}

/**
 * Sends audio to `voice-to-lead` edge function (Whisper + GPT). No JSON body — multipart only.
 */
export async function processVoiceRecordingWithEdge(stopped: StoppedRecording): Promise<VoiceToLeadResult> {
  console.log("[voiceToLeadApi] processVoiceRecordingWithEdge", stopped.platform);
  const { url, anonKey, accessToken } = await getAuthHeaders();

  const form = new FormData();
  if (stopped.platform === "web") {
    const ext = stopped.mimeType.includes("webm") ? "webm" : stopped.mimeType.includes("mp4") ? "m4a" : "webm";
    form.append("audio", stopped.blob, `recording.${ext}`);
    console.log("[voiceToLeadApi] multipart audio (web blob)", stopped.blob.size, stopped.mimeType);
  } else {
    form.append("audioBase64", stopped.base64);
    form.append("mimeType", stopped.mimeType);
    console.log("[voiceToLeadApi] multipart audioBase64 len", stopped.base64?.length ?? 0, stopped.mimeType);
  }

  const response = await fetch(`${url}/functions/v1/voice-to-lead`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: form,
  });

  const raw = await response.text();
  console.log("[voiceToLeadApi] voice-to-lead status", response.status, raw.slice(0, 200));
  return parseVoiceToLeadResponse(raw, response);
}

/**
 * Transcript-only path (manual entry after Whisper fails). JSON body.
 */
export async function extractLeadFromTranscript(transcript: string): Promise<VoiceToLeadResult> {
  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error("Enter a transcript first.");
  }
  console.log("[voiceToLeadApi] extractLeadFromTranscript len", trimmed.length);
  const { url, anonKey, accessToken } = await getAuthHeaders();

  const response = await fetch(`${url}/functions/v1/voice-to-lead`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ transcript: trimmed }),
  });

  const raw = await response.text();
  console.log("[voiceToLeadApi] transcript-only status", response.status, raw.slice(0, 200));
  return parseVoiceToLeadResponse(raw, response);
}
