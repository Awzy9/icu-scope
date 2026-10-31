# ICU Scope — Clinical Evidence Quality & Safety System

Status: implemented on branch `claude/evidence-safety-system`. **Not deployed.** Nothing here reaches production until that branch is merged to `main` (Vercel auto-deploys `main`).

Everything below is based on what was actually run against the live repository data and the live PubMed / Crossref / doi.org / ClinicalTrials.gov APIs on 2026-10-31. Where something could **not** be verified, it says so (see §8).

---

## 1. Repository audit (before any change)

**Architecture.** Static site (`index.html`, `app.js`, `style.css`) on Vercel; no editorial database. Data = JSON files in `data/` rewritten daily by `scripts/fetch_articles.py` (stdlib Python, 1,800 lines) in `.github/workflows/update.yml`, which **commits straight to `main`**, which Vercel **auto-deploys**. Auth = Supabase (`auth.js`, `api/auth-config.js`, `api/sso-consume.js`). AI = Groq `llama-3.1-8b-instant` (summaries, trial appraisals, "rounds takeaway", Article-of-the-Week pick). Optional Cloudflare Worker (Ask-AI, unused: `WORKER_ENDPOINT` blank). iOS/Android apps read the same `articles.json`. No tests existed.

**Literature sources.** PubMed E-utilities (11 organ-system queries, trending, guidelines, KSA), ClinicalTrials.gov v2 (registrations only), medRxiv, RSS (EMCrit, PulmCrit, REBEL EM, LITFL, The Bottom Line), Crossref was **not** used at all. ~930 displayed items across 8 sections (815 unique publications); 10 hand-written "ICU Classics" in `app.js`.

**Original workflow:** fetch → merge into archive → AI summary → write `articles.json` → push to `main` → deploy. The only gate was "feed is non-empty and fresh".

### Vulnerabilities found (all confirmed, not hypothetical)

| # | Finding | Evidence |
|---|---|---|
| V1 | **Fabricated AI statistics shown to users.** The generation prompt contained a literal example (`n=1200, RR 0.82 (95% CI 0.71-0.95), ARR 4.2%, NNT 24, p=0.01`); the 8B model copied it. 14 displayed "key stats" contain numbers absent from the source abstract, incl. `n=1200, p=0.01` on ClinicalTrials.gov *registrations* (which report no results) and `n=1234, RR 0.83 (95% CI 0.72-0.96), ARR 3.1%, NNT 32, p=0.02` on a medRxiv preprint whose text contains none of those figures. | Validator run over all 308 distinct AI items that were live: 54 (17.5%) fail grounding checks. By issue type (an item can have several): 20 unsupported numbers, 21 causal wording on non-randomised studies, 7 unsupported recommendation wording, 6 with no source text, 2 internally inconsistent p/CI, 2 other. (Some may be false positives — the validator is deliberately conservative; see §8.) |
| V2 | **No verification of any identifier.** DOI/PMID were trusted as supplied. Real result of first verification: 1 article has a well-formed DOI that resolves nowhere (10.21470/1678-9741-2025-0271); 2 have title mismatches PubMed↔Crossref. | `data/verification.json` |
| V3 | **An erratum was published as an article** ("Erratum: AASLD Practice Guidance on ACLF…"). No retraction/correction/EoC detection existed anywhere. | feed |
| V4 | **Inconsistent study design for the same paper.** Archived copies are never refreshed, so e.g. PMID 42283370 was "Study" in Renal but "Randomized Controlled Trial" in two other sections (4 PMIDs affected; 19 labels corrected). Affects RCT filter, evidence-tier dots and which AI template applies. | articles.json |
| V5 | **Internal data publicly served:** `/data/archive.json` and `/data/ai_cache.json` return HTTP 200 on production (unreviewed content, AI cache). | `curl` against icu-scope.vercel.app |
| V6 | **Auto-publish with no gate:** any pipeline output went live. No rollback, no post-fetch validation of content. | `update.yml` |
| V7 | **AI "rounds takeaway" / appraisal "bottom line"** are model-generated, practice-directing statements shown with only a generic disclaimer. | `ai_summarize`, `ai_appraise_trial` |
| V8 | **Overwrite risk:** `merge_into_bucket` replaced archived items with every fresh fetch, silently. | `fetch_articles.py` |
| V9 | **Pre-existing, outside scope — not changed:** production CSP (`script-src 'self' 'unsafe-inline'`) blocks the Supabase client import and PostHog (confirmed in a real browser: CSP violations for `cdn.jsdelivr.net/.../supabase-js` and `us.i.posthog.com`), so account sign-in appears non-functional in production. I did **not** loosen the CSP; you should decide. | Playwright against production |
| V10 | Offline service worker serves cached JSON (network-first) — a retracted item could linger offline. SW cache version bumped. | `sw.js` |
| V11 | iOS/Android apps read `articles.json` and do not render the new labels/banners (see §8). | `ios-app/src/data.js` |

---

## 2. What was implemented

One verification code path (`scripts/evidence/`, stdlib only, **no new dependencies**) used by *every* module.

| Requirement | Implementation |
|---|---|
| Source verification engine | `sources.py` (PubMed efetch, Crossref, doi.org handle service, ClinicalTrials.gov v2), `verify.py`. DOI existence is **checked**, never inferred from syntax. PMID existence, DOI↔PMID match, title/journal/date/first-author cross-source comparison, trial-registry existence + title consistency, publication-type consistency. Outcome is `verified / discrepancy / failed / unavailable`. Level is always `metadata`. |
| Metadata vs full text | `full_text_review` is `not_performed` unless a named reviewer records it. No badge says "full text" otherwise. Clinical fields (population, sample size, …) default to `Unable to verify` / `Not reported`; only registry records auto-fill from ClinicalTrials.gov. |
| Retractions / corrections / EoC | PubMed publication types + `CommentsCorrections`, Crossref `update-to` / `updated-by` (which already includes the Retraction Watch dataset: `source: retraction-watch`). Verified on the real retracted Surgisphere/Lancet record (PMID 32450107) — retraction, EoC and corrections all detected; kept as a test fixture. |
| Verification record + dedupe | `data/verification.json`: all required fields + flags, version, snapshot. Dedupe by PMID, DOI, NCT, normalised title+year, with alias index; identity conflicts are flagged. 815 migrated → 821 unique records. |
| Approval workflow | 8 states (`unverified, pending_review, verified, published, updated, under_investigation, retracted, archived`) with an enforced transition table (`ledger.py`). Rules enforced in code, not convention: failed verification can't publish; retracted can't publish; protective states can only return via `pending_review` (mandatory reassessment); human sign-off required to leave `pending_review`; discrepancies need a human. `strict_mode` (data/evidence_policy.json) holds *every* new item for human review. |
| Policy for new content | Bibliographic records (research, reviews, preprints, registry entries) auto-publish **only** after multi-source metadata verification passes (recorded as `system:auto-policy`). Guidelines, discrepancies and anything unverifiable need a human. **AI text needs the validator; practice-directing text needs a human.** Flip `strict_mode` if you want human approval for everything. |
| Existing content not overwritten | `Pipeline.guard_update`: a material change (title/abstract/DOI/design) to approved content is parked as `pending_update`, an alert is raised, the approved version stays live. Accepting needs a reviewer decision. Source outages never alter verified records. |
| Retraction handling | Immediate, automatic, protective: state → `retracted`, prominent banner, AI withheld, excluded from Trending / This Week / Article of the Week / Guideline Watch / Trials; history preserved. Sticky: a later "none" from a source cannot silently un-retract (flagged for review). Corrections → `updated` + mandatory reassessment, AI withheld until a reviewer re-approves. |
| Surveillance | Daily run re-verifies due items: recent (≤2 y) every 7 days, older every 30, bounded per run (`max_verify_per_run`), 1 batched PubMed call per 100 PMIDs. Alerts → `data/evidence_alerts.json`, a GitHub Issue (derived content listed: sections, AI cache, spotlight), and the run summary. Registry status/results-posted changes flagged. |
| AI safety | `ai_validate.py`: deterministic, independent of the LLM. Every number / trial ID / named term must be in the source (+title); CI/p/NNT internal consistency; no causal wording for observational designs unless the authors used it; no directives or "proves/definitive"; no "significant" claims against a null result; each figure traced to a source sentence. Generation only from verified, unprotected items. Prompt example numbers removed (root cause of V1). Approval is voided if the source text changes. |
| Appraisal | `appraisal.py`: **design-specific** checklists — CONSORT 2025/RoB 2 (RCT), PRISMA 2020/GRADE (SR/MA), STROBE (observational), guideline checklist. Judgement items (allocation concealment, risk of bias, certainty…) default to `not_assessed`, are never auto-judged from an abstract, and the "Appraised" badge appears only when a named reviewer completes every item. Only 2 objectively checkable items are auto-filled (registry number exists; no superseding notice). |
| Audit | `data/audit_log.jsonl`: append-only, SHA-256 hash-chained; `audit-verify` and the publication gate detect edits, deletions, reordering. Git history is the second layer. |
| Publication gate | `publish.safety_check` + `publish_if_safe`: articles.json is replaced atomically only if **no critical finding** (missing/invisible records, false badges, AI shown without validation, practice text without approval, retracted/ineligible items promoted, duplicates, missing IDs, failed-verification items, ineligible spotlight, broken audit chain). On failure the deployed file is byte-for-byte untouched and the job exits 3. |
| User transparency | Labels driven only by the server evidence block: *Source verified* (+ date, tooltip says metadata-only), *Full text reviewed*, *Clinically reviewed*, *Appraised*, *AI-assisted summary* (with validation level), *Evidence limitation*, *Corrected / Retracted publication*, banners, content-type chip (original research / guideline / expert interpretation / registry / preprint), "How ICU Scope verifies evidence" page (`/evidence`), expanded educational disclaimer. Client re-checks (defence in depth): no AI text without a validated status; no practice takeaway without approval; Classics carry no badge. |
| Editorial interface | `admin.html` + `admin.js` + `api/review.js` (§5). |
| Reliability | Per-host rate limiting, retry with exponential backoff + `Retry-After`, structured JSON logs, run metrics (`data/evidence_run.json`), atomic writes, no secrets in frontend, `NCBI_API_KEY` optional. External calls bounded; no extra AI calls (AI generation is *reduced*: only verified items). |

## 3. Database and API changes

* New data files: `data/verification.json` (ledger, schema_version 1, additive upgrades on load), `data/audit_log.jsonl`, `data/evidence_alerts.json`, `data/evidence_run.json`, `data/evidence_policy.json`, `data/decisions/` (+`applied/`, `rejected/`).
* `data/articles.json`: every article gains an `evidence` block; AI fields are removed unless allowed; spotlight gains `evidence`. All additive — existing fields untouched (study_type may be *corrected* from verified PubMed types).
* New endpoint `/api/review` (reviewer-only). No existing endpoint changed.
* `vercel.json`: + `ignoreCommand`, + rewrites hiding internal data files, + noindex headers for admin. CSP and all other headers unchanged.
* `fetch_articles.py` (additive hooks): overwrite guard in merge; gate after archive save; AI generation limited to verified items; AI cache still attached when no API key (previously a keyless local run would silently drop all AI text); safety gate + atomic write at the end; spotlight eligibility; prompt fixes.

## 4. Workflows

* `update.yml`: + NCBI key (optional), exit-3 on gate failure (no retry, no commit), **tests + audit check + gate must pass before commit**, GitHub Issue on new alerts, commits ledger/audit.
* `evidence-ci.yml` (new): all tests + gate on every PR/branch push.
* `evidence-apply.yml` (new): applies committed decisions (re-validated), commits ledger, refreshes the feed.
* `vercel.json` `ignoreCommand`: Vercel **skips building** any commit whose `articles.json` fails the gate, leaving production on the last good deployment. Tested exit codes: healthy → build; injected unapproved recommendation → skip; python missing → build (never a silent block).
* `.github/CODEOWNERS` (new) for the safety-critical paths.

## 5. Editorial administration

**Setup (one time, repo admin):**
1. Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or the existing `NEXT_PUBLIC_*`), `ICU_SCOPE_REVIEWER_EMAILS` (comma-separated confirmed Supabase accounts allowed to review), `GITHUB_REVIEW_TOKEN` (fine-grained PAT, *Contents: read/write* on this repo only). Without these the endpoint answers 503 (fail closed).
2. GitHub → Settings → Branches: protect `main` and tick **Require review from Code Owners** (CODEOWNERS is advisory without it).
3. Optional: repo secret `NCBI_API_KEY`; create label `evidence-alert`.
4. Decide on `strict_mode` in `data/evidence_policy.json`.

**Daily use.** Open `/admin` → sign in → queue shows items needing action (pending review, under investigation, updated, retracted, source-changed) with source links (PubMed/DOI), every automated check and its result, AI text with validator issues and the source sentence behind each figure. Choose an action, write a rationale (≥10 chars, mandatory), submit. Actions: `approve`, `reject`, `approve_ai`, `approve_ai_practice`, `reject_ai`, `mark_full_text_reviewed`, `mark_clinically_reviewed`, `set_fields`, `set_appraisal`, `accept_update`, `reject_update`, `restore_to_review`, `investigate`, `archive`. The decision is committed as `data/decisions/*.json` with your **verified** email (not client-supplied) and applied by `evidence-apply.yml`, which re-checks all safety rules (an approval of a failed/retracted item is rejected and audited).

**CLI equivalent:** `python scripts/evidence_cli.py review-list | decide <id> <action> --reviewer … --note … | apply-decisions | check | audit-verify | verify | surveillance`.

**When an alert Issue appears:** the item is already withheld/flagged. Read the notice at the source, then either `restore_to_review` (re-queries the source; sticky retraction re-applies if the source still says retracted) or `archive`. Restoring to *published* always goes `pending_review` → human approval.

## 6. Test results (all run before this report)

| Suite | Result |
|---|---|
| Python (offline, deterministic; `python -m unittest discover -s tests -t .`) | **103 passed** — source verification, DOI/PMID/NCT, fabricated refs, mismatches, outage handling, retries/backoff, dedupe, ledger/state machine, audit tamper/deletion, AI validation, retraction/correction/EoC, overwrite guard, publication blocking, atomic write/rollback, CLI exit codes, decisions, appraisal, **safety checks on the real committed data** |
| Node (`node --test tests/review_api.test.js`) | **10 passed** — unauthenticated, forged token, non-reviewer, unconfirmed email, identity spoofing, validation, login, throttling, fail-closed config |
| Browser (`node tests/ui_check.js`, Playwright) | **13 passed** — retraction banner, AI hidden when unvalidated, no false badge, Classics unbadged, disclaimer, no JS errors |
| Mutation checks | 4/4 deliberate regressions (retraction detection off; failed AI displayable; outage = result; failed verification can publish) are caught by tests |
| Publication gate on committed data | 0 critical, 0 warnings; audit chain intact |
| "Production build" | The site has no build step. Equivalent checks done: all JS/JSON/YAML parse, assets resolve, full page exercised in a real browser against the regenerated data. |

Real-data verification run (live APIs, 0 source errors, 788 requests): 755 verified, 62 expert-interpretation (not applicable), 3 discrepancies, 1 failed, 1 erratum archived. After the full gated regeneration: 751 published, 68 pending review (66 guidelines + 2 title discrepancies — still visible, labelled, because they were already live), 2 items withheld (1 invalid DOI, 1 erratum). AI text shown on category cards: 180 → 144.

Defects my own testing found and fixed during development (kept as regression tests): audit-log keyword collision; system actor could approve a guideline; derived-content list built after AI reset; a false "approved content changed" alert from comparing against the wrong section copy; a 753-alert flood from changing the fingerprint algorithm (cleaned with one explanatory audit entry; fingerprints now versioned).

## 7. Existing functionality

Verified in a real browser against the regenerated data: all sections render (categories, This Week, Trending, Article of the Week, Guideline Watch, KSA, Trials, Preprints, FOAMed, Bottom Line, ICU Classics), search/filters load, no JS errors, design unchanged except additive labels. Authentication code is untouched (V9 noted). The feed is unchanged except: AI text is withheld where it failed validation (V1), the erratum and the invalid-DOI item are withheld, 19 stale study-type labels are corrected.

## 8. Unresolved issues / honest limits

1. **No full-text review has been done on anything.** "Source verified" = metadata cross-check only (labelled so). Clinical fields remain `Unable to verify` except registry-derived. Structured appraisal checklists are empty until a reviewer completes them.
2. **Guidelines:** issuer (via `society` tag) and superseding notices are checked automatically; evidence-grading method, recommendation strength and official-source availability are *not* automatable and need a reviewer. 66 existing guidelines are pending review (visible, labelled).
3. **ICU Classics (10 hand-written items) have no PMID/DOI**, so they cannot be verified; they show no verification badge. A reviewer should attach identifiers.
4. **Mobile apps** (iOS/Android) do not display the new labels or retraction banners; they still receive correct (gated) data. Today there are 0 retracted items, but the apps should be updated before relying on this.
5. **Untested in the real environment:** the `/api/review` endpoint against live Supabase/GitHub (needs your secrets), Vercel's `ignoreCommand` and the `/data/*` rewrites (confirm after a preview deploy that `/data/archive.json` → 404), `evidence-apply.yml`, and the Issue-creation step. Each is unit-tested or exercised locally only.
6. **V9 (CSP blocks Supabase/PostHog)** — pre-existing, not changed. The admin login deliberately avoids the browser Supabase client for this reason (server-side password grant, no CSP change). Note this means no MFA on that path.
7. DOIs for very new articles can legitimately fail Crossref/doi.org for a short time; such an item is withheld and re-checked in 7 days.
8. The AI validator is deliberately conservative (it will withhold some correct summaries) and cannot judge clinical meaning; passing it ≠ clinically reviewed.
9. Hiding `/data/*` internals from the site does not hide them on GitHub if the repo is public.
10. Not deployed; no PR opened.
