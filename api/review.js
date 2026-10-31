"use strict";
// Editorial review API for the ICU Scope evidence system.
//
//   POST {op:"login", email, password}     -> reviewer access token (Supabase password grant, server-side)
//   GET                                     -> review queue (reviewer only)
//   POST {op:"decide", content_id, action, note, fields?} -> records a decision
//
// Security model
//  * Identity comes ONLY from a Supabase access token verified server-side (/auth/v1/user); the reviewer name
//    written to the decision is that verified email, never a client-supplied value.
//  * Authorisation = verified, confirmed email present in ICU_SCOPE_REVIEWER_EMAILS (server env). Fail closed.
//  * Decisions are committed as data/decisions/*.json with GITHUB_REVIEW_TOKEN (server env, never sent to the
//    browser). They are applied + re-validated by scripts/evidence_cli.py apply-decisions (CI), which enforces
//    every publication rule again, so this endpoint cannot publish anything by itself.
//  * Required env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_ANON_KEY (or NEXT_PUBLIC_...),
//    ICU_SCOPE_REVIEWER_EMAILS, GITHUB_REVIEW_TOKEN. Optional: GITHUB_REPO, GITHUB_BRANCH.

const ACTIONS = ["approve", "reject", "approve_ai", "approve_ai_practice", "reject_ai", "mark_full_text_reviewed",
  "mark_clinically_reviewed", "accept_update", "reject_update", "restore_to_review", "archive", "investigate", "set_fields", "set_appraisal"];
const FIELDS = ["population", "sample_size", "intervention", "comparator", "primary_outcomes", "main_results", "statistical_interpretation", "limitations"];
const QUEUE_STATES = ["pending_review", "under_investigation", "updated", "retracted"];

function config() {
  const env = process.env;
  return {
    supabaseUrl: (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, ""),
    anonKey: env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    reviewers: (env.ICU_SCOPE_REVIEWER_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    ghToken: env.GITHUB_REVIEW_TOKEN || "",
    repo: env.GITHUB_REPO || "Awzy9/icu-scope",
    branch: env.GITHUB_BRANCH || "main",
  };
}
const configured = (c) => !!(c.supabaseUrl && c.anonKey && c.reviewers.length && c.ghToken);

// Best-effort throttling (per warm instance): 30 requests / minute / client, 8 logins / 10 min / client.
const hits = new Map();
function throttled(key, limit, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}

async function verifiedUser(token, c) {
  if (!token) return null;
  const r = await fetch(`${c.supabaseUrl}/auth/v1/user`, { headers: { apikey: c.anonKey, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.email && u.email_confirmed_at ? { id: u.id, email: String(u.email).toLowerCase() } : null;
}

async function authenticate(req, c) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
  let user;
  try { user = await verifiedUser(m && m[1], c); } catch (e) { return { status: 503, error: "Authentication service unavailable" }; }
  if (!user) return { status: 401, error: "Sign-in required" };
  if (!c.reviewers.includes(user.email)) return { status: 403, error: "Not an authorised ICU Scope reviewer" };
  return { status: 200, user };
}

function validateDecision(b) {
  if (!b || typeof b !== "object") return "Invalid body";
  if (!/^ev_[0-9a-f_]{6,40}$/.test(String(b.content_id || ""))) return "Invalid content_id";
  if (!ACTIONS.includes(b.action)) return "Unknown action";
  const note = String(b.note || "").trim();
  if (note.length < 10 || note.length > 2000) return "A documented note of 10-2000 characters is required";
  if (b.action === "set_appraisal") {
    if (!b.items || typeof b.items !== "object" || !Object.keys(b.items).length) return "items required";
    for (const [k, v] of Object.entries(b.items)) {
      if (!/^[a-z_]{3,40}$/.test(k) || !v || !["not_assessed", "met", "partially_met", "not_met", "not_reported"].includes(v.status) || String(v.note || "").length > 500) return `Invalid appraisal item '${k}'`;
    }
  }
  if (b.action === "set_fields") {
    if (!b.fields || typeof b.fields !== "object" || !Object.keys(b.fields).length) return "fields required";
    for (const [k, v] of Object.entries(b.fields)) {
      if (!FIELDS.includes(k)) return `Field '${k}' is not editable`;
      if (typeof v !== "string" || v.length > 2000) return `Invalid value for '${k}'`;
    }
  }
  return null;
}

async function gh(c, path, opts = {}) {
  return fetch(`https://api.github.com/repos/${c.repo}/contents/${path}${opts.method === "PUT" ? "" : `?ref=${encodeURIComponent(c.branch)}`}`, {
    ...opts,
    headers: { Authorization: `Bearer ${c.ghToken}`, "User-Agent": "icu-scope-review", Accept: opts.raw ? "application/vnd.github.raw" : "application/vnd.github+json", ...(opts.headers || {}) },
  });
}

async function loadQueue(c) {
  const [ledgerRes, cacheRes] = await Promise.all([gh(c, "data/verification.json", { raw: true }), gh(c, "data/ai_cache.json", { raw: true })]);
  if (!ledgerRes.ok) throw new Error(`ledger HTTP ${ledgerRes.status}`);
  const ledger = await ledgerRes.json();
  const cache = cacheRes.ok ? await cacheRes.json() : {};
  const items = Object.values(ledger.records || {}).filter((r) => QUEUE_STATES.includes(r.state) || r.pending_update);
  items.sort((a, b) => String(a.last_updated).localeCompare(String(b.last_updated)));
  return items.slice(0, 200).map((r) => {
    const key = r.pmid ? `pmid:${r.pmid}` : null;
    return {
      content_id: r.content_id, title: r.title, journal: r.journal, publication_date: r.publication_date, pmid: r.pmid, doi: r.doi,
      state: r.state, content_class: r.content_class, legacy: !!r.legacy, retraction_status: r.retraction_status, flags: r.flags,
      source_verification: r.source_verification, notices: r.notices, trial_registration: r.trial_registration,
      full_text_review: r.full_text_review, clinical_review: r.clinical_review,
      ai: { status: r.ai.status, issues: r.ai.issues, trace: (r.ai.trace || []).slice(0, 12), text: key && cache[key] ? cache[key] : null },
      pending_update: r.pending_update ? { detected_at: r.pending_update.detected_at, title: r.pending_update.article.title, abstract: String(r.pending_update.article.abstract || "").slice(0, 1500) } : null,
      fields: Object.fromEntries(FIELDS.map((f) => [f, r[f]])),
      links: { pubmed: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(r.pmid)}/` : null, doi: r.doi ? `https://doi.org/${r.doi}` : null },
    };
  });
}

async function writeDecision(c, reviewer, b) {
  const at = new Date().toISOString();
  const decision = { content_id: b.content_id, action: b.action, reviewer, note: String(b.note).trim(), via: "web", at, ...(b.fields ? { fields: b.fields } : {}), ...(b.items ? { items: b.items, complete: !!b.complete } : {}) };
  const name = `${at.replace(/[:.]/g, "")}-${b.content_id}.json`;
  const r = await gh(c, `data/decisions/${name}`, {
    method: "PUT",
    body: JSON.stringify({ message: `Editorial decision: ${b.action} ${b.content_id} (by ${reviewer})`, branch: c.branch, content: Buffer.from(JSON.stringify(decision, null, 1)).toString("base64") }),
  });
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return name;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const send = (code, obj) => res.status(code).json(obj);
  const c = config();
  if (!configured(c)) return send(503, { ok: false, error: "Review system is not configured" });
  if (req.method !== "GET" && req.method !== "POST") return send(405, { ok: false, error: "Method not allowed" });
  const ip = String((req.headers["x-forwarded-for"] || "").split(",")[0] || "anon").trim();
  if (throttled(`all:${ip}`, 30, 60000)) return send(429, { ok: false, error: "Too many requests" });
  try {
    const body = req.method === "POST" ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) : {};
    if (req.method === "POST" && body.op === "login") {
      if (throttled(`login:${ip}`, 8, 600000)) return send(429, { ok: false, error: "Too many sign-in attempts" });
      const r = await fetch(`${c.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: c.anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(body.email || ""), password: String(body.password || "") }),
      });
      if (!r.ok) return send(401, { ok: false, error: "Invalid credentials" });
      const t = await r.json();
      const fake = { headers: { authorization: `Bearer ${t.access_token}` } };
      const a = await authenticate(fake, c);
      if (a.status !== 200) return send(a.status, { ok: false, error: a.error });   // valid account but not a reviewer: no token issued
      return send(200, { ok: true, accessToken: t.access_token, expiresIn: t.expires_in, email: a.user.email });
    }
    const a = await authenticate(req, c);
    if (a.status !== 200) return send(a.status, { ok: false, error: a.error });
    if (req.method === "GET") return send(200, { ok: true, reviewer: a.user.email, items: await loadQueue(c) });
    if (body.op !== "decide") return send(400, { ok: false, error: "Unknown operation" });
    const bad = validateDecision(body);
    if (bad) return send(400, { ok: false, error: bad });
    const file = await writeDecision(c, a.user.email, body);          // reviewer = verified identity
    return send(202, { ok: true, recorded: file, note: "Decision recorded; it takes effect when the evidence workflow applies and re-validates it." });
  } catch (e) {
    console.error("[review]", e && e.message);
    return send(502, { ok: false, error: "Upstream error" });
  }
};
module.exports._internals = { validateDecision, authenticate, config, ACTIONS };
