import { useEffect, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { articleKey } from "./data";
import { SORTS } from "./studyTools";
import { useStore } from "./store";
import { TYPE, TYPE_DEFAULT, useTheme } from "./theme";

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

// Fades and slides content in on mount; `index` staggers list items a little.
function FadeIn({ index = 0, children, style }) {
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

function useCardInfo(article) {
  const t = useTheme();
  const { seen, savedKeys } = useStore();
  const [tone, icon] = TYPE[article.study_type] || TYPE_DEFAULT;
  const k = articleKey(article);
  return { t, tone, icon, color: t[tone], isNew: !seen.has(k), read: seen.has(k), saved: savedKeys.has(k) };
}

export function ArticleCard({ article, onPress, index = 0 }) {
  const { t, icon, color, isNew, read, saved } = useCardInfo(article);
  const source = article.journal || article.source;
  const blurb = article.ai_rounds_takeaway || article.ai_summary || article.summary;
  return (
    <FadeIn index={index}>
      <Pressable
        onPress={() => {
          tap();
          onPress(article);
        }}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: t.surface, borderColor: t.border, transform: [{ scale: pressed ? 0.985 : 1 }] },
        ]}
      >
        <View style={[styles.bar, { backgroundColor: color }]} />
        <View style={styles.cardBody}>
          <View style={styles.topRow}>
            <Ionicons name={icon} size={13} color={color} />
            <Text style={[styles.kind, { color }]} numberOfLines={1}>
              {FILTER_LABEL[article.study_type] || article.study_type || "Article"}
            </Text>
            {article.is_top_journal ? (
              <View style={[styles.top, { backgroundColor: t.amberSoft }]}>
                <Ionicons name="ribbon" size={11} color={t.amber} />
                <Text style={[styles.topText, { color: t.amber }]}>Top journal</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {saved ? <Ionicons name="bookmark" size={16} color={t.accent} /> : null}
            {isNew && !saved ? <View style={[styles.dot, { backgroundColor: t.teal }]} /> : null}
          </View>
          <Text style={[styles.title, { color: read ? t.textSecondary : t.text, fontWeight: read ? "600" : "700" }]} numberOfLines={4}>
            {article.title}
          </Text>
          {blurb ? (
            <Text style={[styles.body, { color: t.textSecondary }]} numberOfLines={2}>
              {blurb}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: t.textMuted }]} numberOfLines={1}>
            {[source, article.pubdate].filter(Boolean).join("  ·  ")}
          </Text>
        </View>
      </Pressable>
    </FadeIn>
  );
}

// Compact card for horizontal carousels.
export function MiniCard({ article, onPress, index = 0 }) {
  const { t, icon, color, isNew } = useCardInfo(article);
  return (
    <FadeIn index={index}>
      <Pressable
        onPress={() => {
          tap();
          onPress(article);
        }}
        style={({ pressed }) => [
          styles.mini,
          { backgroundColor: t.surface, borderColor: t.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <View style={styles.topRow}>
          <Ionicons name={icon} size={13} color={color} />
          <Text style={[styles.kind, { color }]} numberOfLines={1}>
            {article.society || FILTER_LABEL[article.study_type] || article.study_type || "Article"}
          </Text>
          <View style={{ flex: 1 }} />
          {isNew ? <View style={[styles.dot, { backgroundColor: t.teal }]} /> : null}
        </View>
        <Text style={[styles.miniTitle, { color: t.text }]} numberOfLines={4}>
          {article.title}
        </Text>
        <Text style={[styles.meta, { color: t.textMuted, marginTop: "auto" }]} numberOfLines={1}>
          {[article.journal || article.source, article.pubdate].filter(Boolean).join(" · ")}
        </Text>
      </Pressable>
    </FadeIn>
  );
}

export function Carousel({ data, onPress }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} snapToInterval={252} decelerationRate="fast">
      {data.map((a, i) => (
        <MiniCard key={articleKey(a) + i} article={a} onPress={onPress} index={i} />
      ))}
    </ScrollView>
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

// Sort order for a list of articles: default, newest, most cited, highest impact.
export function SortBar({ value, onChange }) {
  const t = useTheme();
  return (
    <View style={[styles.sortRow, { backgroundColor: t.bg }]}>
      <Ionicons name="swap-vertical" size={15} color={t.textMuted} />
      {SORTS.map((s) => {
        const on = s.value === value;
        return (
          <Pressable
            key={s.value}
            onPress={() => {
              tap();
              onChange(s.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.sortChip, on && { backgroundColor: t.accentSoft }]}
          >
            <Text style={{ color: on ? t.accent : t.textMuted, fontWeight: "700", fontSize: 12.5 }}>{s.label}</Text>
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

export function SectionTitle({ children, action, onAction }) {
  const t = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: t.text }]}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} style={styles.action}>
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
  const t = useTheme();
  return (
    <View style={{ paddingTop: 8 }}>
      {hero ? <Bone style={{ height: 190, marginHorizontal: 16, marginBottom: 22, borderRadius: 24 }} /> : null}
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, padding: 16, gap: 10, flexDirection: "column" }]}>
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
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      {hint ? <Text style={[styles.body, { color: t.textMuted, textAlign: "center" }]}>{hint}</Text> : null}
      {action ? (
        <Pressable onPress={action.onPress} style={[styles.retry, { backgroundColor: t.accent }]}>
          <Text style={styles.retryText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingBottom: 6, flexWrap: "wrap" },
  sortChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  retry: { marginTop: 16, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  card: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    marginHorizontal: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#0b1b33",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bar: { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 7 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kind: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 4 },
  topText: { fontSize: 10.5, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "700" },
  title: { fontSize: 16.5, fontWeight: "700", lineHeight: 22, letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 12.5, marginTop: 1 },
  mini: { width: 240, height: 176, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8, marginRight: 12 },
  miniTitle: { fontSize: 15.5, fontWeight: "700", lineHeight: 20, letterSpacing: -0.2 },
  carousel: { paddingLeft: 16, paddingRight: 4, paddingBottom: 6 },
  filters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filter: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 8 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginTop: 14, marginBottom: 12 },
  section: { fontSize: 21, fontWeight: "800", letterSpacing: -0.4 },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  empty: { alignItems: "center", padding: 40, gap: 10, marginTop: 30 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
});
