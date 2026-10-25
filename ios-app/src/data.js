import AsyncStorage from "@react-native-async-storage/async-storage";

const FEED_URL = "https://icu-scope.vercel.app/data/articles.json";
const FETCH_TIMEOUT_MS = 15000;
const CACHE_KEY = "feed:v1";
const SAVED_KEY = "saved:v1";
const SEEN_KEY = "seen:v1";

// Network first so the feed is fresh, falling back to the last copy
// stored on the device so the app still opens offline.
export async function loadFeed() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // No custom request headers: they force a CORS preflight the host doesn't answer on web.
    const res = await fetch(FEED_URL, { cache: "no-cache", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const feed = JSON.parse(text);
    AsyncStorage.setItem(CACHE_KEY, text).catch(() => {});
    return { feed, offline: false };
  } catch (err) {
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    if (cached) return { feed: JSON.parse(cached), offline: true };
    throw err.name === "AbortError" ? new Error("Request timed out") : err;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadSaved() {
  try {
    return JSON.parse((await AsyncStorage.getItem(SAVED_KEY)) || "[]");
  } catch {
    return [];
  }
}

export function persistSaved(list) {
  AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list)).catch(() => {});
}

export async function loadSeen() {
  try {
    return JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) || "[]");
  } catch {
    return [];
  }
}

export function persistSeen(keys) {
  // Keep the list bounded so storage doesn't grow forever.
  AsyncStorage.setItem(SEEN_KEY, JSON.stringify(keys.slice(-1500))).catch(() => {});
}

const SETTINGS_KEY = "settings:v1";

const COLLECTIONS_KEY = "collections:v1";

export const DEFAULT_SETTINGS = { appearance: "system", textScale: 1, hiddenCategories: [], hideRead: false };

// Collections hold article keys, not copies; the articles themselves live in the saved list.
export async function loadCollections() {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(COLLECTIONS_KEY)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function persistCollections(list) {
  AsyncStorage.setItem(COLLECTIONS_KEY, JSON.stringify(list)).catch(() => {});
}

export async function loadSettings() {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(SETTINGS_KEY)) || "{}");
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function persistSettings(settings) {
  AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
}

// Wipes the downloaded feed, saved articles and read markers. Settings are kept.
export function clearUserData() {
  return AsyncStorage.multiRemove([CACHE_KEY, SAVED_KEY, SEEN_KEY, COLLECTIONS_KEY]).catch(() => {});
}

export const articleKey = (a) => a.pmid || a.url;

const TRIAL_TYPES = new Set(["Randomized Controlled Trial", "Clinical Trial"]);

// Published trial results from every organ-system category (registrations live in feed.trials).
export function trialResults(feed) {
  return allArticles({ categories: feed.categories }).filter((a) => TRIAL_TYPES.has(a.study_type));
}

// Home-screen browse sections beyond the organ-system categories.
export function buildSections(feed) {
  return [
    { id: "trial_results", label: "Trial Results", articles: trialResults(feed) },
    { id: "trials", label: "Trial Tracker", articles: feed.trials?.articles || [] },
    { id: "guidelines", label: "Guideline Watch", icon: "📋", articles: feed.guidelines?.articles || [] },
    { id: "ksa", label: "KSA Research", icon: "🇸🇦", articles: feed.ksa?.articles || [] },
    { id: "bottom_line", label: "The Bottom Line", icon: "🎯", articles: feed.bottom_line?.articles || [] },
    { id: "foamed", label: "FOAMed & Blogs", icon: "🎙️", articles: feed.foamed?.articles || [] },
    { id: "preprints", label: "Preprints", icon: "🧪", articles: feed.preprints?.articles || [] },
  ].filter((s) => s.articles.length);
}

export function allArticles(feed, hiddenCategories = []) {
  const seen = new Set();
  const out = [];
  const push = (list) =>
    list.forEach((a) => {
      const k = articleKey(a);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(a);
      }
    });
  (feed.categories || []).filter((c) => !hiddenCategories.includes(c.id)).forEach((c) => push(c.articles));
  ["guidelines", "ksa", "bottom_line", "foamed", "preprints"].forEach((k) => push(feed[k]?.articles || []));
  push(feed.trending?.articles || []);
  return out;
}

export function searchArticles(articles, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return articles
    .map((a) => {
      const title = (a.title || "").toLowerCase();
      const rest = `${a.journal || a.source || ""} ${a.study_type || ""} ${a.abstract || a.summary || a.ai_summary || ""} ${a.ai_rounds_takeaway || ""} ${(a.authors || []).join?.(" ") || a.author || ""}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        else if (rest.includes(t)) score += 1;
        else return null;
      }
      return { a, score };
    })
    .filter(Boolean)
    .sort((x, y) => y.score - x.score)
    .slice(0, 100)
    .map((x) => x.a);
}
