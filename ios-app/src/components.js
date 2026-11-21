import { useEffect, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { articleKey } from "./data";
import { impactScore } from "./evidence";
import { SORTS } from "./studyTools";
import { useStore } from "./store";
import { TYPE, TYPE_DEFAULT, radius, space, type, useCardStyle, useTheme } from "./theme";

export const tap = () => Haptics.selectionAsync().catch(() => {});

export function Chip({ label, tone = "accent", icon }) {
  const t = useTheme();
  const soft = t[`${tone}Soft`] || t.surfaceSoft;
  return (
    <View style={[styles.chip, { backgroundColor: soft }]}>
      {icon ? <Ionicons name={icon} size={12} color={t[tone]} /> : null}
      <Text style={[styles.chipText, { color: t[tone] || t.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Large title at the top of a tab screen (the native header is hidden on tabs).
export function ScreenTitle({ title, subtitle, right, eyebrow }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenTitle, { paddingTop: insets.top + space.md }]}>
      {eyebrow}
      <View style={styles.screenTitleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[type.largeTitle, { color: t.text }]} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={[type.callout, { color: t.textMuted, marginTop: 2 }]}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  );
}

// Fades and slides content in on mount; `index` staggers list items a little.
export function FadeIn({ index = 0, children, style }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, delay: Math.min(index, 6) * 45, useNativeDriver: true }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

export const FILTER_LABEL = {
  "Randomized Controlled Trial": "RCT",
  "Systematic Review": "Syst. review",
  "Meta-Analysis": "Meta-analysis",
  "Observational Study": "Observational",
  "Multicenter Study": "Multicenter",
  "Practice Guideline": "Guideline",
};

// Study type as a soft pill: colour and icon say what kind of evidence it is.
function TypePill({ article }) {
  const t = useTheme();
  const [tone, icon] = TYPE[article.study_type] || TYPE_DEFAULT;
  const label = article.society || FILTER_LABEL[article.study_type] || article.study_type || "Article";
  return (
    <View style={[styles.pill, { backgroundColor: t[`${tone}Soft`] || t.surfaceSoft }]}>
      <Ionicons name={icon} size={12} color={t[tone]} />
      <Text style={[styles.pillText, { color: t[tone] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// Compact evidence rating, e.g. ★★★★ for a strong study. Hidden when there is no rating.
function ImpactStars({ article }) {
  const t = useTheme();
  const score = impactScore(article);
  if (!score) return null;
  return (
    <Text style={{ color: t.amber, fontSize: 12, letterSpacing: 1 }} accessibilityLabel={`Evidence rating ${score} of 5`}>
      {"★".repeat(score)}
    </Text>
  );
}

function useCardInfo(article) {
  const t = useTheme();
  const { seen, savedKeys } = useStore();
  const k = articleKey(article);
  return { t, isNew: !seen.has(k), read: seen.has(k), saved: savedKeys.has(k) };
}

export function ArticleCard({ article, onPress, index = 0 }) {
  const { t, isNew, read, saved } = useCardInfo(article);
  const card = useCardStyle();
  const source = article.journal || article.source;
  const blurb = article.ai_rounds_takeaway || article.ai_summary || article.summary;
  return (
    <FadeIn index={index}>
      <Pressable
        onPress={() => {
          tap();
          onPress(article);
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, card, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
      >
        <View style={styles.topRow}>
          <TypePill article={article} />
          {article.is_top_journal ? <Ionicons name="ribbon" size={15} color={t.amber} accessibilityLabel="Top journal" /> : null}
          <View style={{ flex: 1 }} />
          <ImpactStars article={article} />
          {saved ? <Ionicons name="bookmark" size={16} color={t.accent} /> : null}
          {isNew && !saved ? <View style={[styles.dot, { backgroundColor: t.teal }]} /> : null}
        </View>
        <Text style={[type.headline, { color: read ? t.textSecondary : t.text, fontWeight: read ? "600" : "700" }]} numberOfLines={4}>
          {article.title}
        </Text>
        {blurb ? (
          <Text style={[type.callout, { color: t.textSecondary }]} numberOfLines={2}>
            {blurb}
          </Text>
        ) : null}
        <Text style={[type.caption, { color: t.textMuted }]} numberOfLines={1}>
          {[source, article.pubdate].filter(Boolean).join("  ·  ")}
        </Text>
      </Pressable>
    </FadeIn>
  );
}

// Compact card for horizontal carousels.
export function MiniCard({ article, onPress, index = 0 }) {
  const { t, isNew } = useCardInfo(article);
  const card = useCardStyle();
  return (
    <FadeIn index={index}>
      <Pressable
        onPress={() => {
          tap();
          onPress(article);
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.mini, card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        <View style={styles.topRow}>
          <TypePill article={article} />
          <View style={{ flex: 1 }} />
          <ImpactStars article={article} />
          {isNew ? <View style={[styles.dot, { backgroundColor: t.teal }]} /> : null}
        </View>
        <Text style={[type.headline, { color: t.text, fontSize: 15.5, lineHeight: 21 }]} numberOfLines={4}>
          {article.title}
        </Text>
        <Text style={[type.caption, { color: t.textMuted, marginTop: "auto" }]} numberOfLines={1}>
          {[article.journal || article.source, article.pubdate].filter(Boolean).join(" · ")}
        </Text>
      </Pressable>
    </FadeIn>
  );
}

export function Carousel({ data, onPress }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} snapToInterval={256} decelerationRate="fast">
      {data.map((a, i) => (
        <MiniCard key={articleKey(a) + i} article={a} onPress={onPress} index={i} />
      ))}
    </ScrollView>
  );
}

// Study-type filter chips for a list; returns [filtered, bar element].
export function filterOptions(articles) {
  const counts = {};
  articles.forEach((a) => {
    if (a.study_type) counts[a.study_type] = (counts[a.study_type] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 7)
    .map(([key, n]) => ({ key, label: FILTER_LABEL[key] || key, n }));
}

// Pill-style single choice: options are { value, label }.
export function Segmented({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surfaceSoft }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: t.surface }]}
          >
            <Text style={{ color: on ? t.accent : t.textSecondary, fontWeight: "700", fontSize: 13.5 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FilterBar({ total, options, value, onChange, min = 2 }) {
  const t = useTheme();
  if (options.length < min) return null;
  const all = [{ key: null, label: "All", n: total }, ...options];
  return (
    <View style={{ backgroundColor: t.bg }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {all.map((o) => {
          const on = value === o.key;
          return (
            <Pressable
              key={String(o.key)}
              onPress={() => {
                tap();
                onChange(o.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.filter, { backgroundColor: on ? t.accent : t.surface, borderColor: on ? t.accent : t.border }]}
            >
              <Text style={{ color: on ? "#fff" : t.textSecondary, fontWeight: "700", fontSize: 13.5 }}>
                {o.label} <Text style={{ opacity: 0.7, fontWeight: "600" }}>{o.n}</Text>
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// One quiet line under the filters: result count, sort menu and an optional extra action (e.g. Watch).
export function ResultsBar({ count, sort, onSort, extra }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = SORTS.find((s) => s.value === sort) || SORTS[0];
  return (
    <View style={[styles.resultsBar, { backgroundColor: t.bg }]}>
      <Text style={[type.caption, { color: t.textMuted, flex: 1 }]}>
        {count} {count === 1 ? "result" : "results"}
      </Text>
      {extra}
      <Pressable
        onPress={() => {
          tap();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${current.label}`}
        hitSlop={8}
        style={[styles.sortButton, { backgroundColor: sort === "default" ? t.surfaceSoft : t.accentSoft }]}
      >
        <Ionicons name="swap-vertical" size={14} color={sort === "default" ? t.textSecondary : t.accent} />
        <Text style={{ color: sort === "default" ? t.textSecondary : t.accent, fontWeight: "700", fontSize: 12.5 }}>{current.label}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sortSheet, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[type.headline, { color: t.text, paddingHorizontal: space.lg, paddingBottom: space.sm }]}>Sort by</Text>
          {SORTS.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => {
                tap();
                onSort(s.value);
                setOpen(false);
              }}
              accessibilityRole="button"
              style={styles.sortRowItem}
            >
              <Text style={[type.body, { color: t.text, flex: 1 }]}>{s.label}</Text>
              {s.value === sort ? <Ionicons name="checkmark" size={20} color={t.accent} /> : null}
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

export function SectionTitle({ children, action, onAction }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[type.section, { color: t.text }]} accessibilityRole="header">
        {children}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} style={styles.action} accessibilityRole="button">
          <Text style={{ color: t.accent, fontWeight: "600", fontSize: 14 }}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={t.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Bone({ style }) {
  const t = useTheme();
  const [v] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[{ backgroundColor: t.surfaceSoft, borderRadius: 8, opacity: v }, style]} />;
}

export function SkeletonList({ hero = false }) {
  const card = useCardStyle();
  return (
    <View style={{ paddingTop: 8 }}>
      {hero ? <Bone style={{ height: 210, marginHorizontal: 16, marginBottom: 22, borderRadius: radius.xl }} /> : null}
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, card, { gap: 10 }]}>
          <Bone style={{ height: 12, width: "35%" }} />
          <Bone style={{ height: 18, width: "92%" }} />
          <Bone style={{ height: 18, width: "70%" }} />
          <Bone style={{ height: 12, width: "50%" }} />
        </View>
      ))}
    </View>
  );
}

export function Empty({ title, hint, icon = "documents-outline", action }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: t.accentSoft }]}>
        <Ionicons name={icon} size={30} color={t.accent} />
      </View>
      <Text style={[type.headline, { color: t.text, fontSize: 18 }]}>{title}</Text>
      {hint ? <Text style={[type.callout, { color: t.textMuted, textAlign: "center" }]}>{hint}</Text> : null}
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" style={[styles.retry, { backgroundColor: t.accent }]}>
          <Text style={styles.retryText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenTitle: { paddingHorizontal: space.xl, paddingBottom: space.md },
  screenTitleRow: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  resultsBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xl, paddingTop: 2, paddingBottom: space.md },
  sortButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sortSheet: { position: "absolute", left: space.lg, right: space.lg, bottom: 34, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingVertical: space.md },
  sortRowItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: 14 },
  retry: { marginTop: 16, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  card: { borderRadius: radius.lg, marginHorizontal: space.lg, marginBottom: space.md, padding: space.lg, gap: space.sm },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4, flexShrink: 1 },
  pillText: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.3, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  mini: { width: 244, height: 184, borderRadius: radius.lg, padding: space.lg, gap: space.sm, marginRight: space.md, marginBottom: 4 },
  carousel: { paddingLeft: space.lg, paddingRight: 4, paddingBottom: 22 },
  filters: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  filter: { borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.xl, marginTop: space.xl, marginBottom: space.md },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  empty: { alignItems: "center", padding: 40, gap: 10, marginTop: 30 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
