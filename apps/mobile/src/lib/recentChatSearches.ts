import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "leadflow_recent_searches";

export async function getRecentChatSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 5);
  } catch {
    return [];
  }
}

export async function saveRecentChatSearch(query: string): Promise<void> {
  const q = query.trim();
  if (q.length < 2) return;
  try {
    const existing = await getRecentChatSearches();
    const updated = [q, ...existing.filter((x) => x !== q)].slice(0, 5);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}
