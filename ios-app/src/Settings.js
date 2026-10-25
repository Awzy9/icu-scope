import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import app from "../app.json";
import { SectionTitle, tap } from "./components";
import { useStore } from "./store";
import { useTheme } from "./theme";

const SITE = "https://icu-scope.vercel.app";
const APPEARANCE = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const TEXT_SIZES = [
  { value: 0.9, label: "Small" },
  { value: 1, label: "Default" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "XL" },
];

function Card({ children }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>{children}</View>;
}

function Segmented({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surfaceSoft }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: t.surface }]}
          >
            <Text style={{ color: on ? t.accent : t.textSecondary, fontWeight: "700", fontSize: 13.5 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Row({ icon, label, detail, onPress, tone, last }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.row, !last && { borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <Ionicons name={icon} size={20} color={tone ? t[tone] : t.accent} />
      <Text style={[styles.rowLabel, { color: tone ? t[tone] : t.text }]}>{label}</Text>
      {detail ? <Text style={{ color: t.textMuted, fontSize: 14 }}>{detail}</Text> : null}
      {onPress && !tone ? <Ionicons name="chevron-forward" size={16} color={t.textMuted} /> : null}
    </Pressable>
  );
}

export default function Settings() {
  const t = useTheme();
  const { settings, updateSettings, feed, refresh, refreshing, clearData } = useStore();
  const [confirmClear, setConfirmClear] = useState(false);
  const hidden = settings.hiddenCategories;
  const toggleCategory = (id, shown) =>
    updateSettings({ hiddenCategories: shown ? hidden.filter((x) => x !== id) : [...hidden, id] });
  const updated = feed?.generated_at ? new Date(feed.generated_at).toLocaleString() : "Not yet";

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 40 }}>
      <SectionTitle>Appearance</SectionTitle>
      <View style={styles.pad}>
        <Segmented options={APPEARANCE} value={settings.appearance} onChange={(v) => updateSettings({ appearance: v })} />
      </View>

      <SectionTitle>Reading size</SectionTitle>
      <View style={styles.pad}>
        <Segmented options={TEXT_SIZES} value={settings.textScale} onChange={(v) => updateSettings({ textScale: v })} />
        <Text
          style={{ color: t.textSecondary, marginTop: 12, fontSize: 16 * settings.textScale, lineHeight: 24 * settings.textScale }}
        >
          Preview: a plain-language summary looks like this on the article page.
        </Text>
      </View>

      <View style={[styles.pad, { marginTop: 14 }]}>
        <Card>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: t.text }]}>Hide read articles in lists</Text>
            <Switch
              value={settings.hideRead}
              onValueChange={(on) => updateSettings({ hideRead: on })}
              trackColor={{ true: t.accent }}
              accessibilityLabel="Hide read articles in lists"
            />
          </View>
        </Card>
      </View>

      <SectionTitle>Organ systems</SectionTitle>
      <Text style={[styles.hint, { color: t.textMuted }]}>
        Hidden systems are removed from Browse, Latest and Search. Guidelines, trials and other sources stay visible.
      </Text>
      <View style={styles.pad}>
        <Card>
          {(feed?.categories || []).map((c, i, all) => (
            <View
              key={c.id}
              style={[styles.row, i < all.length - 1 && { borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={[styles.rowLabel, { color: t.text }]}>{c.label}</Text>
              <Switch
                value={!hidden.includes(c.id)}
                onValueChange={(on) => toggleCategory(c.id, on)}
                trackColor={{ true: t.accent }}
                accessibilityLabel={`Show ${c.label}`}
              />
            </View>
          ))}
          {!feed ? <Text style={[styles.hint, { color: t.textMuted }]}>Loads once articles are downloaded.</Text> : null}
        </Card>
      </View>

      <SectionTitle>Data</SectionTitle>
      <View style={styles.pad}>
        <Card>
          <Row icon="time-outline" label="Last updated" detail={updated} />
          <Row icon="refresh" label={refreshing ? "Refreshing…" : "Refresh now"} onPress={refreshing ? undefined : refresh} />
          <Row
            icon="trash-outline"
            tone="rose"
            last
            label={confirmClear ? "Tap again to erase saved articles" : "Clear saved articles and cache"}
            onPress={async () => {
              if (!confirmClear) return setConfirmClear(true);
              await clearData();
              setConfirmClear(false);
              refresh();
            }}
          />
        </Card>
      </View>

      <SectionTitle>About</SectionTitle>
      <View style={styles.pad}>
        <Card>
          <Row icon="information-circle-outline" label="Version" detail={app.expo.version} />
          <Row icon="shield-checkmark-outline" label="Privacy policy" onPress={() => Linking.openURL(`${SITE}/privacy`)} />
          <Row icon="help-buoy-outline" label="Support and feedback" onPress={() => Linking.openURL(`${SITE}/support`)} />
          <Row icon="sparkles-outline" label="Show welcome screen again" onPress={() => updateSettings({ onboarded: false })} last />
        </Card>
        <Text style={[styles.hint, { color: t.textMuted, paddingHorizontal: 4 }]}>
          ICU Scope summarizes published literature. AI summaries and impact ratings are reading aids, not clinical advice.
          Always read the source paper.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 20, marginBottom: 8, marginTop: 8 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowLabel: { flex: 1, fontSize: 16 },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
});
