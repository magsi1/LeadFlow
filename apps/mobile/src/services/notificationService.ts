import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  buildDigestNotificationBody,
  fetchDailyDigestData,
  type DailyDigestData,
} from "../lib/dailyDigestData";
import { configureNotificationHandler } from "./push";
import { useAppPreferencesStore } from "../state/useAppPreferencesStore";

const DIGEST_TITLE = "☀️ Good morning! Here's your LeadFlow digest";
const STORAGE_LAST_DIGEST_NOTIF_ID = "@leadflow/daily_digest_notification_id";
const STORAGE_DIGEST_PERMISSION_ASKED = "@leadflow/digest_permission_asked_v2";

const ANDROID_CHANNEL_ID = "daily-digest";

function getNextNineAmLocal(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(9, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Daily digest",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#0ea5e9",
  });
}

/**
 * Ask for notification permission (idempotent; OS may not show dialog again).
 */
export async function requestPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  configureNotificationHandler();
  await ensureAndroidChannel();
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function wasDigestPermissionPrompted(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_DIGEST_PERMISSION_ASKED);
    return v === "1";
  } catch {
    return false;
  }
}

async function cancelScheduledDigestByStoredId(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(STORAGE_LAST_DIGEST_NOTIF_ID);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      await AsyncStorage.removeItem(STORAGE_LAST_DIGEST_NOTIF_ID);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Cancel LeadFlow daily digest schedules (and clear stored id). Safe if nothing scheduled.
 */
export async function cancelAllNotifications(): Promise<void> {
  await cancelScheduledDigestByStoredId();
}

/**
 * Schedule the next 9:00 (device local) one-shot notification with the given digest body.
 * Reschedules on each call so the message stays fresh when the app opens.
 */
export async function scheduleDailyDigest(digestData: DailyDigestData): Promise<void> {
  if (Platform.OS === "web") return;
  if (!Device.isDevice) return;

  configureNotificationHandler();
  await ensureAndroidChannel();

  const body = buildDigestNotificationBody(digestData);
  await cancelScheduledDigestByStoredId();

  const triggerDate = getNextNineAmLocal();

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: DIGEST_TITLE,
      body,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      data: { type: "daily-digest" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  try {
    await AsyncStorage.setItem(STORAGE_LAST_DIGEST_NOTIF_ID, notificationId);
  } catch {
    /* ignore */
  }
}

/** Test helper: fire a digest notification in ~2 seconds. */
export async function sendImmediateDigest(digestData?: DailyDigestData): Promise<void> {
  if (Platform.OS === "web") return;
  configureNotificationHandler();
  await ensureAndroidChannel();

  const data = digestData ?? (await fetchDigestDataWithPrefs());
  const body = buildDigestNotificationBody(data);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: DIGEST_TITLE,
      body,
      sound: true,
      ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      data: { type: "daily-digest-test" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
}

async function fetchDigestDataWithPrefs(): Promise<DailyDigestData> {
  const tz = useAppPreferencesStore.getState().timeZone?.trim() || "Asia/Karachi";
  return fetchDailyDigestData(tz);
}

/** First app start after login: request permission once, then schedule. */
export async function initializeDailyDigestScheduling(): Promise<void> {
  await refreshDailyDigestSchedule();
}

export async function refreshDailyDigestSchedule(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!useAppPreferencesStore.getState().dailyDigestNotifications) {
    await cancelAllNotifications();
    return;
  }

  const prompted = await wasDigestPermissionPrompted();
  if (!prompted) {
    await requestPermissions();
    try {
      await AsyncStorage.setItem(STORAGE_DIGEST_PERMISSION_ASKED, "1");
    } catch {
      /* ignore */
    }
  }

  const digest = await fetchDigestDataWithPrefs();
  await scheduleDailyDigest(digest);
}
