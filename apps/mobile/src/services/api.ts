import type { AnalyticsDashboard, FollowUpItem, LeadDto, UserRole } from "../types/models";

/** Nest API (port 4000). Next.js lead API uses EXPO_PUBLIC_API_URL (port 3000) in saveLead.js. */
const API_URL = process.env.EXPO_PUBLIC_NEST_API_URL ?? "http://localhost:4000";
const DEMO = (process.env.EXPO_PUBLIC_DEMO_MODE ?? "false") === "true";
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  demoMode: DEMO,
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: { id: string; fullName: string; role: UserRole } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
    ),
  getLeads: () => request<LeadDto[]>("/leads"),
  getAnalyticsDashboard: () => request<AnalyticsDashboard>("/analytics/dashboard"),
  getFollowUps: () => request<FollowUpItem[]>("/followups"),
  seedDemo: () => request<unknown>("/demo/seed", { method: "POST" }),
  registerPushToken: (expoToken: string, deviceLabel?: string) =>
    request<unknown>("/notifications/register-token", {
      method: "POST",
      body: JSON.stringify({ expoToken, deviceLabel }),
    }),
};
