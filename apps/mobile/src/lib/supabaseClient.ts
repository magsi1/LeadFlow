/**
 * Supabase client: Auth + Postgres.
 *
 * Session persistence: AsyncStorage under `storageKey` (required for reliable RN persistence;
 * SecureStore is too small on Android for full session JSON).
 *
 * Required env (Expo): EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const AUTH_STORAGE_KEY = "leadflow.supabase.auth";

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabaseUrl = typeof rawUrl === "string" ? rawUrl.trim() : "";
const supabaseAnonKey = typeof rawKey === "string" ? rawKey.trim() : "";

export const supabaseEnvError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing Supabase env vars: EXPO_PUBLIC_SUPABASE_URL and/or EXPO_PUBLIC_SUPABASE_ANON_KEY"
    : null;

/** Avoid stale dashboard metrics from HTTP caching of PostgREST requests. */
const fetchNoStore: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });

const supabaseStorage = {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: supabaseStorage,
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchNoStore },
    })
    : null;

if (__DEV__) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase] Not configured:", supabaseEnvError ?? "missing URL or anon key");
  } else {
    try {
      new URL(supabaseUrl);
    } catch {
      console.warn("[Supabase] EXPO_PUBLIC_SUPABASE_URL is not a valid URL:", supabaseUrl.slice(0, 32));
    }
  }
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(supabaseEnvError ?? "Supabase client is not initialized.");
  }
  return supabase;
}

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}
