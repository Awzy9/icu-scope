import { useColorScheme } from "react-native";

// Palette mirrors the website's CSS variables (style.css).
const light = {
  bg: "#f5f6f7",
  surface: "#ffffff",
  surfaceSoft: "#eef0f2",
  border: "#e1e4e8",
  text: "#14181c",
  textSecondary: "#454c53",
  textMuted: "#5f666d",
  accent: "#0f8a72",
  accentStrong: "#0a6b58",
  accentSoft: "#e6f5f1",
  blue: "#2563eb",
  blueSoft: "#eaf1fe",
  green: "#15803d",
  greenSoft: "#eaf7ee",
  purple: "#7c3aed",
  purpleSoft: "#f1eafe",
  amber: "#b45309",
  amberSoft: "#fef3e2",
};

const dark = {
  bg: "#14171a",
  surface: "#1c2024",
  surfaceSoft: "#23282d",
  border: "#2e3439",
  text: "#eef0f2",
  textSecondary: "#b7bec5",
  textMuted: "#838b93",
  accent: "#35b696",
  accentStrong: "#5fcfb2",
  accentSoft: "#16302a",
  blue: "#6796ff",
  blueSoft: "#16233d",
  green: "#4ade80",
  greenSoft: "#142e1f",
  purple: "#b18bfa",
  purpleSoft: "#251c3d",
  amber: "#fbbf24",
  amberSoft: "#33270f",
};

export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}
