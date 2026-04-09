import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isSupabaseConfigured, supabaseEnvError } from "../lib/supabaseClient";
import { useAuthStore } from "../state/useAuthStore";
import { colors } from "../theme/colors";

/**
 * Rendered only when `restoringSession` is false and `user` is null (App.tsx).
 * Session is reloaded from AsyncStorage before that gate opens.
 */
export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const user = useAuthStore((s) => s.user);
  const supabaseReady = isSupabaseConfigured();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const doLogin = async () => {
    try {
      setError(null);
      setSubmitting(true);
      await login(email.trim(), password);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Login failed.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || !email.trim() || !password || !supabaseReady;

  if (user) {
    return (
      <View style={[styles.flex, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.restoringText}>Signing you in…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title}>LeadFlow</Text>
        <Text style={styles.subtitle}>Sign in with your Supabase account.</Text>

        {!supabaseReady ? (
          <Text style={styles.configError}>{supabaseEnvError ?? "Supabase is not configured."}</Text>
        ) : null}

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          editable={!submitting}
        />
        <TextInput
          style={styles.input}
          secureTextEntry
          textContentType="password"
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          editable={!submitting}
          onSubmitEditing={() => {
            if (!disabled) void doLogin();
          }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.btn, (disabled || pressed) && styles.btnDisabled]}
          onPress={() => void doLogin()}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.btnText}>Sign in</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centered: { justifyContent: "center", alignItems: "center" },
  restoringText: { marginTop: 12, color: colors.textMuted, fontSize: 15 },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 10,
    marginBottom: 28,
    fontSize: 16,
    lineHeight: 22,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  error: {
    color: colors.danger,
    marginBottom: 12,
    fontSize: 14,
  },
  configError: {
    color: colors.warning,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  btnDisabled: {
    opacity: 0.65,
  },
  btnText: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 16,
  },
});
