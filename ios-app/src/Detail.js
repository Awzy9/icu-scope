import { useState } from "react";
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Chip, tap } from "./components";
import ArticleTools from "./ArticleTools";
import CollectionsSheet from "./Collections";
import NoteBlock from "./NoteBlock";
import { articleKey } from "./data";
import { IMPACT_LABELS, impactScore } from "./evidence";
import { useStore } from "./store";
import { useTheme } from "./theme";

const APPRAISAL = [
  ["clinical_question", "Clinical question"],
  ["background", "Background"],
  ["design", "Design"],
  ["setting", "Setting"],
  ["population", "Population"],
  ["intervention", "Intervention"],
  ["management_common_to_both_groups", "Management common to both groups"],
  ["intervention_fidelity", "Intervention fidelity"],
  ["outcome", "Outcome"],
  ["author_conclusion", "Author's conclusion"],
  ["strengths", "Strengths"],
  ["weaknesses", "Weaknesses"],
  ["bottom_line", "The bottom line"],
];

const flat = (v) => (Array.isArray(v) ? v.map((x) => `• ${x}`).join("\n") : v);

const useScale = () => useStore().settings.textScale;

function Block({ title, icon, children }) {
  const t = useTheme();
  const s = useScale();
  if (!children) return null;
  return (
    <View style={[styles.block, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.blockHead}>
        {icon ? <Ionicons name={icon} size={15} color={t.accent} /> : null}
        <Text style={[styles.blockTitle, { color: t.accent }]}>{title}</Text>
      </View>
      <Text style={[styles.text, { color: t.text, fontSize: 16 * s, lineHeight: 24 * s }]} selectable>
        {children}
      </Text>
    </View>
  );
}

function Abstract({ text }) {
  const t = useTheme();
  const s = useScale();
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 520;
  return (
    <View style={[styles.block, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.blockHead}>
        <Ionicons name="document-text-outline" size={15} color={t.accent} />
        <Text style={[styles.blockTitle, { color: t.accent }]}>Abstract</Text>
      </View>
      <Text style={[styles.text, { color: t.text, fontSize: 16 * s, lineHeight: 24 * s }]} numberOfLines={open || !long ? undefined : 9} selectable>
        {text}
      </Text>
      {long ? (
        <Pressable onPress={() => setOpen(!open)} hitSlop={8} style={styles.more}>
          <Text style={{ color: t.accent, fontWeight: "700" }}>{open ? "Show less" : "Read full abstract"}</Text>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={t.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Detail({ article: a, saved, onToggleSave }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { seen, markSeen, markUnread, feed } = useStore();
  const prompts = feed?.spotlight?.pmid && feed.spotlight.pmid === a.pmid ? feed.spotlight.discussion_prompts || [] : [];
  const [sheet, setSheet] = useState(false);
  const read = seen.has(articleKey(a));
  const source = a.journal || a.source;
  const authors = Array.isArray(a.authors) ? a.authors : a.author ? [a.author] : [];
  const shownAuthors = authors.length > 5 ? `${authors.slice(0, 5).join(", ")} et al.` : authors.join(", ");
  const url = a.url || (a.doi ? `https://doi.org/${a.doi}` : null);
  const impact = impactScore(a);
  const takeaway = a.ai_rounds_takeaway;
  const summary = a.ai_summary || a.summary;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: 110 + insets.bottom }]} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.chips}>
          {a.study_type ? <Chip label={a.study_type} tone="accent" /> : null}
          {a.is_top_journal ? <Chip label="Top journal" tone="amber" icon="ribbon" /> : null}
          {a.is_open_access === true || a.is_open_access === "True" ? <Chip label="Open access" tone="green" icon="lock-open" /> : null}
          {a.society ? <Chip label={a.society} tone="purple" /> : null}
          {impact ? <Chip label={IMPACT_LABELS[impact]} tone="teal" /> : null}
        </View>

        <Text style={[styles.title, { color: t.text }]} selectable>
          {a.title}
        </Text>
        <Text style={[styles.meta, { color: t.textMuted }]}>
          {[source, a.pubdate, a.citation_count ? `${a.citation_count} citations` : null].filter(Boolean).join("  ·  ")}
        </Text>
        {shownAuthors ? <Text style={[styles.authors, { color: t.textSecondary }]}>{shownAuthors}</Text> : null}

        {takeaway ? (
          <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.takeaway}>
            <View style={styles.takeHead}>
              <Ionicons name="bulb" size={15} color="#fff" />
              <Text style={styles.takeKicker}>ROUNDS TAKEAWAY</Text>
            </View>
            <Text style={styles.takeText} selectable>
              {takeaway}
            </Text>
          </LinearGradient>
        ) : null}

        <Block title="In plain language" icon="chatbubble-ellipses-outline">{summary}</Block>
        <Block title="Why it matters" icon="trending-up">{a.ai_significance}</Block>
        <Block title="Key stats" icon="stats-chart">{a.ai_key_stats}</Block>

        {a.ai_appraisal
          ? APPRAISAL.map(([k, label]) => (
              <Block key={k} title={label} icon="checkmark-circle-outline">
                {flat(a.ai_appraisal[k])}
              </Block>
            ))
          : null}

        <Abstract text={a.abstract} />
        <Block title="Journal club questions" icon="people-outline">
          {prompts.length ? prompts.map((p, i) => `${i + 1}. ${p}`).join("\n\n") : null}
        </Block>
        <NoteBlock key={`note-${a.pmid || a.url}`} article={a} />
        <ArticleTools article={a} />
        <Text style={[styles.disclaimer, { color: t.textMuted }]}>
          AI summaries and impact ratings (estimated from study design, journal and citations) are reading aids, not clinical advice. Always read the source paper.
        </Text>
        <Pressable
          onPress={() => {
            tap();
            (read ? markUnread : markSeen)(a);
          }}
          hitSlop={8}
          style={styles.readToggle}
          accessibilityRole="button"
        >
          <Ionicons name={read ? "eye-off-outline" : "checkmark-done"} size={16} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700" }}>{read ? "Mark as unread" : "Mark as read"}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => {
            tap();
            onToggleSave(a);
          }}
          style={[styles.primary, { backgroundColor: saved ? t.accentSoft : t.accent }]}
        >
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={18} color={saved ? t.accent : "#fff"} />
          <Text style={[styles.btnText, { color: saved ? t.accent : "#fff" }]}>{saved ? "Saved" : "Save"}</Text>
        </Pressable>
        {saved ? (
          <Pressable
            onPress={() => {
              tap();
              setSheet(true);
            }}
            style={[styles.icon, { backgroundColor: t.surfaceSoft }]}
            accessibilityLabel="Add to collection"
          >
            <Ionicons name="albums-outline" size={20} color={t.text} />
          </Pressable>
        ) : null}
        {url ? (
          <Pressable onPress={() => Linking.openURL(url)} style={[styles.secondary, { backgroundColor: t.surfaceSoft }]}>
            <Ionicons name="open-outline" size={18} color={t.text} />
            <Text style={[styles.btnText, { color: t.text }]}>Source</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => Share.share({ message: `${a.title}${url ? `\n${url}` : ""}`, url: url || undefined })}
          style={[styles.icon, { backgroundColor: t.surfaceSoft }]}
          accessibilityLabel="Share"
        >
          <Ionicons name="share-outline" size={20} color={t.text} />
        </Pressable>
      </View>
      <CollectionsSheet visible={sheet} article={a} onClose={() => setSheet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 18, gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  title: { fontSize: 22, fontWeight: "800", lineHeight: 28, letterSpacing: -0.4 },
  meta: { fontSize: 13.5, lineHeight: 19 },
  authors: { fontSize: 13.5, lineHeight: 19 },
  takeaway: { borderRadius: 20, padding: 16, gap: 8, marginTop: 4 },
  takeHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  takeKicker: { color: "rgba(255,255,255,0.85)", fontWeight: "800", fontSize: 11, letterSpacing: 0.9 },
  takeText: { color: "#fff", fontSize: 17, lineHeight: 25, fontWeight: "600" },
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 8 },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  blockTitle: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  text: { fontSize: 16, lineHeight: 24 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  disclaimer: { fontSize: 12, textAlign: "center", marginTop: 8 },
  readToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  primary: { flex: 1.3, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 14 },
  secondary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 14, paddingVertical: 14 },
  icon: { width: 50, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  btnText: { fontWeight: "700", fontSize: 15.5 },
});
