#!/usr/bin/env python3
"""Pull recent ICU/critical-care literature from PubMed, grouped by organ system."""

import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TOOL = "icu-scope"
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "")
RELDATE_DAYS = int(os.environ.get("RELDATE_DAYS", "60"))
MAX_PER_CATEGORY = int(os.environ.get("MAX_PER_CATEGORY", "8"))
TRENDING_DAYS = int(os.environ.get("TRENDING_DAYS", "30"))
TRENDING_CANDIDATES = int(os.environ.get("TRENDING_CANDIDATES", "60"))
TRENDING_TOP_N = int(os.environ.get("TRENDING_TOP_N", "10"))
REQUEST_DELAY = 0.4  # stay under NCBI's 3 req/sec unauthenticated limit

ICU_CONTEXT = '("critical care"[MeSH] OR "intensive care units"[MeSH] OR "critical illness"[MeSH] OR "critically ill")'

CATEGORIES = [
    {
        "id": "cardiovascular",
        "label": "Cardiovascular",
        "abbr": "CVS",
        "query": f'{ICU_CONTEXT} AND ("cardiovascular diseases"[MeSH] OR shock OR "cardiac arrest" OR arrhythmia OR vasopressor OR hemodynamic)',
    },
    {
        "id": "respiratory",
        "label": "Respiratory",
        "abbr": "Resp",
        "query": f'{ICU_CONTEXT} AND (ARDS OR "mechanical ventilation" OR "respiratory failure" OR "acute respiratory distress syndrome" OR extubation OR weaning)',
    },
    {
        "id": "neurology",
        "label": "Neurology",
        "abbr": "Neuro",
        "query": f'{ICU_CONTEXT} AND ("nervous system diseases"[MeSH] OR delirium OR "traumatic brain injury" OR stroke OR sedation OR "status epilepticus" OR "brain injury")',
    },
    {
        "id": "renal",
        "label": "Renal",
        "abbr": "Renal",
        "query": f'{ICU_CONTEXT} AND ("acute kidney injury" OR "renal replacement therapy" OR CRRT OR dialysis OR "fluid balance")',
    },
    {
        "id": "gi-nutrition",
        "label": "GI & Nutrition",
        "abbr": "GI",
        "query": f'{ICU_CONTEXT} AND ("enteral nutrition" OR "gastrointestinal hemorrhage" OR "parenteral nutrition" OR "critical illness"[MeSH] AND nutrition OR "liver failure")',
    },
    {
        "id": "endocrine-metabolic",
        "label": "Endocrine & Metabolic",
        "abbr": "Endo",
        "query": f'{ICU_CONTEXT} AND (glycemic OR hyperglycemia OR "adrenal insufficiency" OR thyroid OR "metabolic acidosis")',
    },
    {
        "id": "infectious-sepsis",
        "label": "Infectious Disease & Sepsis",
        "abbr": "ID/Sepsis",
        "query": f'{ICU_CONTEXT} AND (sepsis OR "septic shock" OR antimicrobial OR "ventilator-associated pneumonia" OR bacteremia)',
    },
    {
        "id": "hematology-coag",
        "label": "Hematology & Coagulation",
        "abbr": "Heme",
        "query": f'{ICU_CONTEXT} AND (coagulopathy OR transfusion OR "disseminated intravascular coagulation" OR anticoagulation OR thrombocytopenia)',
    },
    {
        "id": "trauma-surgical",
        "label": "Trauma & Surgical",
        "abbr": "Trauma",
        "query": f'{ICU_CONTEXT} AND (trauma OR "postoperative care" OR "surgical critical care" OR polytrauma OR "damage control")',
    },
]


def _get(url, params):
    qs = urllib.parse.urlencode(params)
    full_url = f"{url}?{qs}"
    req = urllib.request.Request(full_url, headers={"User-Agent": f"{TOOL} (contact: {CONTACT_EMAIL})"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(2 * (attempt + 1))
                continue
            raise
    raise RuntimeError(f"Failed to fetch {full_url}")


def esearch(query, reldate, retmax):
    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": retmax,
        "datetype": "pdat",
        "reldate": reldate,
        "tool": TOOL,
        "email": CONTACT_EMAIL,
    }
    data = json.loads(_get(f"{EUTILS}/esearch.fcgi", params))
    return data.get("esearchresult", {}).get("idlist", [])


def esummary(pmids):
    if not pmids:
        return {}
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "json",
        "tool": TOOL,
        "email": CONTACT_EMAIL,
    }
    data = json.loads(_get(f"{EUTILS}/esummary.fcgi", params))
    result = data.get("result", {})
    return {uid: result[uid] for uid in result.get("uids", [])}


def efetch_abstracts(pmids):
    if not pmids:
        return {}
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "rettype": "abstract",
        "tool": TOOL,
        "email": CONTACT_EMAIL,
    }
    raw = _get(f"{EUTILS}/efetch.fcgi", params)
    abstracts = {}
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return abstracts
    for article in root.findall(".//PubmedArticle"):
        pmid_el = article.find(".//PMID")
        if pmid_el is None:
            continue
        pmid = pmid_el.text
        texts = []
        for ab in article.findall(".//Abstract/AbstractText"):
            label = ab.get("Label")
            text = "".join(ab.itertext()).strip()
            if not text:
                continue
            texts.append(f"{label}: {text}" if label else text)
        if texts:
            abstracts[pmid] = " ".join(texts)
    return abstracts


def doi_for(summary):
    for aid in summary.get("articleids", []):
        if aid.get("idtype") == "doi":
            return aid.get("value")
    return None


def article_from_summary(pmid, s, abstracts):
    authors = [a["name"] for a in s.get("authors", []) if a.get("name")]
    return {
        "pmid": pmid,
        "title": re.sub(r"\s+", " ", s.get("title", "")).strip(),
        "journal": s.get("fulljournalname") or s.get("source", ""),
        "pubdate": s.get("pubdate", ""),
        "authors": authors,
        "doi": doi_for(s),
        "abstract": abstracts.get(pmid, ""),
        "citation_count": int(s.get("pmcrefcount") or 0),
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
    }


def build_category(cat):
    pmids = esearch(cat["query"], RELDATE_DAYS, MAX_PER_CATEGORY)
    time.sleep(REQUEST_DELAY)
    summaries = esummary(pmids)
    time.sleep(REQUEST_DELAY)
    abstracts = efetch_abstracts(pmids)
    time.sleep(REQUEST_DELAY)

    articles = []
    for pmid in pmids:
        s = summaries.get(pmid)
        if not s:
            continue
        articles.append(article_from_summary(pmid, s, abstracts))
    return articles


def build_trending():
    pmids = esearch(ICU_CONTEXT, TRENDING_DAYS, TRENDING_CANDIDATES)
    time.sleep(REQUEST_DELAY)
    summaries = esummary(pmids)
    time.sleep(REQUEST_DELAY)

    ranked = sorted(
        summaries.items(),
        key=lambda kv: int(kv[1].get("pmcrefcount") or 0),
        reverse=True,
    )[:TRENDING_TOP_N]
    top_pmids = [pmid for pmid, _ in ranked]

    abstracts = efetch_abstracts(top_pmids)
    time.sleep(REQUEST_DELAY)

    return [article_from_summary(pmid, s, abstracts) for pmid, s in ranked]


def main():
    if not CONTACT_EMAIL:
        raise SystemExit("CONTACT_EMAIL env var is required (NCBI usage policy).")

    categories_out = []
    for cat in CATEGORIES:
        print(f"Fetching {cat['label']}...")
        try:
            articles = build_category(cat)
        except Exception as e:
            print(f"  warning: {cat['label']} failed: {e}")
            articles = []
        categories_out.append(
            {
                "id": cat["id"],
                "label": cat["label"],
                "abbr": cat["abbr"],
                "articles": articles,
            }
        )

    print("Fetching trending this month...")
    try:
        trending_articles = build_trending()
    except Exception as e:
        print(f"  warning: trending fetch failed: {e}")
        trending_articles = []

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_days": RELDATE_DAYS,
        "trending": {
            "window_days": TRENDING_DAYS,
            "articles": trending_articles,
        },
        "categories": categories_out,
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "articles.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    total = sum(len(c["articles"]) for c in categories_out)
    print(f"Wrote {total} articles across {len(categories_out)} categories "
          f"and {len(trending_articles)} trending articles to {out_path}")


if __name__ == "__main__":
    main()
