# ICU Scope

A daily-updating feed of recent ICU / critical-care literature from PubMed, organized by organ system (Cardiovascular, Respiratory, Neurology, Renal, GI & Nutrition, Endocrine & Metabolic, Infectious Disease & Sepsis, Hematology & Coagulation, Trauma & Surgical).

## How it works

- `scripts/fetch_articles.py` queries the NCBI PubMed E-utilities API for each category, plus a "Trending this month" ranking (by PMC citation count) and a "FOAMed & Blogs" section (RSS from EMCrit, PulmCrit, REBEL EM, LITFL), and writes it all to `data/articles.json`.
- Articles from NEJM/JAMA are tagged `is_top_journal` and shown with a badge in the normal category feeds.
- If `GROQ_API_KEY` is set, each article/post also gets an AI-generated plain-language summary and a "why it matters" clinical significance note (via Groq's free API, running the open-source Llama 3.3 70B model). Results are cached in `data/ai_cache.json` so each article is only summarized once, ever — not re-summarized every day it stays in the window.
- `.github/workflows/update.yml` runs that script daily via GitHub Actions and commits the result if it changed.
- `index.html` / `app.js` / `style.css` render `data/articles.json` as a static site, served via GitHub Pages.

## One-time setup

1. **Repository variable**: Settings → Secrets and variables → Actions → Variables → New repository variable
   - Name: `CONTACT_EMAIL`
   - Value: an email address (required by NCBI's usage policy for API calls)
2. **Workflow permissions**: Settings → Actions → General → Workflow permissions → select "Read and write permissions" (so the daily job can push updates).
3. **GitHub Pages**: Settings → Pages → Source → "Deploy from a branch" → Branch: `main`, folder: `/ (root)`.
4. **(Optional) AI summaries**: sign up free at [console.groq.com](https://console.groq.com), create an API key, then add it as Settings → Secrets and variables → Actions → Secrets → New repository secret:
   - Name: `GROQ_API_KEY`
   - Value: your Groq API key
   Without this secret, the site works exactly as before — just without the AI summary/significance block. With it, up to `AI_SUMMARY_MAX_PER_RUN` (default 40) new articles get summarized per day, so a full backlog fills in over a few days rather than all at once.
5. Optionally trigger the first fetch manually: Actions tab → "Update ICU literature feed" → Run workflow.

## Local development

Requires Python 3.10+:

```bash
CONTACT_EMAIL=you@example.com python scripts/fetch_articles.py
```

Then open `index.html` in a browser (or serve the folder with any static file server).

## Adjusting the feed

- Change `RELDATE_DAYS` / `MAX_PER_CATEGORY` env vars in `.github/workflows/update.yml` to widen/narrow the window or article count.
- Edit the `CATEGORIES` list in `scripts/fetch_articles.py` to change search terms or add/remove systems.
- Change the cron schedule in `.github/workflows/update.yml` (currently daily at 06:00 AST / 03:00 UTC) — e.g. `"0 6 * * 1"` for weekly on Mondays.
