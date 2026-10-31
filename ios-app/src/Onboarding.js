import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tap } from "./components";
import { useStore } from "./store";
import { useTheme } from "./theme";

const FEATURES = [
  ["newspaper-outline", "Daily critical-care literature", "New papers from top journals, sorted by organ system."],
  ["chatbubble-ellipses-outline", "Plain-language takeaways", "AI summaries and bedside takeaways, with the study design and impact rating."],
  ["bookmark-outline", "Save and organize", "Keep articles in collections, even offline."],
];

// Organ systems the user did not pick become hidden categories.
export function hiddenFromSelection(categories, selected) {
  return categories.filter((c) => !selected.has(c.id)).map((c) => c.id);
}

export default function Onboarding() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { feed, updateSettings } = useStore();
  const categories = feed?.categories || [];
  const [picked, setPicked] = useState(null); // null means "everything", the default
  const selected = picked ?? new Set(categories.map((c) => c.id));
  const none = categories.length > 0 && selected.size === 0;

  const toggle = (id) => {
    tap();
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setPicked(next);
  };
  const finish = (hiddenCategories) => updateSettings({ onboarded: true, hiddenCategories });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingTop: insets.top + 28, paddingBottom: 150 }]}>
        <Image source={require("../assets/icon.png")} style={styles.logo} />
        <Text style={[styles.title, { color: t.text }]}>
          Welcome to ICU <Text style={{ color: t.teal }}>Scope</Text>
        </Text>
        <Text style={[styles.lead, { color: t.textSecondary }]}>Critical-care evidence, every day.</Text>

        {FEATURES.map(([icon, head, body]) => (
          <View key={head} style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: t.accentSoft }]}>
              <Ionicons name={icon} size={22} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.featureHead, { color: t.text }]}>{head}</Text>
              <Text style={[styles.featureBody, { color: t.textSecondary }]}>{body}</Text>
            </View>
          </View>
        ))}

        <Text style={[styles.section, { color: t.text }]}>What do you want to follow?</Text>
        <Text style={[styles.hint, { color: t.textMuted }]}>
          Unselected organ systems are hidden from Browse and Search. You can change this any time in Settings.
        </Text>
        <View style={styles.chips}>
          {categories.map((c) => {
            const on = selected.has(c.id);
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={[styles.chip, { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.border }]}
              >
                <Text style={{ color: on ? "#fff" : t.textSecondary, fontWeight: "700", fontSize: 14 }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {!categories.length ? <Text style={[styles.hint, { color: t.textMuted }]}>Loading topics…</Text> : null}
        <Text style={[styles.hint, { color: t.textMuted, marginTop: 20 }]}>
          Summaries and ratings are reading aids, not clinical advice. Always read the source paper.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          onPress={() => finish(hiddenFromSelection(categories, selected))}
          disabled={none}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: none ? t.surfaceSoft : t.accent }]}
        >
          <Text style={{ color: none ? t.textMuted : "#fff", fontWeight: "800", fontSize: 16.5 }}>
            {none ? "Pick at least one" : "Get started"}
          </Text>
        </Pressable>
        <Pressable onPress={() => finish([])} hitSlop={8} accessibilityRole="button" style={styles.skip}>
          <Text style={{ color: t.accent, fontWeight: "700" }}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 22, gap: 6 },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 10 },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  lead: { fontSize: 17, marginBottom: 14 },
  feature: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingVertical: 8 },
  featureIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  featureHead: { fontSize: 16.5, fontWeight: "700" },
  featureBody: { fontSize: 14.5, lineHeight: 20, marginTop: 2 },
  section: { fontSize: 19, fontWeight: "800", marginTop: 22 },
  hint: { fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  primary: { borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  skip: { alignItems: "center", paddingVertical: 10 },
});
