import {
  briefingText,
  citation,
  compareRows,
  countBy,
  dueKeys,
  journalClubHandout,
  logEntry,
  monthlyCounts,
  newCard,
  parsePubdate,
  readingLogCsv,
  readingStreak,
  readsThisWeek,
  reviewCard,
  sortArticles,
  watchlistMatches,
  weekStart,
} from "../studyTools";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 28, 12); // Wed 28 Oct 2026

const article = {
  pmid: "1",
  title: "Conservative oxygen after cardiac arrest.",
  authors: ["Smith J", "Lee K"],
  journal: "N Engl J Med",
  pubdate: "2026 Aug 6",
  volume: "395",
  issue: "6",
  pages: "512-520",
  doi: "10.1056/x",
  url: "https://pubmed.ncbi.nlm.nih.gov/1/",
};

describe("parsePubdate", () => {
  it("handles PubMed, month-only, year-only and ISO dates", () => {
    expect(parsePubdate("2026 Oct 23")).toBe(Date.UTC(2026, 9, 23));
    expect(parsePubdate("2026 Oct")).toBe(Date.UTC(2026, 9, 1));
    expect(parsePubdate("2000")).toBe(Date.UTC(2000, 0, 1));
    expect(parsePubdate("2026-10-23")).toBe(Date.UTC(2026, 9, 23));
  });
  it("returns 0 for missing or unreadable values", () => {
    expect(parsePubdate("")).toBe(0);
    expect(parsePubdate(undefined)).toBe(0);
    expect(parsePubdate("soon")).toBe(0);
  });
});

describe("sortArticles", () => {
  const list = [
    { pmid: "a", pubdate: "2026 Jan", citation_count: 50, study_type: "Review" },
    { pmid: "b", pubdate: "2026 Oct", citation_count: 5, study_type: "Randomized Controlled Trial", is_top_journal: true },
    { pmid: "c", pubdate: "2026 Mar", citation_count: 20, study_type: "Observational Study" },
  ];
  const ids = (m) => sortArticles(list, m).map((x) => x.pmid);
  it("sorts by date, citations and impact without mutating the input", () => {
    expect(ids("newest")).toEqual(["b", "c", "a"]);
    expect(ids("cited")).toEqual(["a", "c", "b"]);
    expect(ids("impact")).toEqual(["b", "c", "a"]);
    expect(list.map((x) => x.pmid)).toEqual(["a", "b", "c"]);
  });
  it("leaves the order alone by default", () => {
    expect(sortArticles(list, "default")).toBe(list);
  });
});

describe("reading log", () => {
  const log = {
    1: logEntry(article, NOW),
    2: logEntry({ pmid: "2", title: 'He said "go"', journal: "Chest", pubdate: "2026 Sep" }, NOW - 8 * DAY),
  };
  it("exports escaped CSV, newest first", () => {
    const lines = readingLogCsv(log).split("\n");
    expect(lines[0]).toBe("date_read,title,journal,published,study_type,url");
    expect(lines[1]).toContain("2026-10-28");
    expect(lines[2]).toContain('"He said ""go"""');
  });
  it("counts this week's reads from Monday", () => {
    expect(new Date(weekStart(NOW)).getUTCDay()).toBe(1);
    expect(readsThisWeek(log, NOW)).toBe(1);
  });
  it("computes a day streak that survives until tonight", () => {
    const streakLog = {
      a: { at: NOW },
      b: { at: NOW - DAY },
      c: { at: NOW - 2 * DAY },
      d: { at: NOW - 5 * DAY },
    };
    expect(readingStreak(streakLog, NOW)).toBe(3);
    expect(readingStreak({ x: { at: NOW - DAY } }, NOW)).toBe(1);
    expect(readingStreak({ x: { at: NOW - 3 * DAY } }, NOW)).toBe(0);
    expect(readingStreak({}, NOW)).toBe(0);
  });
});

describe("citation", () => {
  it("formats Vancouver", () => {
    expect(citation(article, "vancouver")).toBe(
      "Smith J, Lee K. Conservative oxygen after cardiac arrest. N Engl J Med. 2026;395(6):512-520. doi:10.1056/x",
    );
  });
  it("truncates long author lists to six plus et al", () => {
    const many = { ...article, authors: ["A a", "B b", "C c", "D d", "E e", "F f", "G g"] };
    expect(citation(many, "vancouver")).toContain("A a, B b, C c, D d, E e, F f, et al.");
  });
  it("formats APA with initials and a DOI link", () => {
    expect(citation(article, "apa")).toBe(
      "Smith, J., Lee, K. (2026). Conservative oxygen after cardiac arrest. N Engl J Med, 395(6), 512-520. https://doi.org/10.1056/x",
    );
  });
  it("keeps group authors intact and splits multi-letter initials in APA", () => {
    const apa = citation({ ...article, authors: ["Steckiewicz KP", "ICRAKI Trial Group", "de Montmollin E"] }, "apa");
    expect(apa).toContain("Steckiewicz, K. P.");
    expect(apa).toContain("ICRAKI Trial Group");
    expect(apa).toContain("de Montmollin, E.");
  });
  it("formats RIS and BibTeX", () => {
    const ris = citation(article, "ris");
    expect(ris.startsWith("TY  - JOUR")).toBe(true);
    expect(ris).toContain("AU  - Smith J");
    expect(ris.endsWith("ER  - ")).toBe(true);
    const bib = citation(article, "bibtex");
    expect(bib).toContain("@article{smith2026,");
    expect(bib).toContain("author = {Smith J and Lee K}");
  });
  it("copes with missing fields", () => {
    expect(citation({ title: "Only a title" }, "vancouver")).toContain("Only a title");
  });
});

describe("watchlistMatches", () => {
  const pool = [
    { pmid: "1", title: "ECMO in cardiogenic shock", pubdate: "2026 Oct 20" },
    { pmid: "2", title: "Vasopressin dosing", pubdate: "2026 Oct 25" },
    { pmid: "3", title: "ECMO cannulation", pubdate: "2026 Oct 24" },
    { pmid: "4", title: "ECMO circuits (older)", pubdate: "2026 Jan 5" },
  ];
  it("returns matches and counts only recent unread ones as fresh", () => {
    const res = watchlistMatches(pool, [{ id: "w1", query: "ecmo" }], new Set(["1"]), NOW);
    expect(res[0].articles.map((a) => a.pmid)).toEqual(["1", "3", "4"]);
    expect(res[0].fresh).toBe(1); // 3 is recent and unread; 1 is read; 4 is old
  });
});

describe("flashcards", () => {
  it("grows the interval on good and easy answers", () => {
    let c = newCard(NOW);
    c = reviewCard(c, "good", NOW);
    expect(c.interval).toBe(1);
    c = reviewCard(c, "good", NOW);
    expect(c.interval).toBe(3);
    c = reviewCard(c, "easy", NOW);
    expect(c.interval).toBeGreaterThan(7);
    expect(c.ease).toBeGreaterThan(2.5);
  });
  it("resets on again, with a floor on ease", () => {
    let c = { ...newCard(NOW), reps: 4, interval: 20, ease: 1.35 };
    c = reviewCard(c, "again", NOW);
    expect(c.reps).toBe(0);
    expect(c.ease).toBe(1.3);
    expect(c.due).toBe(NOW + 10 * 60 * 1000);
  });
  it("lists due cards oldest first", () => {
    const deck = { a: { due: NOW + DAY }, b: { due: NOW - 2 * DAY }, c: { due: NOW - DAY } };
    expect(dueKeys(deck, NOW)).toEqual(["b", "c"]);
  });
});

describe("trends", () => {
  it("buckets articles into the last six months", () => {
    const counts = monthlyCounts(
      [{ pubdate: "2026 Oct 3" }, { pubdate: "2026 Oct 9" }, { pubdate: "2026 Aug" }, { pubdate: "2019" }],
      6,
      NOW,
    );
    expect(counts.map((c) => c.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(counts[5].count).toBe(2);
    expect(counts[3].count).toBe(1);
  });
  it("counts by a key, largest first, skipping blanks", () => {
    const res = countBy([{ t: "A" }, { t: "B" }, { t: "A" }, {}], (a) => a.t);
    expect(res).toEqual([
      { label: "A", count: 2 },
      { label: "B", count: 1 },
    ]);
  });
});

describe("briefing, journal club and compare", () => {
  it("builds a spoken briefing", () => {
    const text = briefingText({
      spotlight: { title: "Big trial" },
      this_week: { articles: [{ title: "Paper one", ai_rounds_takeaway: "Do the thing." }] },
    });
    expect(text).toContain("Article of the week: Big trial");
    expect(text).toContain("1 new articles this week");
    expect(text).toContain("Takeaway: Do the thing.");
    expect(text).toContain("not clinical advice");
  });
  it("handles an empty week", () => {
    expect(briefingText({})).toContain("No new articles this week.");
  });
  it("builds a journal club handout", () => {
    const text = journalClubHandout(article, ["Was blinding adequate?"], "Check the CI.");
    expect(text).toContain("Journal club: Conservative oxygen after cardiac arrest.");
    expect(text).toContain("1. Was blinding adequate?");
    expect(text).toContain("My notes:\nCheck the CI.");
  });
  it("compares two studies and drops rows with no data", () => {
    const rows = compareRows(
      { study_type: "Review", journal: "Chest", pubdate: "2026" },
      { study_type: "Randomized Controlled Trial", journal: "NEJM", ai_appraisal: { outcome: "Mortality" } },
    );
    const labels = rows.map((r) => r[0]);
    expect(labels).toContain("Outcome");
    expect(labels).not.toContain("Population");
    expect(rows.find((r) => r[0] === "Outcome")).toEqual(["Outcome", "-", "Mortality"]);
  });
});
