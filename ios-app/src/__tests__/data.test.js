import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_SETTINGS,
  allArticles,
  articleKey,
  buildSections,
  clearUserData,
  loadCollections,
  loadFeed,
  loadSettings,
  persistCollections,
  persistSettings,
  searchArticles,
  trialResults,
} from "../data";

const art = (pmid, extra = {}) => ({ pmid, title: `Title ${pmid}`, ...extra });

const feed = {
  categories: [
    { id: "renal", label: "Renal", articles: [art("1", { study_type: "Randomized Controlled Trial" }), art("2")] },
    { id: "neuro", label: "Neurology", articles: [art("3", { study_type: "Clinical Trial" }), art("2")] },
  ],
  guidelines: { articles: [art("4", { society: "SCCM" })] },
  trending: { articles: [art("5"), art("1")] },
  trials: { articles: [{ url: "https://clinicaltrials.gov/study/NCT1", title: "Registered trial" }] },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe("articleKey", () => {
  it("prefers the PMID and falls back to the URL", () => {
    expect(articleKey({ pmid: "9", url: "u" })).toBe("9");
    expect(articleKey({ url: "u" })).toBe("u");
  });
});

describe("allArticles", () => {
  it("de-duplicates across categories and sections", () => {
    expect(allArticles(feed).map(articleKey)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("skips hidden organ systems", () => {
    expect(allArticles(feed, ["renal"]).map(articleKey)).toEqual(["3", "2", "4", "5", "1"]);
  });
});

describe("trialResults", () => {
  it("returns RCTs and clinical trials, not registrations", () => {
    expect(trialResults(feed).map(articleKey)).toEqual(["1", "3"]);
  });
});

describe("buildSections", () => {
  it("lists only sources that have articles", () => {
    expect(buildSections(feed).map((s) => s.id)).toEqual(["trial_results", "trials", "guidelines"]);
  });
});

describe("searchArticles", () => {
  const pool = [
    art("1", { title: "Vasopressin in septic shock", journal: "Chest" }),
    art("2", { title: "Fluids", abstract: "septic patients receiving fluids" }),
    art("3", { title: "Ventilation", ai_summary: "lung protective ventilation" }),
  ];

  it("returns nothing for an empty query", () => {
    expect(searchArticles(pool, "   ")).toEqual([]);
  });

  it("ranks title matches above body matches", () => {
    expect(searchArticles(pool, "septic").map(articleKey)).toEqual(["1", "2"]);
  });

  it("requires every term to match", () => {
    expect(searchArticles(pool, "septic fluids").map(articleKey)).toEqual(["2"]);
  });

  it("searches AI summaries", () => {
    expect(searchArticles(pool, "protective").map(articleKey)).toEqual(["3"]);
  });
});

describe("loadFeed", () => {
  it("downloads and caches the feed", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ hello: 1 }) });
    await expect(loadFeed()).resolves.toEqual({ feed: { hello: 1 }, offline: false });
    expect(JSON.parse(await AsyncStorage.getItem("feed:v1"))).toEqual({ hello: 1 });
  });

  it("falls back to the cached copy when offline", async () => {
    await AsyncStorage.setItem("feed:v1", JSON.stringify({ cached: true }));
    global.fetch = jest.fn().mockRejectedValue(new Error("Network request failed"));
    await expect(loadFeed()).resolves.toEqual({ feed: { cached: true }, offline: true });
  });

  it("throws when offline with no cache", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network request failed"));
    await expect(loadFeed()).rejects.toThrow("Network request failed");
  });

  it("reports a timeout as a readable error", async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
    await expect(loadFeed()).rejects.toThrow("Request timed out");
  });

  it("treats a bad status as a failure", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(loadFeed()).rejects.toThrow("HTTP 503");
  });
});

describe("settings and collections storage", () => {
  it("returns defaults when nothing is stored", async () => {
    await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("merges stored settings over the defaults", async () => {
    persistSettings({ appearance: "dark" });
    await new Promise((r) => setImmediate(r));
    await expect(loadSettings()).resolves.toEqual({ ...DEFAULT_SETTINGS, appearance: "dark" });
  });

  it("round-trips collections", async () => {
    const list = [{ id: "c1", name: "Sepsis", keys: ["1"] }];
    persistCollections(list);
    await new Promise((r) => setImmediate(r));
    await expect(loadCollections()).resolves.toEqual(list);
  });

  it("clearUserData wipes feed, saved, read state and collections but keeps settings", async () => {
    await AsyncStorage.multiSet([
      ["feed:v1", "{}"],
      ["saved:v1", "[]"],
      ["seen:v1", "[]"],
      ["collections:v1", "[]"],
      ["settings:v1", JSON.stringify({ appearance: "dark" })],
    ]);
    await clearUserData();
    expect(await AsyncStorage.getAllKeys()).toEqual(["settings:v1"]);
  });
});
