import { Linking, ScrollView, Share, StyleSheet, Text, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Chip, tap } from "./components";
import { useTheme } from "./theme";

const APPRAISAL = [
  ["clinical_question", "Clinical question"],
  ["background", "Background"],
  ["design", "Design"],
  ["setting", "Setting"],
  ["population", "Population"],
  ["intervention", "Intervention"],
  ["outcome", "Outcome"],
  ["authors_conclusion", "Author's conclusion"],
  ["strengths", "Strengths"],
  ["weaknesses", "Weaknesses"],
  ["bottom_line", "The bottom line"],
];

function Block({ title, children, tint }) {
  const t = useTheme();
  if (!children) return null;
  return (
    <View style={[styles.block, { backgroundColor: tint || t.surface, borderColor: t.border }]}>
      <Text style={[styles.blockTitle, { color: t.accent }]}>{title}</Text>
      <Text style={[styles.text, { color: t.text }]} selectable>
        {children}
      </Text>
    </View>
  );
}

const flat = (v) => (Array.isArray(v) ? v.join("\n• ") : v);

export default function Detail({ article: a, saved, onToggleSave }) {
  const t = useTheme();
  const source = a.journal || a.source;
  const authors = Array.isArray(a.authors) ? a.authors : a.author ? [a.author] : [];
  const shownAuthors = authors.length > 6 ? `${authors.slice(0, 6).join(", ")} et al.` : authors.join(", ");
  const url = a.url || (a.doi ? `https://doi.org/${a.doi}` : null);

  return (
    <ScrollView contentContainerStyle={styles.wrap} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.chips}>
        {a.study_type ? <Chip label={a.study_type} tone="blue" /> : null}
        {a.is_top_journal ? <Chip label="Top journal" tone="amber" /> : null}
        {a.is_open_access === true || a.is_open_access === "True" ? <Chip label="Open access" tone="green" /> : null}
        {a.society ? <Chip label={a.society} tone="purple" /> : null}
      </View>
      <Text style={[styles.title, { color: t.text }]} selectable>
        {a.title}
      </Text>
      <Text style={[styles.meta, { color: t.textMuted }]}>
        {[source, a.pubdate, a.citation_count ? `${a.citation_count} citations` : null].filter(Boolean).join(" · ")}
      </Text>
      {shownAuthors ? <Text style={[styles.meta, { color: t.textSecondary }]}>{shownAuthors}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            tap();
            onToggleSave(a);
          }}
          style={[styles.btn, { backgroundColor: saved ? t.accentSoft : t.accent }]}
        >
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={16} color={saved ? t.accent : "#fff"} />
          <Text style={[styles.btnText, { color: saved ? t.accent : "#fff" }]}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>
        {url ? (
          <Pressable
            onPress={() => Linking.openURL(url)}
            style={[styles.btn, { backgroundColor: t.surfaceSoft }]}
          >
            <Ionicons name="open-outline" size={16} color={t.text} />
            <Text style={[styles.btnText, { color: t.text }]}>Source</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => Share.share({ message: `${a.title}${url ? `\n${url}` : ""}`, url: url || undefined })}
          style={[styles.btn, { backgroundColor: t.surfaceSoft }]}
        >
          <Ionicons name="share-outline" size={16} color={t.text} />
          <Text style={[styles.btnText, { color: t.text }]}>Share</Text>
        </Pressable>
      </View>

      <Block title="Rounds takeaway" tint={t.accentSoft}>{a.ai_rounds_takeaway}</Block>
      <Block title="Plain-language summary">{a.ai_summary || a.summary}</Block>
      <Block title="Why it matters">{a.ai_significance}</Block>
      <Block title="Key stats">{a.ai_key_stats}</Block>

      {a.ai_appraisal
        ? APPRAISAL.map(([k, label]) => (
            <Block key={k} title={label}>
              {a.ai_appraisal[k] ? (k === "strengths" || k === "weaknesses" ? "• " : "") + flat(a.ai_appraisal[k]) : null}
            </Block>
          ))
        : null}

      <Block title="Abstract">{a.abstract}</Block>
      <Text style={[styles.disclaimer, { color: t.textMuted }]}>
        AI summaries are a reading aid, not clinical advice. Always read the source paper.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 60 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  title: { fontSize: 24, fontWeight: "800", lineHeight: 30, letterSpacing: -0.4 },
  meta: { fontSize: 13.5, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  btnText: { fontWeight: "700", fontSize: 14.5 },
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 6 },
  blockTitle: { fontSize: 12.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  text: { fontSize: 15.5, lineHeight: 23 },
  disclaimer: { fontSize: 12, textAlign: "center", marginTop: 8 },
});
