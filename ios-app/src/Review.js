import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Empty, tap } from "./components";
import { articleKey } from "./data";
import { dueKeys } from "./studyTools";
import { useStore } from "./store";
import { useTheme } from "./theme";

const GRADES = [
  { grade: "again", label: "Again", tone: "rose" },
  { grade: "good", label: "Good", tone: "accent" },
  { grade: "easy", label: "Easy", tone: "green" },
];

// Spaced-repetition review of article takeaways. Cards come from saved articles.
export default function Review() {
  const t = useTheme();
  const { deck, saved, addCards, gradeCard } = useStore();
  const [shown, setShown] = useState(false);
  const due = dueKeys(deck);
  const key = due[0];
  const card = key ? deck[key] : null;
  const addable = saved.filter((a) => (a.ai_rounds_takeaway || a.ai_summary || a.summary) && !deck[articleKey(a)]);

  if (!card) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Empty
          icon={Object.keys(deck).length ? "checkmark-done-outline" : "albums-outline"}
          title={Object.keys(deck).length ? "All caught up" : "No flashcards yet"}
          hint={
            Object.keys(deck).length
              ? "Nothing is due right now. Cards come back at longer and longer intervals as you remember them."
              : "Flashcards turn an article's takeaway into a quick recall question. Add them from an article's tools, or build a deck from your saved articles."
          }
        />
        {addable.length ? (
          <Pressable
            onPress={() => addCards(addable)}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: t.accent, alignSelf: "center" }]}
          >
            <Text style={styles.buttonText}>Add {addable.length} saved {addable.length === 1 ? "article" : "articles"} to the deck</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    );
  }

  const a = card.article;
  const answer = a.ai_rounds_takeaway || a.ai_summary || a.summary;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={{ color: t.textMuted, fontWeight: "700" }}>{due.length} due · {Object.keys(deck).length} in deck</Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={{ color: t.accent, fontSize: 12, fontWeight: "800", letterSpacing: 0.7 }}>WHAT IS THE TAKEAWAY?</Text>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: "800", lineHeight: 27 }}>{a.title}</Text>
        {shown ? (
          <View style={[styles.answer, { backgroundColor: t.accentSoft }]}>
            <Text style={{ color: t.text, fontSize: 17, lineHeight: 25 }}>{answer}</Text>
            <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 6 }}>AI-generated. Check the source before relying on it.</Text>
          </View>
        ) : null}
      </View>
      {!shown ? (
        <Pressable onPress={() => setShown(true)} accessibilityRole="button" style={[styles.button, { backgroundColor: t.accent }]}>
          <Text style={styles.buttonText}>Show answer</Text>
        </Pressable>
      ) : (
        <View style={styles.grades}>
          {GRADES.map((g) => (
            <Pressable
              key={g.grade}
              onPress={() => {
                tap();
                gradeCard(key, g.grade);
                setShown(false);
              }}
              accessibilityRole="button"
              style={[styles.grade, { backgroundColor: t[`${g.tone}Soft`] }]}
            >
              <Text style={{ color: t[g.tone], fontWeight: "800", fontSize: 16 }}>{g.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.hintRow}>
        <Ionicons name="information-circle-outline" size={16} color={t.textMuted} />
        <Text style={{ color: t.textMuted, fontSize: 13, flex: 1 }}>
          Again brings the card back in 10 minutes. Good and Easy space it out over days.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14 },
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 14 },
  answer: { borderRadius: 14, padding: 14 },
  button: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 22, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  grades: { flexDirection: "row", gap: 10 },
  grade: { flex: 1, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  hintRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});
