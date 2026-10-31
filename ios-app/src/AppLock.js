import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useTheme } from "./theme";

export const lockSupported = Platform.OS === "ios" || Platform.OS === "android";

// Face ID / Touch ID, with the device passcode as the fallback.
export async function authenticate(promptMessage = "Unlock ICU Scope") {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    return { ok: result.success, reason: result.success ? null : result.error };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export const lockMessage = (reason) =>
  reason === "not_enrolled" || reason === "passcode_not_set"
    ? "Set up Face ID or a passcode in the iOS Settings app first."
    : "Couldn't verify it's you, so app lock is still off.";

function LockScreen({ onUnlock }) {
  const t = useTheme();
  return (
    <View style={[styles.cover, { backgroundColor: t.bg }]}>
      <Ionicons name="lock-closed" size={46} color={t.accent} />
      <Text style={{ color: t.text, fontSize: 21, fontWeight: "800" }}>ICU Scope is locked</Text>
      <Text style={{ color: t.textMuted, fontSize: 15, textAlign: "center" }}>
        Your saved articles and notes are protected.
      </Text>
      <Pressable onPress={onUnlock} accessibilityRole="button" style={[styles.button, { backgroundColor: t.accent }]}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Unlock</Text>
      </Pressable>
    </View>
  );
}

// Keeps the app mounted underneath, so unlocking returns you to exactly where you were.
export function LockGate({ enabled, children }) {
  const [locked, setLocked] = useState(enabled && lockSupported);
  const active = enabled && lockSupported && locked;

  const unlock = useCallback(async () => {
    const { ok } = await authenticate();
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") setLocked(true);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prompts on lock; state is only set after the awaited auth result
    if (active) unlock();
  }, [active, unlock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {active ? <LockScreen onUnlock={unlock} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  button: { marginTop: 10, borderRadius: 14, paddingHorizontal: 34, paddingVertical: 14 },
});
