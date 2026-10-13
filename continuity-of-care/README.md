# Continuity of Care — ICU handover prototype

A mobile-first website that lets the outgoing ICU senior record patients, active problems, tasks and
plans so the incoming senior can review them before arriving.

> **PROTOTYPE — not a hospital-approved system.** Synthetic demonstration patients only. No login.
> Data is kept in **this browser's localStorage only**. Do not enter real patient information.

It lives in its own folder inside the existing *ICU Scope* repository and does not modify any ICU Scope file.

## Run it

No build step and no runtime dependencies (plain ES modules).

```bash
cd continuity-of-care
npm start            # -> http://localhost:4173/
# or: node serve.mjs 8080
```

Opening `index.html` straight from disk will not work (browsers block ES modules on `file://`); use the server above
or any static host. On the existing Vercel/GitHub Pages deployment of this repo it is served at `/continuity-of-care/`.

### Checks

```bash
npm run lint        # syntax check of every module
npm test            # unit tests (node:test): bed maps, VTE rules, issues, repository
npm run test:e2e    # Playwright browser tests: workflows + responsive layout + console errors
```
`test:e2e` needs Playwright and Chromium (found via the global npm install, or set `PLAYWRIGHT_DIR` / `CHROMIUM_PATH`).

## Where things are

| Path | Purpose |
|---|---|
| `js/config.js` | **Central unit / bed / team configuration** (edit here) and the form vocabularies |
| `js/logic.js` | Pure logic: completeness checks, VTE documentation rules, bed validation, issue resolve/reopen |
| `js/repository.js` | **Data-access layer** (async API + `LocalStorageAdapter`) |
| `js/seed.js` | Synthetic demonstration data |
| `js/views/*` | Dashboard, Units & Beds, Patients, Handover History, patient handover form |
| `css/app.css` | Styling |

### Units and beds (`js/config.js`)
- **MICU** 21 beds — Team A: 1–5, 17–21 · Team B: 6–16
- **TCO** 8 beds — Team A: 1–4 · Team B: 5–8
- Neuro ICU 8 · Respiratory ICU 14 · General ICU 14 · PRU 15 · Surgical ICU 9 · KASH ICU 22 — `teams: null`
  (no team rules were specified, so none are imposed).

## What it does
- Opens straight to the dashboard (no login). Unit selector + team filter (only where teams are configured).
- Dashboard: beds occupied/available, urgent review, active issues, pending investigations, outstanding tasks,
  incomplete handovers, "needs attention" list, searchable/filterable bed list, prominent **Add Patient / Handover**.
- Units & Beds: all eight units, team allocation and a bed map; available beds → add patient, occupied → handover.
- Patient handover form: identification, clinical status, **Active Issues** (unlimited independent cards; resolve →
  collapsible Resolved Issues with timestamp; reopen), plan & tasks (completion time recorded), **VTE / DVT
  prophylaxis**, summary, and Save / Mark Ready / Review / Mark Reviewed.
- Bed uniqueness per unit; transfer pending; mark transferred / discharged (record kept, bed freed).
- Handover History: a read-only snapshot for every save / ready / review / transfer / discharge.
- Saved issues are never deleted, only resolved; only an issue added in the current unsaved edit can be removed.

### VTE / DVT rules (documentation only)
The app never recommends prophylaxis or decides contraindications. It only reports what the team documented:
*Not Assessed* is flagged and stays outstanding; *No / Withheld* needs a reason (or "reason unknown", which is flagged for
clinician review rather than invented), "Other" needs details, and a reassessment plan/time is required; *Yes* needs a
method and, for pharmacological, agent + dose + frequency. Any gap shows an incomplete-documentation warning and is
listed in the summary. Marking Ready or Reviewed with gaps requires explicit confirmation, is recorded
("Ready — gaps", "reviewed with outstanding documentation"), and never silently counts as complete. Editing a handover
after it was marked ready/reviewed returns it to Draft.

## How data is stored (prototype)
All data is in `localStorage` under `coc.prototype.v1` (selected unit/team under `coc.ui.v1`), through
`js/repository.js`. It survives refresh in that browser/profile only; it is **not** shared between devices or users,
**not** encrypted, **not** backed up and has **no audit log**. Clearing site data erases it. The menu (⋯) has
**Reset demonstration data**. The app shares an origin with ICU Scope in the same deployment, hence the key prefixes.
To use a real database, implement the adapter interface (`load/save/clear`) or replace `Repository` with API calls;
the views only use the repository.

## Authentication & accounts — DISABLED
There is **no** login, signup, password, OTP or email verification, and no account of any kind is active. The "reviewer"
on a reviewed handover is the fixed label *Demo reviewer (unauthenticated)* — not a person. Hiding a page or button is not
security; nothing in this front-end enforces access.

### Planned authorization policy (NOT implemented — design notes)
1. Only the site owner can create or approve users. Self-registration never grants access.
2. Every account is verified (e.g. email) **and** explicitly approved by the owner; new accounts stay `pending`.
3. Roles (owner, unit senior, team member, read-only) and permissions scoped to unit (and team where defined).
4. Enforce **server-side** on every request (API/database row-level rules), never only in the UI.
5. Audit-log every read and write of patient data, with who/when/what.

The architecture leaves room: all data access goes through `repo` (an async boundary where an API call + auth token
would sit), routes are centralized in `js/main.js`, and the config is data-driven per unit.

## Production readiness (what is missing)
Real use would need hospital approval and governance, authenticated users with unit-based access, server-side
authorization, audit logging, encrypted secure storage, backups/retention, privacy review, and clinical safety
validation of the content and workflow.

## Known limitations
- localStorage only; single browser; no sync, no concurrency control, no backups.
- No authentication, roles, or audit trail; "Reviewed" is a demonstration label.
- Unsaved edits are kept only in memory (a leave-page warning appears; browser Back is not guarded).
- Handover history stores whole snapshots (can grow in localStorage); no pruning.
- English / left-to-right only; no print view or export.
- The site's existing ICU Scope service worker (root scope) may serve cached copies of this app for one load after a deploy.
