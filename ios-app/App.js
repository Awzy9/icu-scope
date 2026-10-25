import { useRef } from "react";
import { Linking, SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";

const SITE_URL = "https://icu-scope.vercel.app";

export default function App() {
  const webRef = useRef(null);

  // Keep navigation inside the app for the ICU Scope site; open everything
  // else (PubMed, journals, blogs) in the system browser.
  const onShouldStart = (req) => {
    if (req.url.startsWith(SITE_URL) || req.url === "about:blank") return true;
    Linking.openURL(req.url);
    return false;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <WebView
        ref={webRef}
        source={{ uri: SITE_URL }}
        style={styles.web}
        onShouldStartLoadWithRequest={onShouldStart}
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        sharedCookiesEnabled
        setSupportMultipleWindows={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  web: { flex: 1 },
});
