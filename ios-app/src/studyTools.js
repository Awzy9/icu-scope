import { articleKey, searchArticles } from "./data";
import { impactScore } from "./evidence";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY = 24 * 60 * 60 * 1000;

// PubMed dates are "2026 Oct 23", "2026 Oct", "2026" or ISO. Returns a timestamp, 0 when unknown.
export function parsePubdate(value) {
  if (!value) return 0;
  const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(value);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +(iso[3] || 1));
  const m = /^(\d{4})(?:\s+([A-Za-z]{3})[a-z]*)?(?:\s+(\d{1,2}))?/.exec(String(value).trim());
  if (!m) return 0;
  const month = m[2] ? MONTHS.indexOf(m[2].toLowerCase()) : 0;
  return Date.UTC(+m[1], Math.max(month, 0), +(m[3] || 1));
}

export const SORTS = [
  { value: "default", label: "Default" },
  { value: "newest", label: "Newest" },
  { value: "cited", label: "Most cited" },
  { value: "impact", label: "Top impact" },
];

export function sortArticles(list, mode) {
  if (mode === "newest") return [...list].sort((a, b) => parsePubdate(b.pubdate) - parsePubdate(a.pubdate));
  if (mode === "cited") return [...list].sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));
  if (mode === "impact") {
    return [...list].sort(
      (a, b) => (impactScore(b) || 0) - (impactScore(a) || 0) || parsePubdate(b.pubdate) - parsePubdate(a.pubdate),
    );
  }
  return list;
}

// ---- reading log -------------------------------------------------------

export const logEntry = (article, at = Date.now()) => ({
  at,
  title: article.title,
  journal: article.journal || article.source || "",
  pubdate: article.pubdate || "",
  study_type: article.study_type || "",
  url: article.url || (article.doi ? `https://doi.org/${article.doi}` : ""),
});

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function readingLogCsv(log) {
  const rows = Object.values(log).sort((a, b) => b.at - a.at);
  const head = ["date_read", "title", "journal", "published", "study_type", "url"];
  const lines = rows.map((r) =>
    [new Date(r.at).toISOString().slice(0, 10), r.title, r.journal, r.pubdate, r.study_type, r.url].map(csvCell).join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

export function weekStart(now = Date.now()) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - day * DAY;
}

export const readsThisWeek = (log, now = Date.now()) =>
  Object.values(log).filter((r) => r.at >= weekStart(now)).length;

// Consecutive days with at least one read, ending today (or yesterday, so the streak survives until tonight).
export function readingStreak(log, now = Date.now()) {
  const days = new Set(Object.values(log).map((r) => Math.floor(r.at / DAY)));
  let day = Math.floor(now / DAY);
  if (!days.has(day)) day -= 1;
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day -= 1;
  }
  return streak;
}

// ---- citations ---------------------------------------------------------

const authorList = (a) => (Array.isArray(a.authors) ? a.authors : a.author ? [a.author] : []).filter((x) => x && x !== "et al.");
const year = (a) => (String(a.pubdate || "").match(/\d{4}/) || [""])[0];
const doiOf = (a) => a.doi || "";
const pagesOf = (a) => (a.pages ? `:${a.pages}` : "");
const volIssue = (a) => (a.volume ? `${a.volume}${a.issue ? `(${a.issue})` : ""}` : "");

// "Putowski Z" -> "Putowski, Z." Group authors ("ICRAKI Trial Group") have no initials and stay as written.
const apaName = (n) => {
  const parts = n.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length < 2 || !/^[A-Z]{1,4}$/.test(last)) return n.trim();
  const initials = parts.pop().split("").map((c) => `${c}.`).join(" ");
  return `${parts.join(" ")}, ${initials}`;
};

export function citation(a, style = "vancouver") {
  const names = authorList(a);
  const journal = a.journal || a.source || "";
  const title = String(a.title || "").replace(/\.$/, "");
  const doi = doiOf(a);
  if (style === "apa") {
    const shown = names.length > 20 ? [...names.slice(0, 19), names[names.length - 1]] : names;
    const who = shown.map(apaName).join(", ");
    const vol = a.volume ? `, ${volIssue(a)}${a.pages ? `, ${a.pages}` : ""}` : "";
    return `${who ? `${who} ` : ""}(${year(a) || "n.d."}). ${title}. ${journal}${vol}.${doi ? ` https://doi.org/${doi}` : ""}`.replace(/\s+/g, " ");
  }
  if (style === "ris") {
    return [
      "TY  - JOUR",
      ...names.map((n) => `AU  - ${n}`),
      `TI  - ${title}`,
      `JO  - ${journal}`,
      year(a) ? `PY  - ${year(a)}` : null,
      a.volume ? `VL  - ${a.volume}` : null,
      a.issue ? `IS  - ${a.issue}` : null,
      a.pages ? `SP  - ${a.pages}` : null,
      doi ? `DO  - ${doi}` : null,
      a.url ? `UR  - ${a.url}` : null,
      "ER  - ",
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (style === "bibtex") {
    const surname = (names[0] || "anon").split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
    const fields = [
      ["author", names.join(" and ")],
      ["title", title],
      ["journal", journal],
      ["year", year(a)],
      ["volume", a.volume],
      ["number", a.issue],
      ["pages", a.pages],
      ["doi", doi],
    ].filter(([, v]) => v);
    return `@article{${surname}${year(a)},\n${fields.map(([k, v]) => `  ${k} = {${v}}`).join(",\n")}\n}`;
  }
  // Vancouver (PubMed style): first six authors, then "et al."
  const who = names.length > 6 ? `${names.slice(0, 6).join(", ")}, et al` : names.join(", ");
  const ref = `${year(a)}${volIssue(a) ? `;${volIssue(a)}` : ""}${pagesOf(a)}`;
  return `${who ? `${who}. ` : ""}${title}. ${journal}. ${ref}.${doi ? ` doi:${doi}` : ""}`.replace(/\s+/g, " ");
}

export const CITATION_STYLES = [
  { value: "vancouver", label: "Vancouver" },
  { value: "apa", label: "APA" },
  { value: "ris", label: "RIS" },
  { value: "bibtex", label: "BibTeX" },
];

// ---- watchlist ---------------------------------------------------------

// "fresh" = published in the last two weeks and not opened yet, so the count stays meaningful.
export function watchlistMatches(pool, entries, seen, now = Date.now()) {
  const since = now - 14 * DAY;
  return entries.map((entry) => {
    const articles = searchArticles(pool, entry.query);
    const fresh = articles.filter((a) => !seen.has(articleKey(a)) && parsePubdate(a.pubdate) >= since).length;
    return { entry, articles, fresh };
  });
}

// ---- flashcards (simple spaced repetition) -----------------------------

export const newCard = (now = Date.now()) => ({ due: now, interval: 0, ease: 2.5, reps: 0 });

export function reviewCard(card, grade, now = Date.now()) {
  if (grade === "again") {
    return { ...card, reps: 0, interval: 0, ease: Math.max(1.3, card.ease - 0.2), due: now + 10 * 60 * 1000 };
  }
  const reps = card.reps + 1;
  const boost = grade === "easy" ? 1.3 : 1;
  const ease = grade === "easy" ? card.ease + 0.15 : card.ease;
  const base = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(card.interval * ease);
  const interval = Math.max(1, Math.round(base * boost));
  return { ...card, reps, ease, interval, due: now + interval * DAY };
}

export const dueKeys = (deck, now = Date.now()) =>
  Object.entries(deck)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([k]) => k);

// ---- trends ------------------------------------------------------------

export function monthlyCounts(articles, months = 6, now = Date.now()) {
  const today = new Date(now);
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1);
    const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i + 1, 1);
    const label = MONTHS[new Date(start).getUTCMonth()].replace(/^./, (c) => c.toUpperCase());
    buckets.push({ start, end, label, count: 0 });
  }
  articles.forEach((a) => {
    const t = parsePubdate(a.pubdate);
    const bucket = buckets.find((b) => t >= b.start && t < b.end);
    if (bucket) bucket.count += 1;
  });
  return buckets.map(({ label, count }) => ({ label, count }));
}

export function countBy(articles, pick) {
  const counts = {};
  articles.forEach((a) => {
    const k = pick(a);
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- briefing, journal club, compare ----------------------------------

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}.` : s);

export function briefingText(feed) {
  const week = feed?.this_week?.articles || [];
  const spot = feed?.spotlight;
  const parts = ["ICU Scope briefing."];
  if (spot?.title) parts.push(`Article of the week: ${spot.title}`);
  parts.push(week.length ? `${week.length} new articles this week.` : "No new articles this week.");
  week.slice(0, 5).forEach((a, i) => {
    const gist = a.ai_rounds_takeaway || a.ai_summary || "";
    parts.push(`${i + 1}. ${a.title}${gist ? ` Takeaway: ${clip(gist, 240)}` : ""}`);
  });
  parts.push("AI summaries are a reading aid, not clinical advice.");
  return parts.join(" ");
}

export function journalClubHandout(article, prompts = [], note = "") {
  const lines = [`Journal club: ${article.title}`, citation(article, "vancouver"), ""];
  if (article.ai_rounds_takeaway) lines.push(`Takeaway: ${article.ai_rounds_takeaway}`, "");
  if (prompts.length) lines.push("Discussion questions:", ...prompts.map((p, i) => `${i + 1}. ${p}`), "");
  if (note) lines.push("My notes:", note, "");
  if (article.url) lines.push(article.url);
  return lines.join("\n").trim();
}

export function compareRows(a, b) {
  const ap = a.ai_appraisal || {};
  const bp = b.ai_appraisal || {};
  const rows = [
    ["Study type", a.study_type, b.study_type],
    ["Journal", a.journal || a.source, b.journal || b.source],
    ["Published", a.pubdate, b.pubdate],
    ["Citations", String(a.citation_count ?? ""), String(b.citation_count ?? "")],
    ["Impact (1-5)", String(impactScore(a) ?? ""), String(impactScore(b) ?? "")],
    ["Population", ap.population, bp.population],
    ["Intervention", ap.intervention, bp.intervention],
    ["Outcome", ap.outcome, bp.outcome],
    ["Takeaway", a.ai_rounds_takeaway, b.ai_rounds_takeaway],
  ];
  return rows.filter(([, x, y]) => x || y).map(([label, x, y]) => [label, x || "-", y || "-"]);
}
