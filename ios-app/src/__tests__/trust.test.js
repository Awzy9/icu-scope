import {
  AI_FIELDS, CLASSIC_EVIDENCE, DISCLAIMER, aiAllowed, aiLabel, cardTag, evidenceBanner, evidenceChips, overlayLive, practiceAllowed, sanitizeArticle, sanitizeFeed,
} from "../trust";

const ev = (over = {}) => ({
  id: "ev_1", state: "published", class: "original_research", class_label: "Original research", source_verified: true, last_verified: "2026-10-31",
  full_text_reviewed: false, clinically_reviewed: false, ai_status: "auto_validated", ai_practice_approved: false, retraction_status: "none", notices: [],
  unverified_legacy: false, ...over,
});
const art = (over = {}, e = ev()) => ({
  pmid: "1", title: "T", study_type: "Randomized Controlled Trial", ai_summary: "S", ai_significance: "W", ai_key_stats: "n=10", ai_rounds_takeaway: "Give drug X.",
  ai_appraisal: { design: "D", bottom_line: "Use it." }, evidence: e, ...over,
});

describe("AI gating", () => {
  it("allows AI only for validated statuses", () => {
    expect(aiAllowed(art())).toBe(true);
    expect(aiAllowed(art({}, ev({ ai_status: "editor_approved" })))).toBe(true);
    for (const s of ["none", "withheld", "failed", "rejected", undefined]) expect(aiAllowed(art({}, ev({ ai_status: s })))).toBe(false);
    expect(aiAllowed({ pmid: "9" })).toBe(false);                                   // no evidence block (old cache): nothing is trusted
  });

  it("never shows the practice takeaway / bottom line without editorial approval", () => {
    const a = sanitizeArticle(art());
    expect(a.ai_summary).toBe("S");
    expect(a.ai_rounds_takeaway).toBeUndefined();
    expect(a.ai_appraisal).toEqual({ design: "D" });
    const approved = sanitizeArticle(art({}, ev({ ai_status: "editor_approved", ai_practice_approved: true })));
    expect(practiceAllowed(approved)).toBe(true);
    expect(approved.ai_rounds_takeaway).toBe("Give drug X.");
    expect(approved.ai_appraisal.bottom_line).toBe("Use it.");
  });

  it("strips every AI field when not validated, retracted or with no evidence block", () => {
    for (const a of [art({}, ev({ ai_status: "withheld" })), art({}, ev({ state: "retracted", retraction_status: "retracted", ai_status: "withheld" })), art({ evidence: undefined })]) {
      sanitizeArticle(a);
      AI_FIELDS.forEach((k) => expect(a[k]).toBeUndefined());
    }
  });

  it("sanitises every section of an (old) cached feed", () => {
    const feed = { categories: [{ id: "x", articles: [art({ evidence: undefined })] }], trending: { articles: [art({ evidence: undefined })] }, foamed: { articles: [art({ evidence: undefined })] },
      spotlight: art({ evidence: undefined }) };
    sanitizeFeed(feed);
    expect(feed.categories[0].articles[0].ai_summary).toBeUndefined();
    expect(feed.trending.articles[0].ai_rounds_takeaway).toBeUndefined();
    expect(feed.foamed.articles[0].ai_appraisal).toBeUndefined();
    expect(feed.spotlight.ai_summary).toBeUndefined();
    expect(sanitizeFeed(null)).toBeNull();
  });

  it("labels AI honestly", () => {
    expect(aiLabel(art())).toMatch(/not clinically reviewed/);
    expect(aiLabel(art({}, ev({ ai_status: "editor_approved" })))).toMatch(/editorially approved/);
  });
});

describe("labels are only shown when the verification actually occurred", () => {
  const keys = (a) => evidenceChips(a).map((c) => c.key);

  it("verified article: source verified with date, metadata-only, no review badges", () => {
    const chips = evidenceChips(art());
    expect(chips.find((c) => c.key === "verified").label).toBe("Source verified · 2026-10-31");
    expect(keys(art())).not.toEqual(expect.arrayContaining(["fulltext", "clinical", "appraised"]));
  });

  it("unverified legacy: 'Not yet verified', never 'Source verified'", () => {
    const a = art({}, ev({ source_verified: false, unverified_legacy: true, last_verified: null }));
    expect(keys(a)).toContain("unverified");
    expect(keys(a)).not.toContain("verified");
  });

  it("no evidence block: verification pending, no badge", () => {
    expect(evidenceChips({ pmid: "1" })).toEqual([expect.objectContaining({ key: "pending" })]);
  });

  it("review badges appear only when set", () => {
    const a = art({}, ev({ full_text_reviewed: true, clinically_reviewed: true, appraisal: { framework: "CONSORT 2025 / RoB 2 (randomised trial)" } }));
    expect(keys(a)).toEqual(expect.arrayContaining(["fulltext", "clinical", "appraised"]));
    expect(evidenceChips(a).find((c) => c.key === "appraised").label).toBe("Appraised: CONSORT 2025 / RoB 2");
  });

  it("evidence limitations by design", () => {
    expect(evidenceChips(art({ study_type: "Preprint (not peer-reviewed)" })).find((c) => c.key === "limit").label).toMatch(/Not peer-reviewed/);
    expect(evidenceChips(art({ study_type: "Observational Study" })).find((c) => c.key === "limit").label).toMatch(/association, not causation/);
    expect(evidenceChips(art({ study_type: "Clinical Trial (Recruiting)" }, ev({ class: "registry_record" }))).find((c) => c.key === "limit").label).toMatch(/no results/);
    expect(keys(art())).not.toContain("limit");
  });

  it("Classics carry no verification badge", () => {
    const k = evidenceChips({ study_type: "Landmark Trial", evidence: CLASSIC_EVIDENCE }).map((c) => c.key);
    expect(k).toContain("unverified");
    expect(k).not.toContain("verified");
  });
});

describe("banner", () => {
  it("retracted: red alert with validated notice links only", () => {
    const b = evidenceBanner(art({}, ev({ state: "retracted", retraction_status: "retracted", ai_status: "withheld",
      notices: [{ type: "retraction", doi: "10.1016/S0140-6736(20)31324-6", date: "2020-06-05" }, { type: "correction", pmid: "123" }, { type: "x", doi: "javascript:alert(1)" }] })));
    expect(b).toMatchObject({ kind: "retracted", tone: "red", title: "Retracted publication" });
    expect(b.body).toMatch(/must not be used/);
    expect(b.links.map((l) => l.url)).toEqual(["https://doi.org/10.1016/S0140-6736(20)31324-6", "https://pubmed.ncbi.nlm.nih.gov/123/"]);   // unsafe URL dropped
  });

  it("expression of concern and correction", () => {
    expect(evidenceBanner(art({}, ev({ state: "under_investigation" })))).toMatchObject({ kind: "concern", tone: "amber" });
    expect(evidenceBanner(art({}, ev({ retraction_status: "expression_of_concern" })))).toMatchObject({ kind: "concern" });
    const c = evidenceBanner(art({}, ev({ retraction_status: "corrected", needs_reassessment: true })));
    expect(c).toMatchObject({ kind: "corrected" });
    expect(c.body).toMatch(/withheld until/);
  });

  it("none for a clean article", () => {
    expect(evidenceBanner(art())).toBeNull();
    expect(evidenceBanner({})).toBeNull();
  });

  it("list-card tag: retraction wins; verified is a quiet tag; nothing when unknown", () => {
    expect(cardTag(art({}, ev({ state: "retracted", retraction_status: "retracted" })))).toMatchObject({ label: "Retracted", tone: "red" });
    expect(cardTag(art())).toMatchObject({ label: "Verified", tone: "green" });
    expect(cardTag(art({}, ev({ source_verified: false, unverified_legacy: true })))).toBeNull();
  });
});

describe("saved articles are refreshed from the live feed", () => {
  it("a saved copy picks up a later retraction and loses its AI text", () => {
    const savedCopy = art();                                                       // saved last week: verified, AI shown
    const live = art({ ai_summary: undefined, ai_rounds_takeaway: undefined, ai_appraisal: undefined, ai_significance: undefined, ai_key_stats: undefined },
      ev({ state: "retracted", retraction_status: "retracted", ai_status: "withheld" }));
    const out = overlayLive([savedCopy], { categories: [{ id: "x", articles: [live] }] });
    expect(evidenceBanner(out[0]).kind).toBe("retracted");
    AI_FIELDS.forEach((k) => expect(out[0][k]).toBeUndefined());
    expect(savedCopy.evidence.state).toBe("published");                            // the stored copy itself is not mutated
  });

  it("returns the same array when nothing changed (stable memoisation)", () => {
    const saved = [art()];
    const feed = { categories: [{ id: "x", articles: [JSON.parse(JSON.stringify(art()))] }] };
    expect(overlayLive(saved, feed)).toBe(saved);
  });

  it("a saved article absent from the feed is still sanitised", () => {
    const stale = art({}, ev({ ai_status: "withheld" }));
    const out = overlayLive([stale], { categories: [] });
    expect(out[0].ai_summary).toBeUndefined();
  });

  it("finds articles in non-category sections and by url key", () => {
    const f = art({ pmid: undefined, url: "https://x.org/p" }, ev({ state: "under_investigation" }));
    const out = overlayLive([art({ pmid: undefined, url: "https://x.org/p" })], { foamed: { articles: [f] }, categories: [] });
    expect(evidenceBanner(out[0]).kind).toBe("concern");
  });

  it("handles empty / missing input", () => {
    expect(overlayLive([], null)).toEqual([]);
    expect(overlayLive(undefined, {})).toBeUndefined();
  });
});

it("disclaimer states the educational purpose and metadata-vs-full-text distinction", () => {
  expect(DISCLAIMER).toMatch(/not medical advice/);
  expect(DISCLAIMER).toMatch(/not a full-text or clinical review/);
});
