# ICU Scope

A daily-updating feed of recent ICU / critical-care literature from PubMed, organized by organ system (Cardiovascular, Respiratory, Neurology, Renal, GI & Nutrition, Endocrine & Metabolic, Infectious Disease & Sepsis, Hematology & Coagulation, Trauma & Surgical).

## How it works

- `scripts/fetch_articles.py` queries the NCBI PubMed E-utilities API for each category and writes `data/articles.json`.
- `.github/workflows/update.yml` runs that script daily via GitHub Actions and commits the result if it changed.
- `index.html` / `app.js` / `style.css` render `data/articles.json` as a static site, served via GitHub Pages.

## One-time setup

1. **Repository variable**: Settings → Secrets and variables → Actions → Variables → New repository variable
   - Name: `CONTACT_EMAIL`
   - Value: an email address (required by NCBI's usage policy for API calls)
2. **Workflow permissions**: Settings → Actions → General → Workflow permissions → select "Read and write permissions" (so the daily job can push updates).
3. **GitHub Pages**: Settings → Pages → Source → "Deploy from a branch" → Branch: `main`, folder: `/ (root)`.
4. Optionally trigger the first fetch manually: Actions tab → "Update ICU literature feed" → Run workflow.

## Local development

Requires Python 3.10+:

```bash
CONTACT_EMAIL=you@example.com python scripts/fetch_articles.py
```

Then open `index.html` in a browser (or serve the folder with any static file server).

## Adjusting the feed

- Change `RELDATE_DAYS` / `MAX_PER_CATEGORY` env vars in `.github/workflows/update.yml` to widen/narrow the window or article count.
- Edit the `CATEGORIES` list in `scripts/fetch_articles.py` to change search terms or add/remove systems.
- Change the cron schedule in `.github/workflows/update.yml` (currently daily at 05:17 UTC) — e.g. `"0 6 * * 1"` for weekly on Mondays.
