import { create } from "zustand";
import type { AppPreferences, DefaultLeadPriority } from "../lib/appPreferences";
import {
  DEFAULT_APP_PREFERENCES,
  loadAppPreferences,
  mergeAppPreferences,
  saveAppPreferences,
} from "../lib/appPreferences";

type AppPreferencesState = AppPreferences & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Replace in-memory prefs (after load or save). */
  setFromLoaded: (p: AppPreferences) => void;
  /** Persist and update store. */
  commit: (p: AppPreferences) => Promise<void>;
};

export const useAppPreferencesStore = create<AppPreferencesState>((set) => ({
  ...DEFAULT_APP_PREFERENCES,
  hydrated: false,
  hydrate: async () => {
    const p = await loadAppPreferences();
    set((s) => ({ ...s, ...p, hydrated: true }));
  },
  setFromLoaded: (p) => set((s) => ({ ...s, ...p })),
  commit: async (p) => {
    const merged = mergeAppPreferences(p);
    await saveAppPreferences(merged);
    set((s) => ({ ...s, ...merged }));
  },
}));

export function useDefaultLeadPriority(): DefaultLeadPriority {
  return useAppPreferencesStore((s) => s.defaultLeadPriority);
}
