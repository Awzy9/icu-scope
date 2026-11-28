import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Empty, ScreenTitle, tap } from "./components";
import { dueKeys, readingLogCsv, readingStreak, readsThisWeek } from "./studyTools";
import { SavedScreen } from "./screens";
import { useStore } from "./store";
import { radius, space, useCardStyle, useTheme } from "./theme";

const PARTS = [
  { value: "saved", label: "Saved" },
  { value: "notes", label: "Notes" },
  { value: "log", label: "Reading log" },
];

function NotesView({ navigation }) {
  const t = useTheme();
  const cardStyle = useCardStyle();
  const { notes } = useStore();
  const items = useMemo(() => Object.values(notes).sort((a, b) => b.at - a.at), [notes]);
  return (
    <FlatList
      data={items}
      keyExtractor={(n, i) => `${n.article.pmid || n.article.url}-${i}`}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      ListEmptyComponent={
        <Empty icon="create-outline" title="No notes yet" hint="Open any article and write in “My notes”. Your notes stay on this device." />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => navigation.navigate("Detail", { article: item.article })}
          accessibilityRole="button"
          style={[styles.card, cardStyle]}
        >
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 15.5 }} numberOfLines={2}>
            {item.article.title}
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 15, lineHeight: 21 }} numberOfLines={4}>
            {item.text}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 12.5 }}>{new Date(item.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Text>
        </Pressable>
      )}
    />
  );
}

function Stat({ value, label }) {
  const t = useTheme();
  const cardStyle = useCardStyle();
  return (
    <View style={[styles.stat, cardStyle]}>
      <Text style={{ color: t.accent, fontSize: 24, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: t.textMuted, fontSize: 12.5 }}>{label}</Text>
    </View>
  );
}

function LogView() {
  const t = useTheme();
  const cardStyle = useCardStyle();
  const { log, settings } = useStore();
  const rows = useMemo(() => Object.values(log).sort((a, b) => b.at - a.at), [log]);
  const week = readsThisWeek(log);
  return (
    <FlatList
      data={rows}
      keyExtractor={(r, i) => `${r.at}-${i}`}
      contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 6 }}>
          <View style={styles.stats}>
            <Stat value={`${week}/${settings.weeklyGoal}`} label="this week" />
            <Stat value={String(readingStreak(log))} label="day streak" />
            <Stat value={String(rows.length)} label="articles read" />
          </View>
          {rows.length ? (
            <Pressable
              onPress={() => Share.share({ title: "ICU Scope reading log", message: readingLogCsv(log) })}
              accessibilityRole="button"
              style={[styles.export, { backgroundColor: t.accent }]}
            >
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15.5 }}>Export for CPD or journal club (CSV)</Text>
            </Pressable>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Empty icon="time-outline" title="Your reading log is empty" hint="Articles you open are logged here with the date, so you can export a record of what you read." />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => item.url && Linking.openURL(item.url)}
          accessibilityRole="link"
          style={[styles.card, cardStyle]}
        >
          <Text style={{ color: t.textMuted, fontSize: 12.5 }}>
            {new Date(item.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </Text>
          <Text style={{ color: t.text, fontWeight: "700", fontSize: 15.5 }} numberOfLines={3}>
            {item.title}
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13.5 }}>{[item.study_type, item.journal].filter(Boolean).join(" · ")}</Text>
        </Pressable>
      )}
    />
  );
}

// The Saved tab: saved articles and collections, notes, and the reading log.
export default function LibraryScreen({ navigation, route }) {
  const t = useTheme();
  const { deck, notes, log, saved } = useStore();
  const [part, setPart] = useState("saved");
  const due = dueKeys(deck).length;
  const deckSize = Object.keys(deck).length;
  const counts = { saved: null, notes: Object.keys(notes).length, log: Object.keys(log).length };

  return (
    <View style={{ flex: 1 }}>
      <ScreenTitle
        title="Library"
        subtitle={`${saved.length} saved · ${counts.notes} ${counts.notes === 1 ? "note" : "notes"} · ${counts.log} read`}
      />
      <View style={styles.top}>
        <View style={[styles.segmented, { backgroundColor: t.surfaceSoft }]}>
          {PARTS.map((p) => {
            const on = p.value === part;
            return (
              <Pressable
                key={p.value}
                onPress={() => {
                  tap();
                  setPart(p.value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.segment, on && { backgroundColor: t.surface }]}
              >
                <Text style={{ color: on ? t.accent : t.textSecondary, fontWeight: "700", fontSize: 13.5 }}>
                  {p.label}
                  {counts[p.value] ? ` ${counts[p.value]}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => navigation.navigate("Review")}
          accessibilityRole="button"
          style={[styles.deck, { backgroundColor: t.accentSoft }]}
        >
          <Ionicons name="albums-outline" size={18} color={t.accent} />
          <Text style={{ color: t.accent, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            {deckSize ? "Flashcards" : "Build a flashcard deck"}
          </Text>
          {deckSize ? (
            <View style={[styles.dueBadge, { backgroundColor: due ? t.accent : t.surface }]}>
              <Text style={{ color: due ? "#fff" : t.textMuted, fontWeight: "800", fontSize: 12.5 }}>{due ? `${due} due` : "All caught up"}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={16} color={t.accent} />
        </Pressable>
      </View>
      {part === "saved" ? <SavedScreen navigation={navigation} route={route} /> : null}
      {part === "notes" ? <NotesView navigation={navigation} /> : null}
      {part === "log" ? <LogView /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: space.lg, paddingTop: 2, paddingBottom: space.sm, gap: space.sm },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  deck: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11 },
  dueBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  card: { borderRadius: radius.lg, padding: space.lg, gap: 6 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: radius.md, padding: 12, alignItems: "center", gap: 2 },
  export: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
});
