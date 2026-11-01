# ICU Scope — Literature Discovery, Retrieval & Reconciliation

Status: implemented on branch `claude/evidence-safety-system` (on top of the clinical-evidence system, see `EVIDENCE_SAFETY.md`). **Not deployed.**

All numbers below were measured against the live repository data and live PubMed / Europe PMC on 2026-11-01. Anything I could not verify is listed in §8.

---

## 1. Audit: why relevant articles were missing

I measured before changing anything. NCBI `esearch` was returning HTTP 500 for every query for several hours during the audit (a live demonstration of failure mode R4 below), so the miss-rate measurement used Europe PMC (an independent index of the same PubMed records), restricted to title/abstract wording, 120-day window, same as production.

| # | Root cause (confirmed in code and data) | Measured effect |
|---|---|---|
| R1 | **One query per category with `retmax=8`, no pagination**, and PubMed's default *relevance* sort — so each category kept the 8 "best match" results of the whole 120-day window, not the newest or all. | Of 272 ICU-wording articles in the 11 allowlisted journals (120 d), **217 (80 %) were not in the archive**. Spot-checks of missing items were clearly relevant: *"Beyond Supportive Care: Targeting the Microcirculation in Septic Shock"* (Crit Care Med), *"Limited Heterogeneity of Treatment Effect of Venovenous ECMO in Severe ARDS"* (AJRCCM), *"Impact of ultra-low tidal volume ventilation … COVID-19 ARDS"* (Crit Care). |
| R2 | **11-journal allowlist** (`JOURNAL_FILTER`) — the dedicated critical-care journals were excluded entirely (*J Crit Care, Ann Intensive Care, Resuscitation, Neurocrit Care, Shock, Crit Care Explor, Intensive Crit Care Nurs, J Intensive Care*). | **680 of 686 (99 %)** of their articles in 120 d were missing. |
| R3 | **Dependence on MeSH.** `ICU_CONTEXT` required an ICU MeSH heading *or* the literal phrase "critically ill". Recent records have no MeSH yet. | Only **65 of 10,278** ICU-wording articles (0.6 %) carried an ICU-type MeSH heading; in the last 7 days **7 of 858**. Live PubMed: `sepsis` MeSH strategy found 10 articles in 14 days vs 138 for the keyword strategy. |
| R4 | **Transient failures lost whole categories silently.** `_get()` retried only HTTP 429 (3 tries); any 5xx/timeout raised, `main()` caught it as "warning: … failed" and used `fresh = []`. | Reproduced live: an HTTP 500 aborted the very first production-identical query. |
| R5 | **Failures were invisible.** The workflow's only check was "feed non-empty and < 2 h old"; all **48 scheduled runs reported success** (GitHub Actions history), while data/`generated_at` changed daily regardless of what was retrieved. | No failed run in 48 days is not evidence of completeness. |
| R6 | **Silent deletion of adult papers.** `is_pediatric()` substring-matched `"child"`, deleting e.g. *Child-Pugh* hepatology papers from the archive on every run, unrecorded. | Reproduced; now word-boundary + population-aware and **recorded as a rejection with reason**. |
| R7 | **Date handling.** `parsed_pubdate_for_sort` returned `datetime.min` for formats PubMed emits (`2026 Oct-Dec`, seasons, day ranges); month-only dates resolved to the 1st; `datetime.now()` local time; no distinction between print / electronic / indexing date; `reldate`+`pdat` window with no overlap, so a late-indexed article could fall between two runs. | Fixed (§2.4). |
| R8 | **No stage accounting.** Nothing recorded what was discovered vs stored vs verified vs displayed, so a loss at any stage was undetectable. | Fixed (§2.3, §2.5). |
| R9 | Pre-existing: `update.yml` ran on a push to *any* branch (then reset to `main`). My earlier feature-branch push triggered it; it failed safe (no `tests/` on `main`) and committed nothing. | Branch filter added. |

Not a cause (checked): frontend filtering (the page renders whatever is in `articles.json`), duplicate detection (keyed by PMID; fine), the evidence gate (holds back unverified items by design — now made visible, §2.3).

## 2. What was implemented

### 2.1 Multi-strategy discovery (`scripts/discovery/strategies.py`)
15 specialties (general critical care, ventilation/respiratory failure, ARDS, sepsis, hemodynamics/cardiovascular, neurocritical care, RRT/AKI, critical-care infections, toxicology, trauma/surgical, ECMO, nutrition/metabolism, sedation/analgesia/delirium, hematology/coagulation, obstetric critical care), each searched **three independent ways**: MeSH (controlled vocabulary), keyword/synonyms in title/abstract (works before MeSH indexing), and high-evidence publication types (RCT, meta-analysis, SR, guideline, multicentre). Plus two cross-cutting strategies: *all* articles of 17 dedicated critical-care journals, and ICU-context articles in 19 general/adjacent journals. **47 PubMed strategies**, each with a paediatric exclusion that keeps records also tagged *Adult*.
**Europe PMC** is added as an independent second source (30 queries) — not a replacement: it exists to catch what PubMed strategies miss and to keep discovery alive during NCBI outages. Two properties of its API were established empirically and are encoded: bare phrases match *full text* (so every term is field-restricted), and OR-groups that mix `MESH:` and `TITLE_ABS:` are mis-evaluated (so groups are never mixed).
Existing journal-allowlist/`is_top_journal` badges are unchanged.

### 2.2 Complete retrieval (`retrieval.py`, `engine.py`)
* Pagination until every id the source reports (`count`) is retrieved; a shortfall raises `IncompleteRetrieval` instead of returning a partial list. Windows above the 9,999-record ceiling are split automatically.
* Retry with exponential backoff, `Retry-After`, per-host pacing (`evidence.http`) — also now used by the legacy `_get()`.
* **Persistent checkpoints** (`data/discovery_state.json`): per-strategy watermark advanced **only after a complete, count-verified retrieval**; a failed run leaves it unmoved, so the next run automatically re-covers the gap. Backfill checkpoints each (strategy, window).
* **Overlapping windows**: every run re-searches `overlap_days` (3) before the watermark.
* **Dates**: search keyed on the *Entrez/indexing date* (`edat`, immune to future print dates); publication, electronic and indexing dates are kept separate (`pubdate`, `epub_date`, `indexed_date`); all comparisons in UTC; `effective_date()` never lets a future print-issue date hide an earlier electronic date; all PubMed date formats parse.
* PubMed reports malformed/unknown search terms as *warnings with HTTP 200*; these are now captured and surface in the monitor (this immediately found two invalid MeSH headings I had used).

### 2.3 No silent loss (`ledger.py`, `relevance.py`, `sync.py`)
Every discovered article has one status — `discovered → retrieved → awaiting_verification → approved → published`, or `duplicate` / `rejected` (reason mandatory) / `retrieval_failed` / `pending_retry` — and a **complete, append-only transition history** (`data/discovery.json`). There is no code path that deletes a record. Missing fields, API failures, malformed records route to `pending_retry` (exponential retry schedule; after 6 attempts they stay visible to administrators) or to review — never to discard. Duplicates are automatic **only** for a shared DOI/identifier with a different PMID; identical titles alone never discard an article.
**Relevance** is deterministic (no AI cost): ICU MeSH, ICU terms (title weighted), dedicated-journal prior, population check. `relevant` → verification; **`uncertain` → editorial review (flag `relevance_review`, held out of the public feed until a human approves); never auto-rejected**. Rejection only for paediatric/neonatal populations (existing editorial policy) and correction/retraction notices, each recorded with its reason.
The existing clinical verification and editorial approval pipeline is unchanged and still gates publication; statuses are *derived* from it (`sync_statuses`).

### 2.4 Bounded public feed
Live volume is ~68 candidates/day before filtering, so the public feed is ranked per category (high-evidence designs first, then newest; `display_per_category`, default 120). Articles beyond the cap stay in the archive with status `published` and a recorded `display_reason` — explained, not lost. One new display category, **General Critical Care** (also holds obstetric critical care), was added (4 lookup-table entries in `app.js`); content-based inference places general papers in their subject category.

### 2.5 Reconciliation (`reconcile.py`, `discovery_cli.py reconcile`)
Compares discovered → retrieved → stored (archive) → verification record → displayed. Flags: `discovered_not_retrieved`, `retrieved_not_stored`, `stored_not_ingested`, `published_not_displayed` (unless a display reason is recorded), `rejected_but_displayed`, `retrieval_exhausted`, `stalled_awaiting` (>14 d). Recoverable ones are **re-queued automatically**; the rest go to `data/reconciliation.json`, a GitHub Issue, and the dashboard. It also reports articles found *only* by Europe PMC (strategy gaps, by specialty).

### 2.6 Backfill (`discovery_cli.py backfill --days N`, workflow `discovery-backfill.yml`)
Resumable (per strategy × window checkpoints), idempotent (re-running adds nothing), merges through the evidence overwrite-guard (approved content is never replaced), retrieves bodies *and stores them in the same command* so an interruption is recoverable by reconciliation. Default 30 days (configurable) — see §5 for sizing.

### 2.7 Monitoring (`data/discovery_status.json`, admin panel)
Last successful retrieval; discovered / retrieved / awaiting / approved / published / duplicate / rejected / pending-retry totals; rejection reasons; failed API requests (with window and error); pending-retry list; reconciliation discrepancies; per-specialty counts; per-strategy watermarks and query warnings. `health` is **degraded** on any failed request, a stale success (>36 h), unresolved discrepancies, exhausted retries or query warnings — and the daily workflow's **last step fails the run (red)** when degraded, *after* committing the good data, so a partial failure is no longer reported as a successful update. Reviewer-only view at `/admin` (`/api/review?view=discovery`).

## 3. Files
`scripts/discovery/{strategies,retrieval,dates,relevance,ledger,engine,sync,reconcile,status,archive}.py`, `scripts/discovery_cli.py`; `fetch_articles.py` (hooks: discovery replaces the capped category loop, hardened `_get`, careful paediatric test with recorded pruning, display policy, finalize/sync/reconcile/status); `evidence` (uncertain-relevance → pending review; approve clears the flag); `app.js`/`style.css` (one category); `api/review.js` + `admin.{html,js}` (monitor); workflows; `vercel.json` (new internal data files not served); tests `tests/test_discovery.py`, `tests/discovery_helpers.py`.

## 4. Tests
`python -m unittest discover -s tests -t .` runs the whole suite offline; results are in §7.

## 5. Sizing / operations
* ~68 candidates/day before relevance (live), of which ~60 % `relevant`, ~35 % `uncertain`, ~4 % rejected (live sample of 946). Archive grows ~3 KB/article/category. A 120-day backfill would add ~8,000 candidates (tens of MB) — hence the 30-day default.
* Unauthenticated NCBI access is limited to 3 requests/s and returned HTTP 429 during the backfill (handled by backoff). Set the repo secret `NCBI_API_KEY` (already wired into the workflows) for 10/s.

## 6. Operating it
* `python scripts/discovery_cli.py status` — health, problems.
* `python scripts/discovery_cli.py trace <PMID>` — complete lifecycle of one article: found by which strategies, relevance verdict, status history, archive presence, verification state, whether it is on the website.
* `python scripts/discovery_cli.py reconcile` / `retry` / `backfill --days N`.
* Tuning: `data/discovery_config.json` (any key of `DEFAULTS` in `engine.py`: `overlap_days`, `backfill_days`, `display_per_category`, `use_europepmc`, …).
* When uncertain-relevance items appear, review them in `/admin` (`approve` confirms ICU relevance; `reject` archives with a reason).

## 7. Backfill and acceptance results
All of this was run for real against PubMed, Europe PMC, Crossref, doi.org and ClinicalTrials.gov on 2026-11-01, using the repository's actual data.

**Controlled backfill, 30 days (2026-10-02 → 2026-11-01).** 47 PubMed strategies × 3 windows (141) + 30 Europe PMC queries × 3. First pass: 140/141 PubMed windows succeeded; one hit a genuine PubMed backend error (*"Search Backend failed … HTTP 502"*), which was recorded as a failed request (run marked degraded, watermark not advanced, no silent gap). Re-running the same command retried **only** that window → 0 failed requests, and the ledger stayed at exactly 2,157 records (idempotent, no duplicates). During the audit/backfill NCBI also returned HTTP 500 for every esearch for hours and HTTP 429 under load; all were handled by backoff or recorded.

| | count |
|---|---|
| Candidates discovered / retrieved | 2,157 / 2,157 |
| Classified relevant / uncertain (→ review) / rejected | 1,250 / 616 / 291 (final rejected total 302: 288 paediatric/neonatal, 14 correction notices — each with its reason) |
| Duplicates / pending retry / retrieval failed | 0 / 0 / 0 |

**After two daily pipeline runs (verification budget 600/run):** 800 published · 1,055 awaiting verification (of which 613 are held for an editor's ICU-relevance decision) · 302 rejected · 0 unaccounted. Reconciliation: **0 discrepancies**; stage counts discovered 2,157 → retrieved 2,157 → stored 1,855 (= 2,157 − 302 rejected) → verification record 1,855 → 602 distinct articles on the website; the other 198 published articles are outside the capped public feed *with a recorded reason* (explained, not lost). Website: category cards **277 → 783**, "This Week" **2 → 119**, `articles.json` 2.0 MB → 4.8 MB. Safety gate: 0 critical findings; audit chain intact. The deliberately-held items (unverified, or uncertain relevance) are not published.

**Value of the second source:** 296 articles were found *only* by Europe PMC; 214 were correctly rejected (those queries lack PubMed's population exclusion), but **53 were relevant and 29 uncertain** — real ICU articles the PubMed strategies alone had missed (e.g. *"Interpreting EVERDAC: deferring arterial cannulation in critically ill patients"*, *"Clinical outcomes … tigecycline exposure in critically ill patients"*).

**Acceptance criterion — end-to-end traceability** (`python scripts/discovery_cli.py trace <PMID>`), real articles:
* **PMID 42876263** (published): found by 6 strategies via PubMed + Europe PMC → *discovered* 07:06 → *retrieved* 07:08 → *awaiting_verification* (ICU-relevant, MeSH: AKI/critical illness/ICU) → stored in the `renal` archive → source verification passed (PubMed + Crossref) → evidence state *published* → **on the website** → status *published* 07:13. 
* **PMID 42879586** (held, correct): relevance *uncertain* → `relevance_review` flag → evidence `unverified` → **not on the website**; its status reason states it will not publish without a reviewer's approval.
* **PMID 42875270** (rejected): *Corrigendum to …* → rejected with reason, never stored as evidence.
The unit-level acceptance test (`TestEndToEndTracking`) additionally walks an *uncertain* article through editor approval → published, and asserts reconciliation reports nothing unexplained at every step.

**Tests:** 137 Python (34 new for discovery: multi-page pagination, over-ceiling window splitting, short-page detection, timeout recovery with exponential backoff, HTTP 429 + `Retry-After`, persistent failure leaves watermark unmoved and the run degraded, self-healing on the next run, interrupted backfill resumes without re-searching completed windows, missing metadata never discards, no-detail record → pending-retry → recovered, retries-exhausted stays visible, illegal/unreasoned transitions rejected, ledger save failure leaves the file intact, duplicates by DOI vs identical-title, *Child-Pugh*, paediatric/notice rejection with reasons, inclusive UTC window boundaries, late-indexed article caught by overlap, previously-missed articles recovered by backfill without touching approved text, Europe-PMC-only discovery, every reconciliation discrepancy type, display-cap explanation, stale-success degradation, end-to-end tracking) + 11 API (monitor is reviewer-only, read-only) + 13 browser checks. Mutation checks: 6/6 deliberate regressions (short page accepted; watermark never advances; failures swallowed; overlap removed; *Child-Pugh* bug reintroduced; unexplained non-display ignored) are caught — two initial tests were too weak and survived mutation, so they were strengthened.

## 8. Unresolved issues / honest limits
1. **Only 30 days were backfilled (deliberately).** At ~68 candidates/day the archive grows ~3 KB/article, so 120 days would add ~8,000 candidates. Consequently the older articles I cited in the audit (e.g. *"Targeting the Microcirculation in Septic Shock"*, Crit Care Med) are **not yet recovered**. Run `discovery_cli.py backfill --days 120` (or the *Literature backfill* workflow) when you accept the repo-size cost.
2. **Review workload is a decision for you.** 613 articles are held for an editor's ICU-relevance decision (~20/day at current volume). They are never auto-published or auto-rejected, per the requirement. If that is too many, tighten `relevance.py` thresholds or accept a policy for auto-approval — I did not decide that for you.
3. **Verification backlog:** 1,055 awaiting (budget 600/run → a few more daily runs; visible on the dashboard).
4. **Repository growth is unmanaged.** `archive.json` 8.2 MB, `verification.json` 8.9 MB, `discovery.json` 2.6 MB (`.git` 16 MB) after one month of full coverage. A retention/compaction policy is needed before months of operation; not implemented.
5. **Public feed is capped** at 120/category (198 published articles are archived outside it, with a recorded reason) to keep `articles.json` ≈ 5 MB. Raise `display_per_category` in `data/discovery_config.json` if you prefer a bigger payload.
6. **Recall is relative, not absolute.** I measured against PubMed/Europe PMC title/abstract wording; there is no clinician-labelled gold standard, and PubMed and Europe PMC are the same underlying records — literature absent from PubMed (Embase, CENTRAL, society sites) is not covered. The relevance classifier is a transparent heuristic, not clinically validated.
7. **Other sections keep their original capped queries** (Guideline Watch 10, KSA 25, Trials, Preprints, FOAMed, Bottom Line, Trending/Article of the Week allowlist ranking). They now benefit from the hardened HTTP client but were not expanded; they are curated shelves, not the "missing ICU articles" path.
8. **Not exercised live:** window splitting above the 9,999 ceiling (tested with a patched ceiling only), the workflow changes (`update.yml`, `discovery-backfill.yml`, issue creation and the `discovery-alert` label — falls back to unlabeled), the admin monitor against real GitHub/Supabase, and the Vercel rewrites hiding the new internal files.
9. **NCBI rate limits:** without `NCBI_API_KEY` (not set here) HTTP 429 occurs under load; it is handled but slows runs. Add the secret.
10. Not deployed; no PR opened.
