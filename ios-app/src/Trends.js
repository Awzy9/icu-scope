import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty } from "./components";
import { allArticles } from "./data";
import { countBy, monthlyCounts } from "./studyTools";
import { useStore } from "./store";
import { useTheme } from "./theme";

function Bars({ data, horizontal }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.count));
  if (horizontal) {
    return (
      <View style={{ gap: 8 }}>
        {data.map((d) => (
          <View key={d.label} style={styles.hRow}>
            <Text style={{ color: t.textSecondary, fontSize: 13, width: 118 }} numberOfLines={1}>{d.label}</Text>
            <View style={[styles.hTrack, { backgroundColor: t.surfaceSoft }]}>
              <View style={[styles.hFill, { backgroundColor: t.accent, width: `${(d.count / max) * 100}%` }]} />
            </View>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 13, width: 30, textAlign: "right" }}>{d.count}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.vChart}>
      {data.map((d) => (
        <View key={d.label} style={styles.vCol}>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 12 }}>{d.count}</Text>
          <View style={[styles.vBar, { backgroundColor: t.accent, height: Math.max(4, (d.count / max) * 120) }]} />
          <Text style={{ color: t.textMuted, fontSize: 12 }}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Panel({ title, note, children }) {
  const t = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={{ color: t.text, fontWeight: "800", fontSize: 16.5 }}>{title}</Text>
      {children}
      {note ? <Text style={{ color: t.textMuted, fontSize: 12 }}>{note}</Text> : null}
    </View>
  );
}

// What is being published, from the downloaded feed. Counts only cover the articles in the app.
export default function Trends() {
  const { feed } = useStore();
  const pool = useMemo(() => (feed ? allArticles(feed) : []), [feed]);
  const months = useMemo(() => monthlyCounts(pool, 6), [pool]);
  const types = useMemo(() => countBy(pool, (a) => a.study_type).slice(0, 6), [pool]);
  const systems = useMemo(
    () => (feed?.categories || []).map((c) => ({ label: c.label, count: c.articles.length })).sort((a, b) => b.count - a.count),
    [feed],
  );
  if (!feed) return <Empty icon="stats-chart-outline" title="Trends need the feed" hint="Open the app online once to download articles." />;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Panel title="Published per month" note={`${pool.length} articles in the app, by publication date.`}>
        <Bars data={months} />
      </Panel>
      <Panel title="By study type">
        <Bars data={types} horizontal />
      </Panel>
      <Panel title="By organ system" note="Counts cover the journals and search terms ICU Scope follows, not all of PubMed.">
        <Bars data={systems} horizontal />
      </Panel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  vChart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", minHeight: 170 },
  vCol: { alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" },
  vBar: { width: 22, borderRadius: 6 },
  hRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hTrack: { flex: 1, height: 12, borderRadius: 6, overflow: "hidden" },
  hFill: { height: 12, borderRadius: 6 },
});
