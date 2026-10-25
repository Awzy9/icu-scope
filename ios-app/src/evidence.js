export const IMPACT_LABELS = {
  5: "★★★★★ Practice changing",
  4: "★★★★ Strong evidence",
  3: "★★★ Interesting",
  2: "★★ Research only",
  1: "★ Hypothesis generating",
};

// Mirrors impactScore() on the website (app.js): a deterministic estimate from
// study design, journal tier and citations, not an AI judgment. Null means
// "not applicable" (blog posts, trial registrations without results).
export function impactScore(article) {
  const type = (article.study_type || "").toLowerCase();
  if (!type || type.includes("foamed") || type.startsWith("clinical trial (")) return null;
  if (type.includes("preprint")) return 1;
  const notable = article.is_top_journal || (article.citation_count || 0) >= 10;
  if (type.includes("landmark") || type.includes("guideline")) return 5;
  if (type.includes("meta-analysis") || type.includes("systematic review")) return notable ? 5 : 4;
  if (type.includes("randomized")) return notable ? 5 : 4;
  if (type.includes("trial")) return notable ? 4 : 3;
  if (type.includes("multicenter") || type.includes("comparative") || type.includes("observational")) return 3;
  return 2;
}
