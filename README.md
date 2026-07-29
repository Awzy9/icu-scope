# ICU Scope

A daily-updating feed of recent ICU / critical-care literature from PubMed, organized by organ system (Cardiovascular, Respiratory, Neurology, Renal, GI & Nutrition, Endocrine & Metabolic, Infectious Disease & Sepsis, Hematology & Coagulation, Trauma & Surgical).

## How it works

- `scripts/fetch_articles.py` queries the NCBI PubMed E-utilities API for each category, plus a "Trending this month" ranking (by PMC citation count) and a "FOAMed & Blogs" section (RSS from EMCrit, PulmCrit, REBEL EM, LITFL), and writes it all to `data/articles.json`.
- Category feeds and Trending are restricted to a fixed journal allowlist (`JOURNAL_FILTER` in `scripts/fetch_articles.py`) rather than a broad keyword search across every indexed journal: New England Journal of Medicine, JAMA, The Lancet, Lancet Respiratory Medicine, Intensive Care Medicine, Critical Care Medicine, American Journal of Respiratory and Critical Care Medicine, Chest, and Critical Care. Every article from these therefore gets the `is_top_journal` badge.
- Guideline Watch is **not** restricted to that allowlist — it also matches on named societies (Surviving Sepsis Campaign, SCCM, ESICM) via `SOCIETY_GUIDELINE_MATCHERS`, tagged with a `society` field, so official guidance isn't missed just because it appeared in a journal outside the allowlist.
- Categories, FOAMed posts, and guidelines **accumulate in `data/archive.json`** and are never removed — each day's fetch only adds newly-discovered items on top of everything already archived, keyed by PMID/URL. (Trending and the weekly Spotlight are rankings, not archives, so those do rotate by design.)
- The "Article of the Week" spotlight refreshes every **Saturday** (cached in `data/spotlight.json`, keyed off the most recent Saturday's date).
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

## Ask about this article (optional)

Each article card can show a "💬 Ask about this article" box that answers questions grounded *only* in that article's title/abstract (via Groq's free API, same model as the summaries). It's off by default — the site is fully static (GitHub Pages), so a live Q&A endpoint needs a small serverless proxy to keep the Groq key off the client. Nothing else on the site depends on this; skip it if you don't want it.

1. Install [wrangler](https://developers.cloudflare.com/workers/wrangler/) and log in: `npm install -g wrangler && wrangler login` (free Cloudflare account).
2. From `cloudflare-worker/`, set the secret: `wrangler secret put GROQ_API_KEY` (paste the same key from the AI summaries step above, or a separate one).
3. If your site isn't at `https://awzy9.github.io`, update `ALLOWED_ORIGIN` in `cloudflare-worker/wrangler.toml` first (this locks down CORS so other sites can't call your endpoint and burn your quota).
4. Deploy: `wrangler deploy` from `cloudflare-worker/`. It prints a URL like `https://icu-scope-ask.<your-subdomain>.workers.dev`.
5. Paste that URL into `WORKER_ENDPOINT` near the top of `app.js`, commit, and push.

The Worker only ever sees the question plus the one article's title/abstract — it has no access to your archive, PubMed, or anything else, and it refuses to answer if no abstract was passed in.

## Semantic search (optional)

A "🧠 Semantic search" button next to the search box ranks articles by *meaning* rather than exact keyword match, using free open-source embedding models — e.g. searching "kidney injury after cardiac surgery" surfaces AKI articles even if they never use that exact phrase. It reuses the same Cloudflare Worker as "Ask about this article" above, so set that up first.

1. **Backend embeddings**: sign up free at [huggingface.co](https://huggingface.co), create an access token (Settings → Access Tokens, "Read" scope is enough), then add it as a repository secret:
   - Name: `HF_API_TOKEN`
   - Value: your Hugging Face token
   Without this secret, `data/embeddings.json` simply never gets populated and the semantic search button stays hidden — nothing else changes. With it, up to `EMBEDDING_MAX_PER_RUN` (default 60) new articles get embedded per day via Hugging Face's free Inference API (model `BAAI/bge-small-en-v1.5` by default, cached forever like AI summaries).
2. **Live query embedding**: the Worker needs the same token to embed whatever a user types into the search box, so the token never has to ship to the browser. From `cloudflare-worker/`: `wrangler secret put HF_API_TOKEN` (same token as above), then `wrangler deploy` again. If you already deployed the Worker for Ask-AI, this just adds the new secret to that same Worker.
3. Nothing to change in `app.js` — it reuses `WORKER_ENDPOINT` from the Ask-AI setup above.

Similarity is computed client-side (cosine similarity against the cached article vectors), so no vector database is needed — the Worker's only job is turning the search query into a vector with the same model used for the articles.

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
