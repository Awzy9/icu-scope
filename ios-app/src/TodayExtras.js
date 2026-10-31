import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { SectionTitle, tap } from "./components";
import { allArticles } from "./data";
import { briefingText, readingStreak, readsThisWeek, watchlistMatches } from "./studyTools";
import { useStore } from "./store";
import { useTheme } from "./theme";

function GoalCard() {
  const t = useTheme();
  const { log, settings } = useStore();
  const done = readsThisWeek(log);
  const goal = settings.weeklyGoal;
  const pct = Math.min(1, done / goal);
  const streak = readingStreak(log);
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { color: t.text }]}>
          {done >= goal ? "Weekly goal reached" : `${done} of ${goal} articles this week`}
        </Text>
        {streak > 0 ? (
          <View style={[styles.pill, { backgroundColor: t.amberSoft }]}>
            <Ionicons name="flame" size={13} color={t.amber} />
            <Text style={{ color: t.amber, fontWeight: "800", fontSize: 12.5 }}>{streak} day{streak === 1 ? "" : "s"}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: t.surfaceSoft }]}>
        <View style={[styles.fill, { backgroundColor: done >= goal ? t.green : t.accent, width: `${Math.round(pct * 100)}%` }]} />
      </View>
    </View>
  );
}

function ListenRow() {
  const t = useTheme();
  const { feed } = useStore();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => Speech.stop(), []);
  const toggle = () => {
    tap();
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(briefingText(feed), {
      language: "en-US",
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      style={[styles.card, styles.listen, { backgroundColor: t.accentSoft, borderColor: t.border }]}
    >
      <Ionicons name={speaking ? "stop-circle" : "play-circle"} size={30} color={t.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.accent, fontWeight: "800", fontSize: 15.5 }}>{speaking ? "Stop briefing" : "Listen to this week's briefing"}</Text>
        <Text style={{ color: t.textSecondary, fontSize: 13 }}>Read aloud on your device</Text>
      </View>
    </Pressable>
  );
}

function Watchlist({ navigation }) {
  const t = useTheme();
  const { feed, settings, seen, watchlist } = useStore();
  const matches = useMemo(
    () => watchlistMatches(allArticles(feed, settings.hiddenCategories), watchlist, seen),
    [feed, settings.hiddenCategories, watchlist, seen],
  );
  if (!watchlist.length) return null;
  return (
    <>
      <SectionTitle>Watchlist</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {matches.map(({ entry, articles, fresh }) => (
          <Pressable
            key={entry.id}
            onPress={() => navigation.navigate("List", { title: `Watch: ${entry.query}`, articles })}
            accessibilityRole="button"
            style={[styles.watch, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <Text style={{ color: t.text, fontWeight: "800", fontSize: 15.5 }} numberOfLines={1}>{entry.query}</Text>
            <Text style={{ color: fresh ? t.teal : t.textMuted, fontWeight: "700", fontSize: 13 }}>
              {fresh ? `${fresh} new` : `${articles.length} match${articles.length === 1 ? "" : "es"}`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

// Personal widgets for the Today screen: weekly goal, spoken briefing, keyword watchlist.
export default function TodayExtras({ navigation }) {
  return (
    <View style={{ gap: 10, paddingHorizontal: 16, paddingTop: 6 }}>
      <GoalCard />
      <ListenRow />
      <View style={{ marginHorizontal: -16 }}>
        <Watchlist navigation={navigation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15.5, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pill: { flexDirection: "row", gap: 4, alignItems: "center", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  track: { height: 8, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  listen: { flexDirection: "row", alignItems: "center", gap: 12 },
  chips: { paddingHorizontal: 16, gap: 10 },
  watch: { minWidth: 130, maxWidth: 220, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4 },
});
