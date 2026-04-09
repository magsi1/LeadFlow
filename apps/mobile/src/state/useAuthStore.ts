import { create } from "zustand";
import { setAuthToken } from "../services/api";
import { disconnectSocket } from "../services/socket";
import { mapSessionToSnapshot, type AppAuthUser } from "../lib/authSessionMap";
import { supabase, supabaseEnvError } from "../lib/supabaseClient";

type AuthState = {
  token: string | null;
  user: AppAuthUser | null;
  /** True until first Supabase session hydration on cold start (blocks UI to avoid login flash). */
  restoringSession: boolean;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

function applyAuthSnapshot(
  set: (partial: Partial<AuthState>) => void,
  snapshot: ReturnType<typeof mapSessionToSnapshot>,
  restoringSession: boolean,
) {
  setAuthToken(snapshot.token);
  set({
    token: snapshot.token,
    user: snapshot.user,
    restoringSession,
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  restoringSession: true,

  restoreSession: async () => {
    if (!supabase) {
      setAuthToken(null);
      disconnectSocket();
      set({ token: null, user: null, restoringSession: false });
      return;
    }
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setAuthToken(null);
        disconnectSocket();
        set({ token: null, user: null, restoringSession: false });
        return;
      }
      const snapshot = mapSessionToSnapshot(data.session);
      applyAuthSnapshot(set, snapshot, false);
    } catch {
      setAuthToken(null);
      disconnectSocket();
      set({ token: null, user: null, restoringSession: false });
    }
  },

  /**
   * signInWithPassword persists the session to AsyncStorage (see supabaseClient: persistSession + storageKey).
   * We sync Zustand + API token from the returned session — no demo / fallback user.
   */
  login: async (email, password) => {
    if (!supabase) {
      throw new Error(supabaseEnvError ?? "Supabase is not configured.");
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (!data.session?.user || !data.session.access_token) {
      throw new Error("Login failed. No active session returned.");
    }
    const snapshot = mapSessionToSnapshot(data.session);
    if (!snapshot.token || !snapshot.user) {
      throw new Error("Login failed. Invalid session.");
    }
    applyAuthSnapshot(set, snapshot, false);
  },

  logout: async () => {
    disconnectSocket();
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAuthToken(null);
    set({ token: null, user: null, restoringSession: false });
  },
}));
