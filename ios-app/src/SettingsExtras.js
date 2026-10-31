import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { authenticate, lockMessage, lockSupported } from "./AppLock";
import { Segmented, SectionTitle } from "./components";
import { useStore } from "./store";
import { useTheme } from "./theme";

const GOALS = [1, 3, 5, 7].map((n) => ({ value: n, label: String(n) }));

export function GoalSetting() {
  const t = useTheme();
  const { settings, updateSettings } = useStore();
  return (
    <>
      <SectionTitle>Weekly reading goal</SectionTitle>
      <View style={styles.pad}>
        <Segmented options={GOALS} value={settings.weeklyGoal} onChange={(v) => updateSettings({ weeklyGoal: v })} />
        <Text style={[styles.hint, { color: t.textMuted }]}>Articles per week. Progress shows on Today and in your reading log.</Text>
      </View>
    </>
  );
}

export function WatchlistSetting() {
  const t = useTheme();
  const { watchlist, addWatch, removeWatch } = useStore();
  const [draft, setDraft] = useState("");
  const add = () => {
    addWatch(draft);
    setDraft("");
  };
  return (
    <>
      <SectionTitle>Watchlist</SectionTitle>
      <View style={styles.pad}>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          {watchlist.map((w) => (
            <View key={w.id} style={[styles.row, { borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Ionicons name="eye-outline" size={19} color={t.accent} />
              <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>{w.query}</Text>
              <Pressable onPress={() => removeWatch(w.id)} hitSlop={10} accessibilityLabel={`Stop watching ${w.query}`}>
                <Ionicons name="trash-outline" size={19} color={t.rose} />
              </Pressable>
            </View>
          ))}
          <View style={styles.row}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={add}
              placeholder="Add a keyword, e.g. ECMO"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              maxLength={40}
              style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 6 }}
            />
            <Pressable onPress={add} disabled={!draft.trim()} hitSlop={10} accessibilityLabel="Add keyword">
              <Ionicons name="add-circle" size={26} color={draft.trim() ? t.accent : t.textMuted} />
            </Pressable>
          </View>
        </View>
        <Text style={[styles.hint, { color: t.textMuted }]}>
          Matching articles are flagged on Today. You can also add a keyword from any search.
        </Text>
      </View>
    </>
  );
}

export function LockSetting() {
  const t = useTheme();
  const { settings, updateSettings } = useStore();
  const [note, setNote] = useState("");
  if (!lockSupported) return null;
  const toggle = async (on) => {
    setNote("");
    if (!on) return updateSettings({ appLock: false });
    const { ok, reason } = await authenticate("Turn on app lock");
    if (ok) updateSettings({ appLock: true });
    else setNote(lockMessage(reason));
  };
  return (
    <>
      <SectionTitle>Privacy</SectionTitle>
      <View style={styles.pad}>
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.row}>
            <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>Lock with Face ID</Text>
            <Switch value={settings.appLock} onValueChange={toggle} trackColor={{ true: t.accent }} accessibilityLabel="Lock with Face ID" />
          </View>
        </View>
        <Text style={[styles.hint, { color: note ? t.rose : t.textMuted }]}>
          {note || "Asks for Face ID or your passcode when you open the app. Protects your saved articles and notes."}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4, marginTop: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
});
