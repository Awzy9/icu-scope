import { Component } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Deliberately independent of the store and theme so it still renders if those are what failed.
export function ErrorScreen({ onRetry }) {
  const dark = useColorScheme() === "dark";
  const text = dark ? "#eaf0f8" : "#0f1b2d";
  const muted = dark ? "#8393a8" : "#67768a";
  return (
    <View style={[styles.wrap, { backgroundColor: dark ? "#0b1119" : "#f3f6fa" }]}>
      <Ionicons name="alert-circle-outline" size={44} color={dark ? "#fb8a5c" : "#c2410c"} />
      <Text style={[styles.title, { color: text }]}>Something went wrong</Text>
      <Text style={[styles.hint, { color: muted }]}>
        ICU Scope hit an unexpected problem. Your saved articles are safe. Try again, or restart the app if it keeps happening.
      </Text>
      <Pressable onPress={onRetry} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ICU Scope render error:", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? <ErrorScreen onRetry={this.reset} /> : this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: "800" },
  hint: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  button: { marginTop: 8, backgroundColor: "#1769d1", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
