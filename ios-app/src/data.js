import AsyncStorage from "@react-native-async-storage/async-storage";

const FEED_URL = "https://icu-scope.vercel.app/data/articles.json";
const CACHE_KEY = "feed:v1";
const SAVED_KEY = "saved:v1";
const SEEN_KEY = "seen:v1";

// Network first so the feed is fresh, falling back to the last copy
// stored on the device so the app still opens offline.
export async function loadFeed() {
  try {
    const res = await fetch(FEED_URL, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    JSON.parse(text);
    AsyncStorage.setItem(CACHE_KEY, text).catch(() => {});
    return { feed: JSON.parse(text), offline: false };
  } catch (err) {
    const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null);
    if (cached) return { feed: JSON.parse(cached), offline: true };
    throw err;
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

export const articleKey = (a) => a.pmid || a.url;

// Home-screen browse sections beyond the organ-system categories.
export function buildSections(feed) {
  return [
    { id: "guidelines", label: "Guideline Watch", icon: "📋", articles: feed.guidelines?.articles || [] },
    { id: "ksa", label: "KSA Research", icon: "🇸🇦", articles: feed.ksa?.articles || [] },
    { id: "bottom_line", label: "The Bottom Line", icon: "🎯", articles: feed.bottom_line?.articles || [] },
    { id: "foamed", label: "FOAMed & Blogs", icon: "🎙️", articles: feed.foamed?.articles || [] },
    { id: "preprints", label: "Preprints", icon: "🧪", articles: feed.preprints?.articles || [] },
  ].filter((s) => s.articles.length);
}

export function allArticles(feed) {
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
  (feed.categories || []).forEach((c) => push(c.articles));
  ["guidelines", "ksa", "bottom_line", "foamed", "preprints"].forEach((k) => push(feed[k]?.articles || []));
  return out;
}

export function searchArticles(articles, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return articles
    .map((a) => {
      const title = (a.title || "").toLowerCase();
      const rest = `${a.journal || a.source || ""} ${a.abstract || a.summary || ""} ${(a.authors || []).join?.(" ") || a.author || ""}`.toLowerCase();
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
