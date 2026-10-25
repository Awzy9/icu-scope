import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ArticleCard, Chip, Empty, SectionTitle, tap } from "./components";
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
      <Empty title="Can't load articles" hint={`${error}. Check your connection and try again.`} />
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
          style={[styles.hero, { backgroundColor: t.accent }]}
        >
          <Text style={styles.heroKicker}>⭐ ARTICLE OF THE WEEK</Text>
          <Text style={styles.heroTitle} numberOfLines={4}>{spot.title}</Text>
          {spot.why_selected ? (
            <Text style={styles.heroBody} numberOfLines={4}>{spot.why_selected}</Text>
          ) : null}
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

export function BrowseScreen({ navigation }) {
  const { feed, refreshing, refresh } = useStore();
  const t = useTheme();
  const sections = useMemo(() => (feed ? buildSections(feed) : []), [feed]);
  if (!feed) return <Loading />;

  const rows = [
    ...feed.categories.map((c) => ({ id: c.id, label: c.label, icon: c.abbr, articles: c.articles, tone: "accent" })),
    ...sections.map((s) => ({ ...s, tone: "purple" })),
  ];

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => {
            tap();
            navigation.navigate("List", { title: item.label, articles: item.articles });
          }}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={[styles.badge, { backgroundColor: t[`${item.tone}Soft`] }]}>
            <Text style={{ color: t[item.tone], fontWeight: "800", fontSize: item.icon.length > 3 ? 18 : 13 }}>
              {item.icon}
            </Text>
          </View>
          <Text style={[styles.rowLabel, { color: t.text }]} numberOfLines={1}>{item.label}</Text>
          <Text style={{ color: t.textMuted }}>{item.articles.length}</Text>
          <Text style={{ color: t.textMuted, fontSize: 18 }}>›</Text>
        </Pressable>
      )}
    />
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
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search titles, abstracts, authors"
        placeholderTextColor={t.textMuted}
        autoCorrect={false}
        clearButtonMode="while-editing"
        returnKeyType="search"
        style={[styles.input, { backgroundColor: t.surfaceSoft, color: t.text }]}
      />
      <FlatList
        data={results}
        keyboardDismissMode="on-drag"
        keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
        renderItem={({ item }) => (
          <ArticleCard article={item} onPress={open} saved={savedKeys.has(articleKey(item))} />
        )}
        ListEmptyComponent={
          q.trim() ? (
            <Empty title="No matches" hint="Try fewer or different words." />
          ) : (
            <Empty title="Search the literature" hint={`${pool.length} articles from the last few months.`} />
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
        <Empty title="No saved articles" hint="Tap ☆ Save on any article to keep it here, even offline." />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { textAlign: "center", paddingVertical: 8, fontWeight: "600", fontSize: 13 },
  hero: { margin: 16, borderRadius: 20, padding: 18, gap: 8 },
  heroKicker: { color: "#d8f5ec", fontWeight: "800", fontSize: 12, letterSpacing: 0.8 },
  heroTitle: { color: "#fff", fontSize: 21, fontWeight: "800", lineHeight: 27 },
  heroBody: { color: "#e6f5f1", fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, fontSize: 16.5, fontWeight: "600" },
  input: { margin: 16, marginBottom: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
});
