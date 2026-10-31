import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Speech from "expo-speech";
import { useNavigation } from "@react-navigation/native";
import { tap } from "./components";
import { articleKey } from "./data";
import { pmcidOf } from "./readerText";
import { CITATION_STYLES, citation, journalClubHandout } from "./studyTools";
import { useStore } from "./store";
import { useTheme } from "./theme";

function ToolRow({ icon, label, detail, onPress, last }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      accessibilityRole="button"
      style={[styles.row, !last && { borderBottomColor: t.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
    >
      <Ionicons name={icon} size={20} color={t.accent} />
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      {detail ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{detail}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
    </Pressable>
  );
}

function Sheet({ visible, title, onClose, children }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: t.text }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: t.accent, fontWeight: "700", fontSize: 16 }}>Done</Text>
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

function CiteSheet({ article, visible, onClose }) {
  const t = useTheme();
  const [style, setStyle] = useState("vancouver");
  const [copied, setCopied] = useState(false);
  const text = citation(article, style);
  return (
    <Sheet visible={visible} title="Cite this article" onClose={onClose}>
      <View style={[styles.segmented, { backgroundColor: t.surfaceSoft }]}>
        {CITATION_STYLES.map((s) => (
          <Pressable
            key={s.value}
            onPress={() => {
              setStyle(s.value);
              setCopied(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: s.value === style }}
            style={[styles.segment, s.value === style && { backgroundColor: t.surface }]}
          >
            <Text style={{ color: s.value === style ? t.accent : t.textSecondary, fontWeight: "700", fontSize: 13 }}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={{ maxHeight: 180, marginTop: 12 }}>
        <Text selectable style={{ color: t.text, fontSize: 14.5, lineHeight: 21 }}>
          {text}
        </Text>
      </ScrollView>
      <View style={styles.sheetButtons}>
        <Pressable
          onPress={async () => {
            await Clipboard.setStringAsync(text);
            setCopied(true);
          }}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: t.accent }]}
        >
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color="#fff" />
          <Text style={styles.primaryText}>{copied ? "Copied" : "Copy"}</Text>
        </Pressable>
        <Pressable
          onPress={() => Share.share({ message: text })}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: t.surfaceSoft }]}
        >
          <Ionicons name="share-outline" size={18} color={t.text} />
          <Text style={[styles.primaryText, { color: t.text }]}>Share</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function CompareSheet({ article, visible, onClose, onPick }) {
  const t = useTheme();
  const { saved } = useStore();
  const others = saved.filter((a) => articleKey(a) !== articleKey(article));
  return (
    <Sheet visible={visible} title="Compare with a saved study" onClose={onClose}>
      {others.length === 0 ? (
        <Text style={{ color: t.textMuted, paddingVertical: 12 }}>Save another article first, then you can compare the two.</Text>
      ) : (
        <ScrollView style={{ maxHeight: 320 }}>
          {others.map((a) => (
            <Pressable
              key={articleKey(a)}
              onPress={() => onPick(a)}
              accessibilityRole="button"
              style={[styles.pick, { borderBottomColor: t.border }]}
            >
              <Text style={{ color: t.text, fontSize: 15.5, fontWeight: "600" }} numberOfLines={3}>
                {a.title}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 12.5 }}>{[a.study_type, a.journal].filter(Boolean).join(" · ")}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

// Everything you can do with one article beyond reading it.
export default function ArticleTools({ article }) {
  const t = useTheme();
  const navigation = useNavigation();
  const { feed, deck, addCards, removeCard } = useStore();
  const [cite, setCite] = useState(false);
  const [compare, setCompare] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const key = articleKey(article);
  const gist = article.ai_rounds_takeaway || article.ai_summary || article.summary;
  const inDeck = Boolean(deck[key]);
  const prompts = feed?.spotlight?.pmid && feed.spotlight.pmid === article.pmid ? feed.spotlight.discussion_prompts || [] : [];

  useEffect(() => () => Speech.stop(), []);

  const toggleSpeech = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(`${article.title}. ${gist || ""}`, {
      language: "en-US",
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      {pmcidOf(article) && article.is_open_access !== false ? (
        <ToolRow
          icon="book-outline"
          label="Read full text"
          detail="Open access"
          onPress={() => navigation.navigate("FullText", { article })}
        />
      ) : null}
      <ToolRow icon="document-text-outline" label="Cite" detail="Vancouver, APA, RIS, BibTeX" onPress={() => setCite(true)} />
      {gist ? (
        <ToolRow icon={speaking ? "stop-circle-outline" : "volume-high-outline"} label={speaking ? "Stop reading" : "Listen to summary"} onPress={toggleSpeech} />
      ) : null}
      {gist ? (
        <ToolRow
          icon={inDeck ? "checkmark-circle-outline" : "albums-outline"}
          label={inDeck ? "In your flashcards (tap to remove)" : "Add to flashcards"}
          onPress={() => (inDeck ? removeCard(key) : addCards([article]))}
        />
      ) : null}
      <ToolRow icon="git-compare-outline" label="Compare with a saved study" onPress={() => setCompare(true)} />
      <ToolRow
        icon="people-outline"
        label="Journal club handout"
        detail={prompts.length ? `${prompts.length} questions` : undefined}
        last
        onPress={() => Share.share({ message: journalClubHandout(article, prompts) })}
      />
      <CiteSheet article={article} visible={cite} onClose={() => setCite(false)} />
      <CompareSheet
        article={article}
        visible={compare}
        onClose={() => setCompare(false)}
        onPick={(other) => {
          setCompare(false);
          navigation.navigate("Compare", { a: article, b: other });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  label: { flex: 1, fontSize: 16 },
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, padding: 18, paddingBottom: 30 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "800" },
  segmented: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 10 },
  sheetButtons: { flexDirection: "row", gap: 10, marginTop: 16 },
  primary: { flex: 1, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15.5 },
  pick: { paddingVertical: 12, gap: 3, borderBottomWidth: StyleSheet.hairlineWidth },
});
