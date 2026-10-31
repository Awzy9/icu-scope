import { useColorScheme } from "react-native";
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
  bg: "#0b1119",
  surface: "#141d29",
  surfaceSoft: "#1c2736",
  border: "#243245",
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
