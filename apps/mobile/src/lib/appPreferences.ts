import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@leadflow/app_preferences_v1";

/** Standalone key for “New Today” queries (mirrors saved `timeZone`). */
export const USER_TIMEZONE_STORAGE_KEY = "userTimezone";

export type DefaultLeadPriority = "high" | "medium" | "low";

export type AppPreferences = {
  defaultLeadPriority: DefaultLeadPriority;
  /** User-entered prefix e.g. "+92" or "92"; applied in `whatsapp.ts` for wa.me links. */
  whatsAppCountryCode: string;
  /** IANA time zone for “today” and follow-up day boundaries. */
  timeZone: string;
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  defaultLeadPriority: "medium",
  whatsAppCountryCode: "",
  timeZone: "Asia/Karachi",
};

export const TIMEZONE_OPTIONS: { id: string; label: string }[] = [
  { id: "Asia/Karachi", label: "Asia/Karachi — Pakistan" },
  { id: "Asia/Dubai", label: "Asia/Dubai — UAE" },
  { id: "Asia/Riyadh", label: "Asia/Riyadh — Saudi Arabia" },
  { id: "Asia/Kolkata", label: "Asia/Kolkata — India" },
  { id: "Asia/Dhaka", label: "Asia/Dhaka — Bangladesh" },
  { id: "Asia/Singapore", label: "Asia/Singapore" },
  { id: "Europe/London", label: "Europe/London" },
  { id: "Europe/Paris", label: "Europe/Paris" },
  { id: "America/New_York", label: "America/New_York — US East" },
  { id: "America/Chicago", label: "America/Chicago — US Central" },
  { id: "America/Los_Angeles", label: "America/Los_Angeles — US West" },
  { id: "Australia/Sydney", label: "Australia/Sydney" },
  { id: "Pacific/Auckland", label: "Pacific/Auckland" },
  { id: "UTC", label: "UTC" },
];

function parseStored(raw: string | null): Partial<AppPreferences> | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (o == null || typeof o !== "object") return null;
    return o as Partial<AppPreferences>;
  } catch {
    return null;
  }
}

export function mergeAppPreferences(partial: Partial<AppPreferences> | null | undefined): AppPreferences {
  return {
    defaultLeadPriority:
      partial?.defaultLeadPriority === "high" ||
      partial?.defaultLeadPriority === "medium" ||
      partial?.defaultLeadPriority === "low"
        ? partial.defaultLeadPriority
        : DEFAULT_APP_PREFERENCES.defaultLeadPriority,
    whatsAppCountryCode:
      typeof partial?.whatsAppCountryCode === "string"
        ? partial.whatsAppCountryCode
        : DEFAULT_APP_PREFERENCES.whatsAppCountryCode,
    timeZone:
      typeof partial?.timeZone === "string" && partial.timeZone.trim() !== ""
        ? partial.timeZone.trim()
        : DEFAULT_APP_PREFERENCES.timeZone,
  };
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const merged = mergeAppPreferences(parseStored(raw));
    await AsyncStorage.setItem(USER_TIMEZONE_STORAGE_KEY, merged.timeZone);
    return merged;
  } catch {
    const fallback = { ...DEFAULT_APP_PREFERENCES };
    try {
      await AsyncStorage.setItem(USER_TIMEZONE_STORAGE_KEY, fallback.timeZone);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

export async function saveAppPreferences(next: AppPreferences): Promise<void> {
  const merged = mergeAppPreferences(next);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  await AsyncStorage.setItem(USER_TIMEZONE_STORAGE_KEY, merged.timeZone);
}

/**
 * Time zone for “New Today” KPI (Settings preference), default Asia/Karachi.
 * Prefer `userTimezone` so it matches `localStorage.getItem('userTimezone')`-style usage on web.
 */
export async function getUserTimezone(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(USER_TIMEZONE_STORAGE_KEY);
    if (raw != null && String(raw).trim() !== "") {
      return String(raw).trim();
    }
  } catch {
    /* ignore */
  }
  const p = await loadAppPreferences();
  return p.timeZone || "Asia/Karachi";
}
