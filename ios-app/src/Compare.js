import { ScrollView, StyleSheet, Text, View } from "react-native";
import { compareRows } from "./studyTools";
import { useTheme } from "./theme";

// Two studies side by side: design, journal, impact, and (when available) PICO and takeaway.
export default function Compare({ route }) {
  const t = useTheme();
  const { a, b } = route.params;
  const rows = compareRows(a, b);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <View style={styles.cols}>
        {[a, b].map((x, i) => (
          <View key={i} style={[styles.head, { backgroundColor: t.accentSoft }]}>
            <Text style={{ color: t.accent, fontWeight: "800", fontSize: 13.5, lineHeight: 18 }} numberOfLines={5}>
              {x.title}
            </Text>
          </View>
        ))}
      </View>
      {rows.map(([label, x, y]) => (
        <View key={label} style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
          <View style={styles.cols}>
            <Text style={[styles.cell, { color: t.text }]}>{x}</Text>
            <Text style={[styles.cell, { color: t.text }]}>{y}</Text>
          </View>
        </View>
      ))}
      <Text style={{ color: t.textMuted, fontSize: 12, textAlign: "center" }}>
        Impact ratings are estimates from study design, journal and citations. Appraisal fields are AI-generated where shown.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cols: { flexDirection: "row", gap: 10 },
  head: { flex: 1, borderRadius: 14, padding: 12 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  cell: { flex: 1, fontSize: 14.5, lineHeight: 20 },
});
