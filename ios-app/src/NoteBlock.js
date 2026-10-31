import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { articleKey } from "./data";
import { useStore } from "./store";
import { useTheme } from "./theme";

// Private notes for one article, stored on the device. Saves as you type.
export default function NoteBlock({ article }) {
  const t = useTheme();
  const { notes, setNote } = useStore();
  const key = articleKey(article);
  const [draft, setDraft] = useState(notes[key]?.text ?? "");

  return (
    <View style={[styles.block, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.head}>
        <Ionicons name="create-outline" size={15} color={t.accent} />
        <Text style={[styles.title, { color: t.accent }]}>My notes</Text>
      </View>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setNote(article, text);
        }}
        placeholder="Add your thoughts, questions or how this applies to your unit"
        placeholderTextColor={t.textMuted}
        multiline
        textAlignVertical="top"
        accessibilityLabel="My notes"
        style={[styles.input, { color: t.text, backgroundColor: t.surfaceSoft }]}
      />
      <Text style={{ color: t.textMuted, fontSize: 12 }}>
        Stays on this device. Please do not enter patient information.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 16, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 },
  input: { minHeight: 96, borderRadius: 12, padding: 12, fontSize: 16, lineHeight: 22 },
});
