// Run: node --test tests/review_api.test.js   (no dependencies; global fetch is mocked)
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

process.env.SUPABASE_URL = "https://sb.example";
process.env.SUPABASE_ANON_KEY = "anon";
process.env.ICU_SCOPE_REVIEWER_EMAILS = "Reviewer@Example.com, second@example.com";
process.env.GITHUB_REVIEW_TOKEN = "ghp_secret";
const handler = require(path.join("..", "api", "review.js"));

const users = { "tok-reviewer": { id: "1", email: "reviewer@example.com", email_confirmed_at: "x" },
  "tok-outsider": { id: "2", email: "outsider@example.com", email_confirmed_at: "x" },
  "tok-unconfirmed": { id: "3", email: "reviewer@example.com", email_confirmed_at: null } };
let puts, gets;
const ledger = { records: { ev_abc123def456: { content_id: "ev_abc123def456", title: "T", journal: "J", publication_date: "2026", pmid: "1", doi: "10.1/x", state: "pending_review",
  content_class: "guideline", retraction_status: "none", flags: [], source_verification: { status: "verified", level: "metadata", checks: [] }, notices: [], trial_registration: [],
  full_text_review: {}, clinical_review: {}, ai: { status: "auto_validated", issues: [], trace: [] }, last_updated: "2026-01-01", population: "Unable to verify" },
  ev_published00000: { content_id: "ev_published00000", state: "published", ai: { status: "none", issues: [] }, source_verification: { checks: [] } } } };

global.fetch = async (url, opts = {}) => {
  const j = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url.endsWith("/auth/v1/user")) { const t = (opts.headers.Authorization || "").replace("Bearer ", ""); return users[t] ? j(200, users[t]) : j(401, {}); }
  if (url.includes("/auth/v1/token")) { const b = JSON.parse(opts.body); return b.password === "good" ? j(200, { access_token: b.email.startsWith("out") ? "tok-outsider" : "tok-reviewer", expires_in: 3600 }) : j(400, {}); }
  if (url.includes("api.github.com") && opts.method === "PUT") { puts.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization }); return j(201, {}); }
  if (url.includes("api.github.com")) { gets.push(url); return url.includes("verification.json") ? j(200, ledger) : j(200, {}); }
  throw new Error("unexpected fetch " + url);
};
const call = async (method, headers = {}, body) => {
  let out; const res = { headers: {}, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { out = o; return this; } };
  await handler({ method, headers: { "x-forwarded-for": "t" + Math.random(), ...headers }, body }, res);
  return { code: res.code, body: out };
};
const auth = (t) => ({ authorization: `Bearer ${t}` });
const decision = { op: "decide", content_id: "ev_abc123def456", action: "approve", note: "Issuing body confirmed on official site" };

test.beforeEach(() => { puts = []; gets = []; });

test("unauthenticated requests are rejected and nothing is read or written", async () => {
  assert.strictEqual((await call("GET")).code, 401);
  assert.strictEqual((await call("POST", {}, decision)).code, 401);
  assert.strictEqual(puts.length + gets.length, 0);
});
test("invalid token is rejected", async () => assert.strictEqual((await call("GET", auth("forged"))).code, 401));
test("signed-in user who is not a reviewer gets 403 and cannot record decisions", async () => {
  assert.strictEqual((await call("GET", auth("tok-outsider"))).code, 403);
  assert.strictEqual((await call("POST", auth("tok-outsider"), decision)).code, 403);
  assert.strictEqual(puts.length, 0);
});
test("reviewer with unconfirmed email is rejected", async () => assert.strictEqual((await call("GET", auth("tok-unconfirmed"))).code, 401));
test("reviewer sees the queue; only items needing action; no secrets leak", async () => {
  const r = await call("GET", auth("tok-reviewer"));
  assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.body.items.map((i) => i.content_id), ["ev_abc123def456"]);
  assert.ok(!JSON.stringify(r.body).includes("ghp_secret"));
});
test("decision is written with the VERIFIED reviewer identity, not a client-supplied one", async () => {
  const r = await call("POST", auth("tok-reviewer"), { ...decision, reviewer: "someone.else@evil.com" });
  assert.strictEqual(r.code, 202); assert.strictEqual(puts.length, 1);
  const written = JSON.parse(Buffer.from(puts[0].body.content, "base64").toString());
  assert.strictEqual(written.reviewer, "reviewer@example.com"); assert.strictEqual(written.via, "web");
  assert.match(puts[0].url, /data\/decisions\/.+ev_abc123def456\.json$/);
});
test("decision validation: unknown action, short note, bad id, bad editable field", async () => {
  for (const bad of [{ action: "delete_everything" }, { note: "short" }, { content_id: "../../etc/passwd" }, { action: "set_fields", fields: { state: "published" } }, { op: "other" }]) {
    const r = await call("POST", auth("tok-reviewer"), { ...decision, ...bad }); assert.strictEqual(r.code, 400, JSON.stringify(bad));
  }
  assert.strictEqual(puts.length, 0);
});
test("login: wrong password 401; valid non-reviewer gets no token; reviewer gets token", async () => {
  assert.strictEqual((await call("POST", {}, { op: "login", email: "reviewer@example.com", password: "bad" })).code, 401);
  const o = await call("POST", {}, { op: "login", email: "outsider@example.com", password: "good" });
  assert.strictEqual(o.code, 403); assert.ok(!o.body.accessToken);
  const r = await call("POST", {}, { op: "login", email: "reviewer@example.com", password: "good" });
  assert.strictEqual(r.code, 200); assert.strictEqual(r.body.accessToken, "tok-reviewer");
});
test("unsupported methods and missing configuration fail closed", async () => {
  assert.strictEqual((await call("DELETE", auth("tok-reviewer"))).code, 405);
  const saved = process.env.ICU_SCOPE_REVIEWER_EMAILS; process.env.ICU_SCOPE_REVIEWER_EMAILS = "";
  assert.strictEqual((await call("GET", auth("tok-reviewer"))).code, 503); process.env.ICU_SCOPE_REVIEWER_EMAILS = saved;
});
test("login attempts are throttled", async () => {
  const hdr = { "x-forwarded-for": "9.9.9.9" }; let last;
  for (let i = 0; i < 10; i++) last = await call("POST", hdr, { op: "login", email: "reviewer@example.com", password: "bad" });
  assert.strictEqual(last.code, 429);
});
