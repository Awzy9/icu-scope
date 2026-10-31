// Browser check of the evidence labels. Usage: NODE_PATH=$(npm root -g) node tests/ui_check.js [screenshot-dir]
// Serves the repo root locally and intercepts data/articles.json to inject adversarial scenarios.
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]); if (p === "/") p = "/index.html"; if (p === "/evidence") p = "/evidence.html";
  const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": types[path.extname(f)] || "text/plain" }); fs.createReadStream(f).pipe(r);
});
let failures = 0; const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) failures++; };
(async () => {
  await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}`;
  const shots = process.argv[2]; const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
  const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  const data = JSON.parse(fs.readFileSync(path.join(root, "data/articles.json"), "utf8"));
  const cat = data.categories.find((c) => c.articles.length > 3);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const mk = (title, ev, extra = {}) => ({ ...clone(cat.articles[0]), title, pmid: String(900000 + Math.floor(Math.random() * 99999)), ai_summary: "SECRET-AI-TEXT-" + title, ai_rounds_takeaway: "SECRET-TAKEAWAY", evidence: { id: "ev_x", state: "published", class: "original_research", class_label: "Original research", source_verified: false, full_text_reviewed: false, clinically_reviewed: false, ai_status: "none", retraction_status: "none", notices: [], unverified_legacy: false, ...ev }, ...extra });
  const injected = [
    mk("RETRACTEDCASE", { state: "retracted", retraction_status: "retracted", source_verified: true, last_verified: "2026-10-31", notices: [{ type: "retraction", doi: "10.1016/S0140-6736(20)31324-6", date: "2020-06-05" }], ai_status: "withheld" }),
    mk("UNVALIDATEDAI", { ai_status: "withheld", unverified_legacy: true }),
    mk("NOEVIDENCEBLOCK", {}, { evidence: undefined }),
    mk("VERIFIEDCASE", { source_verified: true, last_verified: "2026-10-31", ai_status: "auto_validated" }),
    mk("CORRECTEDCASE", { retraction_status: "corrected", needs_reassessment: true, source_verified: true, last_verified: "2026-10-31", ai_status: "withheld" }),
  ];
  data.categories = [{ ...cat, articles: injected.concat(cat.articles.slice(0, 3)) }, ...data.categories.filter((c) => c !== cat)];
  await page.route("**/data/articles.json*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(data) }));
  await page.route("**/api/**", (r) => r.fulfill({ status: 404, body: "{}" }));
  await page.goto(base, { waitUntil: "networkidle" }); await page.waitForSelector(".article-card");
  const card = (t) => page.locator(".article-card", { hasText: t }).first();
  const html = async (t) => (await card(t).innerHTML());
  const txt = async (t) => (await card(t).innerText());

  check((await html("RETRACTEDCASE")).includes("ev-retracted"), "retracted article shows prominent retraction banner");
  check(/Retracted publication/i.test(await txt("RETRACTEDCASE")) && !(await txt("RETRACTEDCASE")).includes("SECRET-AI-TEXT"), "retracted article never shows AI summary (even if present in data)");
  check(!(await txt("UNVALIDATEDAI")).includes("SECRET-AI-TEXT") && !(await txt("UNVALIDATEDAI")).includes("SECRET-TAKEAWAY"), "AI text hidden when ai_status is not validated (defence in depth)");
  check(/Not yet verified/.test(await txt("UNVALIDATEDAI")) && !/Source verified/.test(await txt("UNVALIDATEDAI")), "unverified item carries NO 'Source verified' badge");
  check(/Verification pending/.test(await txt("NOEVIDENCEBLOCK")) && !(await txt("NOEVIDENCEBLOCK")).includes("SECRET-AI-TEXT"), "item with no evidence block: no badge, no AI text");
  const v = await txt("VERIFIEDCASE");
  check(/Source verified/.test(v) && /Last verified 2026-10-31/.test(v) && /AI-assisted summary/.test(v) && v.includes("SECRET-AI-TEXT") && !v.includes("SECRET-TAKEAWAY"), "verified item: badge + date + AI-assisted label; unapproved practice takeaway withheld");
  check(!/Full text reviewed|Clinically reviewed/.test(v), "no full-text / clinical-review badge without that review");
  check(/Corrected publication/.test(await txt("CORRECTEDCASE")) && !(await txt("CORRECTEDCASE")).includes("SECRET-AI-TEXT"), "corrected item labelled; AI withheld pending reassessment");
  const verifiedChips = await page.locator(".ev-ok", { hasText: "Source verified" }).count();
  check(verifiedChips >= 1, `real gated data renders verified badges (${verifiedChips} visible)`);
  await page.click("#classics-section .collapse-toggle").catch(() => {});
  const classicsText = await page.locator("#classics-section").innerText();
  check(!/Source verified/.test(classicsText) && /editorial summary/i.test(await page.locator("#classics-section").innerHTML()), "ICU Classics (hand-written, no verified PMID) shows no verification badge");
  check(/does not replace clinical judgment/.test(await page.locator("footer").innerText()), "educational disclaimer present");
  check(errs.length === 0, "no uncaught JS errors" + (errs.length ? ": " + errs[0] : ""));
  await page.goto(base + "/evidence"); check(/Source verified/.test(await page.innerText("body")) && /full text/i.test(await page.innerText("body")), "methods page explains labels and metadata-vs-full-text distinction");
  if (shots) { await page.goto(base); await page.waitForSelector(".article-card"); await page.screenshot({ path: path.join(shots, "ui.png"), clip: { x: 0, y: 0, width: 1000, height: 1400 } }); }
  await browser.close(); server.close(); console.log(failures ? `\n${failures} UI check(s) FAILED` : "\nAll UI checks passed"); process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
