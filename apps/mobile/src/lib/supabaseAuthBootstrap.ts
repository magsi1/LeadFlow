import { disconnectSocket } from "../services/socket";
import { setAuthToken } from "../services/api";
import { useAuthStore } from "../state/useAuthStore";
import { mapSessionToSnapshot } from "./authSessionMap";
import { supabase } from "./supabaseClient";

function applySnapshotToApp(snapshot: ReturnType<typeof mapSessionToSnapshot>) {
  if (!snapshot.user) {
    disconnectSocket();
  }
  setAuthToken(snapshot.token);
  useAuthStore.setState({
    token: snapshot.token,
    user: snapshot.user,
    restoringSession: false,
  });
}

type Unsub = () => void;

let authBootstrapGeneration = 0;

/**
 * Restores Supabase session from AsyncStorage before any auth UI:
 * 1. await getSession() — hydrates from storage into the client
 * 2. Apply token + user to Zustand (restoringSession → false) so App can render Main or Login
 * 3. onAuthStateChange — TOKEN_REFRESHED, SIGNED_OUT, etc. stay in sync with the UI
 */
export function startSupabaseAuth(): Unsub {
  if (!supabase) {
    setAuthToken(null);
    disconnectSocket();
    useAuthStore.setState({ token: null, user: null, restoringSession: false });
    return () => { };
  }

  const myGen = ++authBootstrapGeneration;
  let subscriptionUnsub: Unsub | undefined;

  void (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (myGen !== authBootstrapGeneration) return;

    if (sessionError) {
      setAuthToken(null);
      disconnectSocket();
      useAuthStore.setState({ token: null, user: null, restoringSession: false });
    } else {
      applySnapshotToApp(mapSessionToSnapshot(sessionData.session));
    }

    if (myGen !== authBootstrapGeneration) return;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySnapshotToApp(mapSessionToSnapshot(session));
    });

    if (myGen !== authBootstrapGeneration) {
      data.subscription.unsubscribe();
      return;
    }

    subscriptionUnsub = () => data.subscription.unsubscribe();
  })();

  return () => {
    authBootstrapGeneration += 1;
    subscriptionUnsub?.();
  };
}
