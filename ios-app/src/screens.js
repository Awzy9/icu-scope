import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ArticleCard, Empty, SectionTitle, tap } from "./components";
import { allArticles, articleKey, buildSections, searchArticles } from "./data";
import { useStore } from "./store";
import { useTheme } from "./theme";

function useOpen(navigation) {
  return (article) => navigation.navigate("Detail", { article });
}

function Loading() {
  const { error, refresh } = useStore();
  const t = useTheme();
  if (error)
    return (
      <Empty icon="cloud-offline-outline" title="Can't load articles" hint={`${error}. Check your connection and try again.`} />
    );
  return (
    <View style={styles.center}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

export function TodayScreen({ navigation }) {
  const { feed, refreshing, refresh, savedKeys, offline } = useStore();
  const t = useTheme();
  const open = useOpen(navigation);
  if (!feed) return <Loading />;
  const spot = feed.spotlight;
  const spotArticle =
    spot && allArticles(feed).find((a) => a.pmid && a.pmid === spot.pmid);
  const trending = feed.trending?.articles || [];
  const week = feed.this_week?.articles || [];

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      {offline ? (
        <Text style={[styles.banner, { backgroundColor: t.amberSoft, color: t.amber }]}>
          Offline – showing the last downloaded articles
        </Text>
      ) : null}

      {spot ? (
        <Pressable
          onPress={() => open(spotArticle || { title: spot.title, pmid: spot.pmid, url: spot.url, journal: "", pubdate: spot.pubdate, study_type: spot.study_type, summary: spot.why_selected })}
          style={({ pressed }) => [styles.heroWrap, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
        >
          <LinearGradient colors={t.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroPill}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.heroKicker}>ARTICLE OF THE WEEK</Text>
            </View>
            <Text style={styles.heroTitle} numberOfLines={4}>{spot.title}</Text>
            <View style={styles.heroFoot}>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {[spot.study_type, spot.journal].filter(Boolean).join("  ·  ")}
              </Text>
              <View style={styles.heroGo}>
                <Ionicons name="arrow-forward" size={16} color="#0b3d91" />
              </View>
            </View>
          </LinearGradient>
        </Pressable>
      ) : null}

      {week.length ? (
        <>
          <SectionTitle>This week</SectionTitle>
          {week.map((a) => (
            <ArticleCard key={articleKey(a)} article={a} onPress={open} saved={savedKeys.has(articleKey(a))} />
          ))}
        </>
      ) : null}

      <SectionTitle
        action="See all"
        onAction={() => navigation.navigate("List", { title: "Trending", articles: trending })}
      >
        Trending
      </SectionTitle>
      {trending.slice(0, 5).map((a) => (
        <ArticleCard key={articleKey(a)} article={a} onPress={open} saved={savedKeys.has(articleKey(a))} />
      ))}
    </ScrollView>
  );
}

const CAT = {
  cardiovascular: ["heart", "rose"],
  respiratory: ["cloud", "accent"],
  neurology: ["flash", "purple"],
  renal: ["water", "teal"],
  "gi-nutrition": ["nutrition", "green"],
  "endocrine-metabolic": ["flask", "amber"],
  "infectious-sepsis": ["bug", "rose"],
  "hematology-coag": ["color-fill", "rose"],
  "trauma-surgical": ["bandage", "amber"],
  "procedures-pocus": ["pulse", "accent"],
  pharmacology: ["medkit", "purple"],
};
const SECTION_ICON = {
  guidelines: ["shield-checkmark", "purple"],
  ksa: ["globe", "green"],
  bottom_line: ["bulb", "amber"],
  foamed: ["mic", "teal"],
  preprints: ["document-text", "textMuted"],
};

function Tile({ icon, tone, label, count, onPress }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: t.surface, borderColor: t.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: t[`${tone}Soft`] || t.surfaceSoft }]}>
        <Ionicons name={icon} size={22} color={t[tone]} />
      </View>
      <Text style={[styles.tileLabel, { color: t.text }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.tileCount, { color: t.textMuted }]}>{count} articles</Text>
    </Pressable>
  );
}

export function BrowseScreen({ navigation }) {
  const { feed, refreshing, refresh } = useStore();
  const t = useTheme();
  const sections = useMemo(() => (feed ? buildSections(feed) : []), [feed]);
  if (!feed) return <Loading />;
  const go = (title, articles) => navigation.navigate("List", { title, articles });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <SectionTitle>Organ systems</SectionTitle>
      <View style={styles.grid}>
        {feed.categories.map((c) => {
          const [icon, tone] = CAT[c.id] || ["medical", "accent"];
          return <Tile key={c.id} icon={icon} tone={tone} label={c.label} count={c.articles.length} onPress={() => go(c.label, c.articles)} />;
        })}
      </View>
      <SectionTitle>More sources</SectionTitle>
      <View style={styles.grid}>
        {sections.map((s) => {
          const [icon, tone] = SECTION_ICON[s.id] || ["document-text", "accent"];
          return <Tile key={s.id} icon={icon} tone={tone} label={s.label} count={s.articles.length} onPress={() => go(s.label, s.articles)} />;
        })}
      </View>
    </ScrollView>
  );
}

export function ListScreen({ route, navigation }) {
  const { savedKeys } = useStore();
  const open = useOpen(navigation);
  const { articles } = route.params;
  return (
    <FlatList
      data={articles}
      keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: 12 }}
      renderItem={({ item }) => (
        <ArticleCard article={item} onPress={open} saved={savedKeys.has(articleKey(item))} />
      )}
      ListEmptyComponent={<Empty title="Nothing here yet" />}
    />
  );
}

export function SearchScreen({ navigation }) {
  const { feed, savedKeys } = useStore();
  const t = useTheme();
  const [q, setQ] = useState("");
  const open = useOpen(navigation);
  const pool = useMemo(() => (feed ? allArticles(feed) : []), [feed]);
  const results = useMemo(() => searchArticles(pool, q), [pool, q]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchBox, { backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Ionicons name="search" size={18} color={t.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search titles, abstracts, authors"
          placeholderTextColor={t.textMuted}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.input, { color: t.text }]}
        />
      </View>
      <FlatList
        data={results}
        keyboardDismissMode="on-drag"
        keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
        renderItem={({ item }) => (
          <ArticleCard article={item} onPress={open} saved={savedKeys.has(articleKey(item))} />
        )}
        ListEmptyComponent={
          q.trim() ? (
            <Empty icon="search-outline" title="No matches" hint="Try fewer or different words." />
          ) : (
            <Empty icon="search-outline" title="Search the literature" hint={`${pool.length} articles from the last few months.`} />
          )
        }
      />
    </View>
  );
}

export function SavedScreen({ navigation }) {
  const { saved, savedKeys } = useStore();
  const open = useOpen(navigation);
  return (
    <FlatList
      data={saved}
      keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingVertical: 12, flexGrow: 1 }}
      renderItem={({ item }) => (
        <ArticleCard article={item} onPress={open} saved={savedKeys.has(articleKey(item))} />
      )}
      ListEmptyComponent={
        <Empty icon="bookmark-outline" title="No saved articles" hint="Tap Save on any article to keep it here, even offline." />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { textAlign: "center", paddingVertical: 8, fontWeight: "600", fontSize: 13 },
  heroWrap: { marginHorizontal: 16, marginTop: 8, marginBottom: 6, borderRadius: 24, overflow: "hidden" },
  hero: { padding: 20, gap: 14 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  heroKicker: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 0.9 },
  heroTitle: { color: "#fff", fontSize: 21, fontWeight: "800", lineHeight: 27, letterSpacing: -0.3 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 12 },
  heroMeta: { flex: 1, color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "500" },
  heroGo: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12 },
  tile: { width: "47%", flexGrow: 1, margin: 4, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 4, minHeight: 124 },
  tileIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  tileLabel: { fontSize: 15.5, fontWeight: "700", lineHeight: 20 },
  tileCount: { fontSize: 12.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 12, borderRadius: 14, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
});
