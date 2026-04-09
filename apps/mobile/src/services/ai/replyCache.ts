import AsyncStorage from "@react-native-async-storage/async-storage";
import { logAiError } from "./log";

const STORAGE_KEY = "leadflow.aiDraftReplies.v1";

export type CachedLeadReply = {
  body: string;
  updatedAt: number;
};

type Store = Record<string, CachedLeadReply>;

/** In-memory layer so repeated reads avoid JSON parse. */
const mem = new Map<string, CachedLeadReply>();

async function readAll(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    logAiError("replyCache.readAll", e, {});
    return {};
  }
}

async function writeAll(store: Store): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    logAiError("replyCache.writeAll", e, { keys: Object.keys(store).length });
  }
}

/** Latest cached draft for this lead (AsyncStorage + session memory). */
export async function getCachedReply(leadId: string): Promise<string | null> {
  try {
    const m = mem.get(leadId);
    if (m?.body?.trim()) return m.body;
    const all = await readAll();
    const row = all[leadId];
    if (row?.body?.trim()) {
      mem.set(leadId, row);
      return row.body;
    }
    return null;
  } catch (e) {
    logAiError("replyCache.getCachedReply", e, { leadId });
    return null;
  }
}

export async function setCachedReply(leadId: string, body: string): Promise<void> {
  try {
    const entry: CachedLeadReply = { body, updatedAt: Date.now() };
    mem.set(leadId, entry);
    const all = await readAll();
    all[leadId] = entry;
    await writeAll(all);
  } catch (e) {
    logAiError("replyCache.setCachedReply", e, { leadId });
  }
}

export async function clearCachedReply(leadId: string): Promise<void> {
  try {
    mem.delete(leadId);
    const all = await readAll();
    delete all[leadId];
    await writeAll(all);
  } catch (e) {
    logAiError("replyCache.clearCachedReply", e, { leadId });
  }
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Coalesces concurrent AI requests for the same lead (double-tap / strict mode).
 * The first caller runs `fn`; others await the same promise.
 */
export function dedupeLeadAiRequest<T>(leadId: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(leadId);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    inflight.delete(leadId);
  });
  inflight.set(leadId, p);
  return p;
}
