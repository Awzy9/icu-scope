import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { articleKey } from "./data";
import { tap } from "./components";
import { useStore } from "./store";
import { useTheme } from "./theme";

// Bottom sheet for putting one saved article into any number of collections.
export default function CollectionsSheet({ visible, article, onClose }) {
  const t = useTheme();
  const { collections, createCollection, toggleInCollection } = useStore();
  const [name, setName] = useState("");
  const key = articleKey(article);

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    toggleInCollection(createCollection(trimmed), key);
    setName("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: t.text }]}>Add to collection</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Done">
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
            {collections.length === 0 ? (
              <Text style={{ color: t.textMuted, paddingVertical: 12 }}>
                No collections yet. Create one below, for example “Sepsis journal club”.
              </Text>
            ) : null}
            {collections.map((c) => {
              const on = c.keys.includes(key);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    tap();
                    toggleInCollection(c.id, key);
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.row, { borderBottomColor: t.border }]}
                >
                  <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? t.accent : t.textMuted} />
                  <Text style={{ color: t.text, fontSize: 16, flex: 1 }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>{c.keys.length}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.newRow}>
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={add}
              placeholder="New collection"
              placeholderTextColor={t.textMuted}
              maxLength={40}
              returnKeyType="done"
              style={[styles.input, { color: t.text, backgroundColor: t.surfaceSoft }]}
            />
            <Pressable
              onPress={add}
              disabled={!name.trim()}
              style={[styles.addBtn, { backgroundColor: name.trim() ? t.accent : t.surfaceSoft }]}
              accessibilityLabel="Create collection"
            >
              <Ionicons name="add" size={22} color={name.trim() ? "#fff" : t.textMuted} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 18, paddingBottom: 30 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 18, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  newRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  addBtn: { width: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
