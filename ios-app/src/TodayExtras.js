import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SectionTitle } from "./components";
import { allArticles } from "./data";
import { readingStreak, readsThisWeek, watchlistMatches } from "./studyTools";
import { useStore } from "./store";
import { radius, space, type, useCardStyle, useTheme } from "./theme";

// One dot per article in the weekly goal; filled as you read. Capped so a big goal stays tidy.
function GoalDots({ done, goal }) {
  const t = useTheme();
  const shown = Math.min(goal, 7);
  return (
    <View style={styles.dots} accessibilityElementsHidden>
      {Array.from({ length: shown }, (_, i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i < done ? (done >= goal ? t.green : t.accent) : t.surfaceSoft, borderColor: i < done ? "transparent" : t.border }]} />
      ))}
    </View>
  );
}

function GoalCard() {
  const t = useTheme();
  const card = useCardStyle();
  const { log, settings } = useStore();
  const done = readsThisWeek(log);
  const goal = settings.weeklyGoal;
  const streak = readingStreak(log);
  const reached = done >= goal;
  return (
    <View style={[styles.goal, card]} accessible accessibilityLabel={`${done} of ${goal} articles read this week${streak ? `, ${streak} day streak` : ""}`}>
      <View style={{ flex: 1, gap: space.sm }}>
        <Text style={[type.headline, { color: t.text }]}>{reached ? "Weekly goal reached" : "Your week"}</Text>
        <GoalDots done={done} goal={goal} />
        <Text style={[type.caption, { color: t.textMuted }]}>
          {reached ? `${done} read this week. Nice work.` : `${done} of ${goal} read this week`}
        </Text>
      </View>
      <View style={[styles.streak, { backgroundColor: streak ? t.amberSoft : t.surfaceSoft }]}>
        <Ionicons name="flame" size={20} color={streak ? t.amber : t.textMuted} />
        <Text style={{ color: streak ? t.amber : t.textMuted, fontWeight: "800", fontSize: 17 }}>{streak}</Text>
        <Text style={{ color: streak ? t.amber : t.textMuted, fontSize: 11, fontWeight: "700" }}>{streak === 1 ? "day" : "days"}</Text>
      </View>
    </View>
  );
}

function Watchlist({ navigation }) {
  const t = useTheme();
  const card = useCardStyle();
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
            style={[styles.watch, card]}
          >
            <View style={styles.watchTop}>
              <Ionicons name="eye" size={15} color={t.accent} />
              {fresh ? <View style={[styles.freshDot, { backgroundColor: t.teal }]} /> : null}
            </View>
            <Text style={[type.headline, { color: t.text }]} numberOfLines={1}>{entry.query}</Text>
            <Text style={{ color: fresh ? t.teal : t.textMuted, fontWeight: "700", fontSize: 13 }}>
              {fresh ? `${fresh} new` : `${articles.length} match${articles.length === 1 ? "" : "es"}`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

// Personal widgets for the Today screen: weekly goal and keyword watchlist.
export default function TodayExtras({ navigation }) {
  return (
    <View style={{ marginTop: space.xs }}>
      <View style={{ paddingHorizontal: space.lg }}>
        <GoalCard />
      </View>
      <View style={{ marginBottom: -10 }}>
        <Watchlist navigation={navigation} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  goal: { flexDirection: "row", alignItems: "center", gap: space.lg, borderRadius: radius.lg, padding: space.lg },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: StyleSheet.hairlineWidth },
  streak: { alignItems: "center", justifyContent: "center", gap: 1, borderRadius: radius.md, width: 64, paddingVertical: 10 },
  chips: { paddingHorizontal: space.lg, gap: space.md, paddingBottom: 22 },
  watch: { minWidth: 128, maxWidth: 220, borderRadius: radius.lg, padding: space.lg, gap: 4 },
  watchTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freshDot: { width: 8, height: 8, borderRadius: 4 },
});
