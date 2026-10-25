import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "./theme";

export const tap = () => Haptics.selectionAsync().catch(() => {});

const TYPE_STYLE = {
  "Meta-Analysis": ["🟢", "green"],
  "Systematic Review": ["🟢", "green"],
  "Randomized Controlled Trial": ["🔵", "blue"],
  "Clinical Trial": ["🔵", "blue"],
  "Practice Guideline": ["🟣", "purple"],
  Guideline: ["🟣", "purple"],
  "Observational Study": ["🟡", "amber"],
  "Case Reports": ["🟠", "amber"],
};

export function Chip({ label, tone = "accent" }) {
  const t = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: t[`${tone}Soft`] || t.surfaceSoft }]}>
      <Text style={[styles.chipText, { color: t[tone] || t.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ArticleCard({ article, onPress, saved }) {
  const t = useTheme();
  const type = article.study_type;
  const [dot, tone] = TYPE_STYLE[type] || ["⚪", "textMuted"];
  const source = article.journal || article.source;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress(article);
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.row}>
        {type ? <Chip label={`${dot} ${type}`} tone={tone === "textMuted" ? "accent" : tone} /> : null}
        {article.is_top_journal ? <Chip label="Top journal" tone="amber" /> : null}
        {saved ? <Text style={styles.star}>★</Text> : null}
      </View>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={4}>
        {article.title}
      </Text>
      {article.ai_summary || article.summary ? (
        <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={3}>
          {article.ai_summary || article.summary}
        </Text>
      ) : null}
      <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
        {[source, article.pubdate].filter(Boolean).join(" · ")}
      </Text>
    </Pressable>
  );
}

export function SectionTitle({ children, action, onAction }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: t.text }]}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={{ color: t.accentStrong, fontWeight: "600" }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({ title, hint }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {hint ? <Text style={[styles.body, { color: t.textMuted, textAlign: "center" }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, marginHorizontal: 16, marginBottom: 12, gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: "100%" },
  chipText: { fontSize: 12, fontWeight: "600" },
  star: { marginLeft: "auto", color: "#f5a524", fontSize: 18 },
  title: { fontSize: 17, fontWeight: "700", lineHeight: 22 },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12.5 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 16, marginTop: 8, marginBottom: 10 },
  section: { fontSize: 22, fontWeight: "800" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
});
