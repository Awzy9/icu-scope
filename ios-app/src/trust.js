// Clinical-evidence labels for the app. Mirrors the website (app.js) and is driven ONLY by the server-side `evidence`
// block in data/articles.json (produced by scripts/evidence): a label is shown only if the corresponding verification
// actually happened, and nothing is inferred on the device. "Source verified" means bibliographic METADATA was
// cross-checked against PubMed/Crossref/ClinicalTrials.gov; it is not a full-text or clinical review.

export const METHODS_URL = "https://icu-scope.vercel.app/evidence";

export const DISCLAIMER =
  "Educational evidence resource, not medical advice. ICU Scope does not replace clinical judgment or institutional protocols. " +
  "“Source verified” means article metadata was cross-checked against PubMed, Crossref and ClinicalTrials.gov; it is not a full-text or " +
  "clinical review unless a label says so. AI-assisted summaries are interpretations of the abstract: check the original source before " +
  "using anything in patient care.";

export const AI_FIELDS = ["ai_summary", "ai_significance", "ai_key_stats", "ai_rounds_takeaway", "ai_appraisal"];
const SECTIONS = ["trending", "foamed", "bottom_line", "guidelines", "ksa", "this_week", "preprints", "trials"];

const LIMITATIONS = {
  "Preprint (not peer-reviewed)": "Not peer-reviewed",
  "Observational Study": "Observational design: association, not causation",
  "Case Reports": "Case report: hypothesis generating only",
  "Multicenter Study": "Design not specified by PubMed: check methods",
  Study: "Design not specified by PubMed: check methods",
};

// ---- AI gating (defence in depth: the server already strips these; old cached feeds may not have) -----------------
export const aiAllowed = (a) => {
  const s = a?.evidence?.ai_status;
  return s === "auto_validated" || s === "editor_approved";
};
export const practiceAllowed = (a) => aiAllowed(a) && a.evidence.ai_practice_approved === true;

export function aiLabel(a) {
  return a?.evidence?.ai_status === "editor_approved"
    ? "AI-assisted summary · editorially approved"
    : "AI-assisted summary · automated source check passed · not clinically reviewed";
}

// Removes AI text that is not allowed. Mutates and returns the article (feed objects are freshly parsed JSON).
export function sanitizeArticle(a) {
  if (!a || typeof a !== "object") return a;
  if (!aiAllowed(a)) {
    AI_FIELDS.forEach((k) => delete a[k]);
    return a;
  }
  if (!practiceAllowed(a)) {
    delete a.ai_rounds_takeaway;
    if (a.ai_appraisal && "bottom_line" in a.ai_appraisal) {
      const { bottom_line: _omit, ...rest } = a.ai_appraisal;
      a.ai_appraisal = rest;
    }
  }
  return a;
}

export function sanitizeFeed(feed) {
  if (!feed || typeof feed !== "object") return feed;
  (feed.categories || []).forEach((c) => (c.articles || []).forEach(sanitizeArticle));
  SECTIONS.forEach((k) => (feed[k]?.articles || []).forEach(sanitizeArticle));
  if (feed.spotlight) sanitizeArticle(feed.spotlight);
  return feed;
}

// Curated, hand-written ICU Classics have no verified PMID/DOI: shown WITHOUT any verification badge.
export const CLASSIC_EVIDENCE = {
  state: "published", class: "landmark_trial", class_label: "Curated landmark trial (editorial summary)", source_verified: false,
  full_text_reviewed: false, clinically_reviewed: false, ai_status: "none", retraction_status: "unknown", notices: [], unverified_legacy: true,
};

// ---- Banner (retraction / concern / correction) --------------------------------------------------------------------
const doiUrl = (d) => (/^10\.\d{4,9}\/\S+$/.test(d || "") ? `https://doi.org/${d}` : null);
const pmidUrl = (p) => (/^\d+$/.test(p || "") ? `https://pubmed.ncbi.nlm.nih.gov/${p}/` : null);

export function evidenceBanner(a) {
  const ev = a?.evidence;
  if (!ev) return null;
  const links = (ev.notices || [])
    .map((n) => {
      const url = doiUrl(n.doi) || pmidUrl(n.pmid);
      return url ? { label: `${String(n.type || "notice").replace(/_/g, " ")}${n.date ? ` (${n.date})` : ""}`, url } : null;
    })
    .filter(Boolean);
  if (ev.state === "retracted" || ev.retraction_status === "retracted") {
    return {
      kind: "retracted",
      tone: "red",
      icon: "close-circle",
      title: "Retracted publication",
      body: "This article has been retracted. Its findings must not be used to support clinical decisions; summaries are withheld. It is kept only as a historical record.",
      links,
    };
  }
  if (ev.state === "under_investigation" || ev.retraction_status === "expression_of_concern") {
    return {
      kind: "concern",
      tone: "amber",
      icon: "warning",
      title: "Under investigation",
      body: "An expression of concern or an unresolved verification problem affects this publication. Do not rely on it until it has been reassessed; summaries are withheld.",
      links,
    };
  }
  if (ev.retraction_status === "corrected" || ev.retraction_status === "updated" || ev.needs_reassessment) {
    return {
      kind: "corrected",
      tone: "amber",
      icon: "create",
      title: "Corrected publication",
      body: `A correction or update notice exists for this article${ev.needs_reassessment ? "; ICU Scope summaries are withheld until it is re-reviewed" : ""}.`,
      links,
    };
  }
  return null;
}

// ---- Chips -------------------------------------------------------------------------------------------------------
export function evidenceChips(a) {
  const ev = a?.evidence;
  if (!ev) return [{ key: "pending", label: "Verification pending", tone: "textMuted", icon: "time-outline" }];
  const chips = [];
  if (ev.class_label) chips.push({ key: "class", label: ev.class_label, tone: "teal" });
  if (ev.source_verified) {
    chips.push({ key: "verified", label: `Source verified${ev.last_verified ? ` · ${ev.last_verified}` : ""}`, tone: "green", icon: "checkmark-circle" });
  } else if (ev.unverified_legacy) {
    chips.push({ key: "unverified", label: "Not yet verified", tone: "textMuted", icon: "time-outline" });
  }
  if (ev.full_text_reviewed) chips.push({ key: "fulltext", label: "Full text reviewed", tone: "green", icon: "document-text" });
  if (ev.clinically_reviewed) chips.push({ key: "clinical", label: "Clinically reviewed", tone: "green", icon: "medkit" });
  if (ev.appraisal?.framework) chips.push({ key: "appraised", label: `Appraised: ${String(ev.appraisal.framework).split(" (")[0]}`, tone: "green", icon: "clipboard" });
  if (ev.retraction_status === "corrected") chips.push({ key: "corrected", label: "Corrected publication", tone: "amber", icon: "create" });
  if (ev.retraction_status === "retracted") chips.push({ key: "retracted", label: "Retracted publication", tone: "red", icon: "close-circle" });
  const lim = LIMITATIONS[a.study_type] || (ev.class === "registry_record" ? "Registration only: no results" : "");
  if (lim) chips.push({ key: "limit", label: `Evidence limitation: ${lim}`, tone: "amber", icon: "alert-circle-outline" });
  return chips;
}

// Short tag for list cards: only things a reader must not miss in a list.
export function cardTag(a) {
  const b = evidenceBanner(a);
  if (b) return { label: b.kind === "retracted" ? "Retracted" : b.kind === "concern" ? "Under investigation" : "Corrected", tone: b.tone, icon: b.icon };
  if (a?.evidence?.source_verified) return { label: "Verified", tone: "green", icon: "checkmark-circle" };
  return null;
}

// ---- Saved articles keep a full COPY; refresh their verification status from the live feed ------------------------
const keyOf = (a) => a.pmid || a.url;

function allFeedArticles(feed) {
  const out = [];
  (feed?.categories || []).forEach((c) => out.push(...(c.articles || [])));
  SECTIONS.forEach((k) => out.push(...(feed?.[k]?.articles || [])));
  return out;
}

const signature = (a) => JSON.stringify([a.evidence, AI_FIELDS.map((k) => a[k])]);

// A saved copy may predate a retraction/correction. Overlay the live `evidence` and (already sanitised) AI text.
// Returns the same array (and same element objects) when nothing changed, so React memoisation is stable.
export function overlayLive(saved, feed) {
  if (!Array.isArray(saved) || !saved.length) return saved;
  const idx = new Map();
  allFeedArticles(feed).forEach((a) => {
    const k = keyOf(a);
    if (k && !idx.has(k)) idx.set(k, a);
  });
  let changed = false;
  const next = saved.map((s) => {
    const live = idx.get(keyOf(s));
    const merged = { ...s };
    if (live) {
      AI_FIELDS.forEach((k) => delete merged[k]);
      AI_FIELDS.forEach((k) => {
        if (live[k] !== undefined) merged[k] = live[k];
      });
      if (live.evidence) merged.evidence = live.evidence;
      else delete merged.evidence;
    } else {
      sanitizeArticle(merged);
    }
    if (signature(merged) === signature(s)) return s;
    changed = true;
    return merged;
  });
  return changed ? next : saved;
}
