import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty } from "./components";
import { loadFullText } from "./readerText";
import { useStore } from "./store";
import { useTheme } from "./theme";

const licenceName = (url) => {
  const m = /licenses\/([a-z-]+)\/([\d.]+)/.exec(url || "");
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : "a Creative Commons licence";
};

// In-app reader for open-access papers (PubMed Central via Europe PMC). Text scales with Settings.
export default function FullText({ route }) {
  const { article } = route.params;
  const t = useTheme();
  const { settings } = useStore();
  const s = settings.textScale;
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    loadFullText(article)
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e) => alive && setState({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [article]);

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
        <Text style={{ color: t.textMuted, marginTop: 10 }}>Loading full text…</Text>
      </View>
    );
  }
  if (state.status === "error") {
    return <Empty icon="document-outline" title="Full text unavailable" hint={state.message} />;
  }

  const { blocks, license, omitted } = state.data;
  const hidden = omitted.tables + omitted.figures;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={{ color: t.text, fontSize: 22 * s, lineHeight: 29 * s, fontWeight: "800" }}>{article.title}</Text>
      <Text style={{ color: t.textMuted, fontSize: 13.5 }}>
        {[article.journal, article.pubdate].filter(Boolean).join("  ·  ")}
      </Text>
      {blocks.map((b, i) => {
        if (b.type === "h1") return <Text key={i} style={[styles.h1, { color: t.text, fontSize: 20 * s }]}>{b.text}</Text>;
        if (b.type === "h2") return <Text key={i} style={[styles.h2, { color: t.accent, fontSize: 16.5 * s }]}>{b.text}</Text>;
        if (b.type === "li") return <Text key={i} style={{ color: t.text, fontSize: 16 * s, lineHeight: 25 * s, paddingLeft: 12 }} selectable>{`•  ${b.text}`}</Text>;
        return <Text key={i} style={{ color: t.text, fontSize: 16 * s, lineHeight: 25 * s }} selectable>{b.text}</Text>;
      })}
      {hidden ? (
        <Text style={{ color: t.textMuted, fontSize: 13.5 }}>
          {`${omitted.tables} table${omitted.tables === 1 ? "" : "s"} and ${omitted.figures} figure${omitted.figures === 1 ? "" : "s"} are not shown here. Open the source to see them.`}
        </Text>
      ) : null}
      <View style={[styles.footer, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={{ color: t.textSecondary, fontSize: 13.5, lineHeight: 19 }}>
          {`Open-access full text from PubMed Central via Europe PMC, shared under ${licenceName(license)}. © the authors. Reproduced unchanged except that tables, figures and reference numbers are left out.`}
        </Text>
        <Pressable onPress={() => article.pmc_url && Linking.openURL(article.pmc_url)} accessibilityRole="link">
          <Text style={{ color: t.accent, fontWeight: "700" }}>Open the original on PubMed Central</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(license)} accessibilityRole="link">
          <Text style={{ color: t.accent, fontWeight: "700" }}>View licence</Text>
        </Pressable>
      </View>
      <Text style={{ color: t.textMuted, fontSize: 12, textAlign: "center" }}>Always read the source paper and follow local protocols.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  wrap: { padding: 18, gap: 12, paddingBottom: 48 },
  h1: { fontWeight: "800", marginTop: 14 },
  h2: { fontWeight: "700", marginTop: 6 },
  footer: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 8, marginTop: 8 },
});
