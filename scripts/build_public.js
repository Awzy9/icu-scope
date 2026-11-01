#!/usr/bin/env node
"use strict";
// Assembles the deployable static site into ./public.
//
// Why: Vercel serves every file in the deployment BEFORE it applies rewrites, so rewrites/headers cannot hide
// internal pipeline state (archive, verification ledger, audit log, discovery ledger...). The only reliable way to keep
// them private is to not deploy them. Public data is an ALLOWLIST; everything else under data/ is excluded by default,
// so a future internal data file is private unless someone deliberately adds it here.
//
// Fails loudly (non-zero exit) if a required file is missing: Vercel then keeps the previous good deployment.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "public");
const PUBLIC_DATA = new Set(["articles.json", "embeddings.json", "spotlight.json", "link_check.json"]);
const DENY_DIRS = new Set([".git", ".github", ".vercel", "node_modules", "public", "android-app", "ios-app", "cloudflare-worker", "scripts", "tests", "api"]);
const DENY_ROOT_FILES = /^(vercel\.json|netlify\.toml|\.gitignore|\.vercelignore|package(-lock)?\.json|.*\.md)$/i;
const REQUIRED = ["index.html", "app.js", "style.css", "sw.js", "data/articles.json"];

function copyDir(src, dst, rel) {      // rel === "" at the repository root
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!rel && DENY_DIRS.has(e.name)) continue;
      if (r === "data") { copyData(path.join(src, e.name), path.join(dst, e.name)); continue; }
      copyDir(path.join(src, e.name), path.join(dst, e.name), r);
    } else if (e.isFile()) {
      if (!rel && DENY_ROOT_FILES.test(e.name)) continue;
      fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
    }
  }
}

function copyData(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isFile() && PUBLIC_DATA.has(e.name)) fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(ROOT, OUT, "");
const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(OUT, f)));
if (missing.length) { console.error("build_public: required files missing: " + missing.join(", ")); process.exit(1); }
try { JSON.parse(fs.readFileSync(path.join(OUT, "data/articles.json"), "utf8")); } catch (e) { console.error("build_public: data/articles.json is not valid JSON"); process.exit(1); }

let n = 0, bytes = 0;
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { n++; bytes += fs.statSync(p).size; } } })(OUT);
const internal = fs.readdirSync(path.join(ROOT, "data")).filter((f) => !PUBLIC_DATA.has(f) && fs.statSync(path.join(ROOT, "data", f)).isFile());
console.log(`build_public: ${n} files, ${(bytes / 1e6).toFixed(1)} MB -> public/ ; kept private: ${internal.join(", ") || "(none)"}`);
