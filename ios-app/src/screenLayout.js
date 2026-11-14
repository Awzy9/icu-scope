import { View, useWindowDimensions } from "react-native";

export const WIDE = 700;
const COLUMN_MAX = 760;

export const useWide = () => useWindowDimensions().width >= WIDE;

// Number of tile columns that suits the window: 2 on phones, 3 on iPad.
export const useColumns = () => (useWindowDimensions().width >= WIDE ? 3 : 2);

// Keeps reading content a comfortable width and centred on iPad; a no-op on phones.
export function ContentColumn({ children, style }) {
  const wide = useWide();
  if (!wide) return <View style={style}>{children}</View>;
  return <View style={[{ width: "100%", maxWidth: COLUMN_MAX, alignSelf: "center" }, style]}>{children}</View>;
}
