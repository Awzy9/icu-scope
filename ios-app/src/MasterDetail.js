import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Empty } from "./components";
import DetailPane from "./DetailPane";
import { useTheme } from "./theme";

export const WIDE_BREAKPOINT = 700;

// iPhone: `children(open)` fills the screen and `open` pushes the article page.
// iPad (wide): list on the left, selected article on the right.
export default function MasterDetail({ navigation, children }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState(null);

  if (width < WIDE_BREAKPOINT) {
    return children((article) => navigation.navigate("Detail", { article }));
  }
  return (
    <View style={styles.row}>
      <View style={[styles.list, { borderRightColor: t.border }]}>{children(setSelected)}</View>
      <View style={styles.detail}>
        {selected ? (
          <DetailPane article={selected} />
        ) : (
          <Empty icon="document-text-outline" title="Select an article" hint="Pick one from the list to read it here." />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  list: { width: 380, borderRightWidth: StyleSheet.hairlineWidth },
  detail: { flex: 1 },
});
