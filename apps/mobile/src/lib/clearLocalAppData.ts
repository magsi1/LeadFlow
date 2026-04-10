import AsyncStorage from "@react-native-async-storage/async-storage";
import { USER_TIMEZONE_STORAGE_KEY } from "./appPreferences";

const PREFS_KEY = "@leadflow/app_preferences_v1";
import { AUTH_STORAGE_KEY } from "./supabaseClient";

export const AI_DRAFT_REPLIES_KEY = "leadflow.aiDraftReplies.v1";
export const RECENT_CHAT_SEARCHES_KEY = "leadflow_recent_searches";

/** @see notificationService.ts */
const DAILY_DIGEST_NOTIF_ID = "@leadflow/daily_digest_notification_id";
const DIGEST_PERMISSION_ASKED = "@leadflow/digest_permission_asked_v2";

const ALL_KEYS: string[] = [
  PREFS_KEY,
  USER_TIMEZONE_STORAGE_KEY,
  DAILY_DIGEST_NOTIF_ID,
  DIGEST_PERMISSION_ASKED,
  AI_DRAFT_REPLIES_KEY,
  RECENT_CHAT_SEARCHES_KEY,
  AUTH_STORAGE_KEY,
];

/**
 * Removes on-device caches and prefs used by LeadFlow (not remote leads).
 * Call before sign-out for a full “clear app data” experience.
 */
export async function clearLocalLeadFlowDeviceData(): Promise<void> {
  await AsyncStorage.multiRemove(ALL_KEYS);
}
