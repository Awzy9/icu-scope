import { StyleSheet, useColorScheme } from "react-native";
import { useStore } from "./store";

// Palette taken from the ICU Scope logo: deep blue magnifier, teal pulse line.
const light = {
  bg: "#f3f6fa",
  surface: "#ffffff",
  surfaceSoft: "#e9eef5",
  border: "#dde5ee",
  text: "#0f1b2d",
  textSecondary: "#44546a",
  textMuted: "#67768a",
  accent: "#1769d1",
  accentSoft: "#e3effd",
  teal: "#0c9a96",
  tealSoft: "#dff4f3",
  green: "#17803f",
  greenSoft: "#e3f5e9",
  purple: "#6d4bd8",
  purpleSoft: "#eee9fc",
  amber: "#b45309",
  amberSoft: "#fdf0dc",
  rose: "#c2410c",
  roseSoft: "#fde9e1",
  gradient: ["#0b3d91", "#1769d1", "#0c9a96"],
};

const dark = {
  bg: "#0a1018",
  surface: "#141e2c",
  surfaceSoft: "#1c2736",
  border: "#26364a",
  text: "#eaf0f8",
  textSecondary: "#b4c0d0",
  textMuted: "#8393a8",
  accent: "#5da2f5",
  accentSoft: "#14284a",
  teal: "#3fd0ca",
  tealSoft: "#0f2f33",
  green: "#4ade80",
  greenSoft: "#12301f",
  purple: "#b3a0f7",
  purpleSoft: "#251f45",
  amber: "#fbbf24",
  amberSoft: "#35290e",
  rose: "#fb8a5c",
  roseSoft: "#3a1f14",
  gradient: ["#0b3d91", "#1769d1", "#0c9a96"],
};

// Honours the in-app Appearance setting, falling back to the system scheme.
export function useIsDark() {
  const { settings } = useStore();
  const system = useColorScheme();
  return settings.appearance === "system" ? system === "dark" : settings.appearance === "dark";
}

export function useTheme() {
  return useIsDark() ? dark : light;
}

// Study-type styling: [label tone, icon]
export const TYPE = {
  "Meta-Analysis": ["green", "layers"],
  "Systematic Review": ["green", "layers"],
  "Randomized Controlled Trial": ["accent", "flask"],
  "Clinical Trial": ["accent", "flask"],
  "Practice Guideline": ["purple", "shield-checkmark"],
  Guideline: ["purple", "shield-checkmark"],
  Review: ["teal", "book"],
  "Observational Study": ["amber", "eye"],
  "Case Reports": ["rose", "document-text"],
  "FOAMed/Blog": ["teal", "mic"],
};
export const TYPE_DEFAULT = ["textMuted", "document-text"];

// ---- design tokens -------------------------------------------------------
// One scale for spacing, corner radius and type, so screens stay consistent.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const type = {
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5 },
  headline: { fontSize: 17, lineHeight: 23, fontWeight: "700", letterSpacing: -0.2 },
  section: { fontSize: 19, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24 },
  callout: { fontSize: 15, lineHeight: 21 },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 11.5, lineHeight: 14, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
};

// Cards get a soft shadow on light backgrounds and a hairline border on dark ones.
export function useCardStyle() {
  const dark = useIsDark();
  const t = useTheme();
  return dark
    ? { backgroundColor: t.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }
    : {
        backgroundColor: t.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.border,
        shadowColor: "#0b2a55",
        shadowOpacity: 0.07,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 5 },
        elevation: 2,
      };
}
