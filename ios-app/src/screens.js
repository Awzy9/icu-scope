import { useLayoutEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ArticleCard, Carousel, Empty, FilterBar, SectionTitle, SkeletonList, filterOptions, tap } from "./components";
import { allArticles, articleKey, buildSections, searchArticles } from "./data";
import { useStore } from "./store";
import { useTheme } from "./theme";

function useOpen(navigation) {
  return (article) => navigation.navigate("Detail", { article });
}

function Loading({ hero }) {
  const { error, refresh } = useStore();
  if (error)
    return (
      <Empty
        icon="cloud-offline-outline"
        title="Can't load articles"
        hint={`${error}. Check your connection and try again.`}
        action={{ label: "Try again", onPress: refresh }}
      />
    );
  return <SkeletonList hero={hero} />;
}

export function TodayScreen({ navigation }) {
  const { feed, refreshing, refresh, offline, settings, seen } = useStore();
  const t = useTheme();
  const open = useOpen(navigation);
  if (!feed) return <Loading hero />;
  const spot = feed.spotlight;
  const spotArticle =
    spot && allArticles(feed).find((a) => a.pmid && a.pmid === spot.pmid);
  const trending = feed.trending?.articles || [];
  const week = feed.this_week?.articles || [];
  const guidelines = feed.guidelines?.articles || [];
  const skip = new Set([...week, ...trending.slice(0, 8)].map(articleKey));
  const latest = allArticles(feed, settings.hiddenCategories).filter((a) => a.pmid && !skip.has(articleKey(a))).slice(0, 10);

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

      <Text style={[styles.today, { color: t.textMuted }]}>
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        {week.length ? `  ·  ${week.filter((a) => !seen.has(articleKey(a))).length} unread this week` : ""}
      </Text>

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
          {week.map((a, i) => (
            <ArticleCard key={articleKey(a)} article={a} onPress={open} index={i} />
          ))}
        </>
      ) : null}

      <SectionTitle
        action="See all"
        onAction={() => navigation.navigate("List", { title: "Trending", articles: trending })}
      >
        Trending
      </SectionTitle>
      <Carousel data={trending.slice(0, 8)} onPress={open} />

      {guidelines.length ? (
        <>
          <SectionTitle
            action="See all"
            onAction={() => navigation.navigate("List", { title: "Guideline Watch", articles: guidelines })}
          >
            Guidelines
          </SectionTitle>
          <Carousel data={guidelines.slice(0, 8)} onPress={open} />
        </>
      ) : null}

      {latest.length ? (
        <>
          <SectionTitle>Latest</SectionTitle>
          {latest.map((a, i) => (
            <ArticleCard key={articleKey(a)} article={a} onPress={open} index={i} />
          ))}
        </>
      ) : null}
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
  trial_results: ["checkmark-done-circle", "green"],
  trials: ["flask", "teal"],
  guidelines: ["shield-checkmark", "purple"],
  ksa: ["globe", "green"],
  bottom_line: ["bulb", "amber"],
  foamed: ["mic", "teal"],
  preprints: ["document-text", "textMuted"],
};

function Tile({ icon, tone, label, count, fresh, onPress }) {
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
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: t[`${tone}Soft`] || t.surfaceSoft }]}>
          <Ionicons name={icon} size={22} color={t[tone]} />
        </View>
        {fresh ? (
          <View style={[styles.fresh, { backgroundColor: t.tealSoft }]}>
            <Text style={{ color: t.teal, fontWeight: "800", fontSize: 12 }}>{fresh} new</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileLabel, { color: t.text }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.tileCount, { color: t.textMuted }]}>{count} articles</Text>
    </Pressable>
  );
}

export function BrowseScreen({ navigation }) {
  const { feed, refreshing, refresh, settings, seen } = useStore();
  const t = useTheme();
  const sections = useMemo(() => (feed ? buildSections(feed) : []), [feed]);
  if (!feed) return <Loading />;
  // "New" = published this week and not opened yet. The feed pulls this week's
  // articles out of their organ-system lists, so match them by category id.
  const fresh = (id) =>
    (feed.this_week?.articles || []).filter(
      (a) => (a.category_ids || [a.category_id]).includes(id) && !seen.has(articleKey(a)),
    ).length;
  const go = (title, articles) => navigation.navigate("List", { title, articles });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} />}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <SectionTitle>Organ systems</SectionTitle>
      <View style={styles.grid}>
        {feed.categories.filter((c) => !settings.hiddenCategories.includes(c.id)).map((c) => {
          const [icon, tone] = CAT[c.id] || ["medical", "accent"];
          return <Tile key={c.id} icon={icon} tone={tone} label={c.label} count={c.articles.length} fresh={fresh(c.id)} onPress={() => go(c.label, c.articles)} />;
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
  const open = useOpen(navigation);
  const { articles } = route.params;
  const { seen, settings, markAllSeen } = useStore();
  const t = useTheme();
  const [type, setType] = useState(null);
  const options = useMemo(() => filterOptions(articles), [articles]);
  const shown = useMemo(() => {
    const byType = type ? articles.filter((a) => a.study_type === type) : articles;
    return settings.hideRead ? byType.filter((a) => !seen.has(articleKey(a))) : byType;
  }, [articles, type, settings.hideRead, seen]);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => markAllSeen(articles)} hitSlop={10} accessibilityLabel="Mark all as read">
          <Ionicons name="checkmark-done" size={22} color={t.accent} />
        </Pressable>
      ),
    });
  }, [navigation, articles, markAllSeen, t.accent]);
  return (
    <FlatList
      data={shown}
      keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 24 }}
      stickyHeaderIndices={options.length > 1 ? [0] : undefined}
      ListHeaderComponent={<FilterBar total={articles.length} options={options} value={type} onChange={setType} />}
      renderItem={({ item, index }) => <ArticleCard article={item} onPress={open} index={index} />}
      ListEmptyComponent={
        settings.hideRead && articles.length ? (
          <Empty icon="checkmark-done-outline" title="All caught up" hint="You've read everything here. Turn off “Hide read articles” in Settings to see it again." />
        ) : (
          <Empty title="Nothing here yet" />
        )
      }
    />
  );
}

export function SearchScreen({ navigation }) {
  const { feed, settings } = useStore();
  const t = useTheme();
  const [q, setQ] = useState("");
  const open = useOpen(navigation);
  const pool = useMemo(() => (feed ? allArticles(feed, settings.hiddenCategories) : []), [feed, settings.hiddenCategories]);
  const [type, setType] = useState(null);
  const found = useMemo(() => searchArticles(pool, q), [pool, q]);
  const options = useMemo(() => filterOptions(found), [found]);
  const results = useMemo(() => (type ? found.filter((a) => a.study_type === type) : found), [found, type]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchBox, { backgroundColor: t.surface, borderColor: t.border, borderWidth: StyleSheet.hairlineWidth }]}>
        <Ionicons name="search" size={18} color={t.textMuted} />
        <TextInput
          value={q}
          onChangeText={(v) => {
            setQ(v);
            setType(null);
          }}
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
        ListHeaderComponent={<FilterBar total={found.length} options={options} value={type} onChange={setType} />}
        keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
        renderItem={({ item, index }) => <ArticleCard article={item} onPress={open} index={index} />}
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
  const { saved, collections, deleteCollection } = useStore();
  const t = useTheme();
  const open = useOpen(navigation);
  const [cid, setCid] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const col = collections.find((c) => c.id === cid);
  const savedKeys = useMemo(() => new Set(saved.map(articleKey)), [saved]);
  const options = collections.map((c) => ({ key: c.id, label: c.name, n: c.keys.filter((k) => savedKeys.has(k)).length }));
  const shown = col ? saved.filter((a) => col.keys.includes(articleKey(a))) : saved;

  return (
    <FlatList
      data={shown}
      keyExtractor={(a, i) => `${articleKey(a)}-${i}`}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
      ListHeaderComponent={
        <View>
          <FilterBar
            min={1}
            total={saved.length}
            options={options}
            value={cid}
            onChange={(id) => {
              setCid(id);
              setConfirmDelete(false);
            }}
          />
          {col ? (
            <Pressable
              onPress={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                deleteCollection(col.id);
                setCid(null);
                setConfirmDelete(false);
              }}
              style={styles.deleteRow}
              accessibilityRole="button"
            >
              <Ionicons name="trash-outline" size={15} color={t.rose} />
              <Text style={{ color: t.rose, fontWeight: "600", fontSize: 13.5 }}>
                {confirmDelete ? "Tap again to delete this collection (articles stay saved)" : `Delete “${col.name}”`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => <ArticleCard article={item} onPress={open} index={index} />}
      ListEmptyComponent={
        col ? (
          <Empty icon="albums-outline" title="Nothing in this collection" hint="Open a saved article and tap the collections button to add it." />
        ) : (
          <Empty
            icon="bookmark-outline"
            title="No saved articles"
            hint="Tap Save on any article to keep it here, even offline. Then group articles into collections, like “Sepsis journal club”."
          />
        )
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
  today: { fontSize: 13.5, fontWeight: "600", paddingHorizontal: 20, paddingTop: 4 },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  fresh: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  deleteRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
  tileIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 15.5, fontWeight: "700", lineHeight: 20 },
  tileCount: { fontSize: 12.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, margin: 16, marginBottom: 12, borderRadius: 14, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
});
