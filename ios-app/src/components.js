import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { TYPE, TYPE_DEFAULT, useTheme } from "./theme";

export const tap = () => Haptics.selectionAsync().catch(() => {});

export function Chip({ label, tone = "accent", icon }) {
  const t = useTheme();
  const soft = t[`${tone}Soft`] || t.surfaceSoft;
  return (
    <View style={[styles.chip, { backgroundColor: soft }]}>
      {icon ? <Ionicons name={icon} size={12} color={t[tone]} /> : null}
      <Text style={[styles.chipText, { color: t[tone] || t.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ArticleCard({ article, onPress, saved }) {
  const t = useTheme();
  const [tone, icon] = TYPE[article.study_type] || TYPE_DEFAULT;
  const color = t[tone];
  const source = article.journal || article.source;
  const blurb = article.ai_rounds_takeaway || article.ai_summary || article.summary;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress(article);
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border, transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.cardBody}>
        <View style={styles.topRow}>
          <Ionicons name={icon} size={13} color={color} />
          <Text style={[styles.kind, { color }]} numberOfLines={1}>
            {article.study_type || "Article"}
          </Text>
          {article.is_top_journal ? (
            <View style={[styles.top, { backgroundColor: t.amberSoft }]}>
              <Ionicons name="ribbon" size={11} color={t.amber} />
              <Text style={[styles.topText, { color: t.amber }]}>Top journal</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {saved ? <Ionicons name="bookmark" size={16} color={t.accent} /> : null}
        </View>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={4}>
          {article.title}
        </Text>
        {blurb ? (
          <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={2}>
            {blurb}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
          {[source, article.pubdate].filter(Boolean).join("  ·  ")}
        </Text>
      </View>
    </Pressable>
  );
}

export function SectionTitle({ children, action, onAction }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: t.text }]}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} style={styles.action}>
          <Text style={{ color: t.accent, fontWeight: "600", fontSize: 14 }}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={t.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ title, hint, icon = "documents-outline" }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.accentSoft }]}>
        <Ionicons name={icon} size={30} color={t.accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {hint ? <Text style={[styles.body, { color: t.textMuted, textAlign: "center" }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#0b1b33",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bar: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 7 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kind: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4 },
  topText: { fontSize: 10.5, fontWeight: "700" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 16.5, fontWeight: "700", lineHeight: 22, letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12.5, marginTop: 1 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginTop: 14, marginBottom: 12 },
  section: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  empty: { alignItems: "center", padding: 40, gap: 10, marginTop: 30 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
});
