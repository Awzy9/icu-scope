#!/usr/bin/env python3
"""Pull recent ICU/critical-care literature from PubMed, grouped by organ system."""

import email.utils
import html
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TOOL = "icu-scope"
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "")
RELDATE_DAYS = int(os.environ.get("RELDATE_DAYS", "60"))
MAX_PER_CATEGORY = int(os.environ.get("MAX_PER_CATEGORY", "8"))
TRENDING_DAYS = int(os.environ.get("TRENDING_DAYS", "30"))
TRENDING_CANDIDATES = int(os.environ.get("TRENDING_CANDIDATES", "60"))
TRENDING_TOP_N = int(os.environ.get("TRENDING_TOP_N", "10"))
FOAMED_DAYS = int(os.environ.get("FOAMED_DAYS", "30"))
FOAMED_MAX_PER_SOURCE = int(os.environ.get("FOAMED_MAX_PER_SOURCE", "6"))
FOAMED_TOTAL_MAX = int(os.environ.get("FOAMED_TOTAL_MAX", "15"))
REQUEST_DELAY = 0.4  # stay under NCBI's 3 req/sec unauthenticated limit

ICU_CONTEXT = '("critical care"[MeSH] OR "intensive care units"[MeSH] OR "critical illness"[MeSH] OR "critically ill")'

TOP_JOURNAL_MATCHERS = ["new england journal of medicine", "jama"]

FOAMED_KEYWORDS = [
    "critical care", "intensive care", "icu", "resuscitat", "sepsis", "septic",
    "shock", "ventilat", "intubat", "airway", "ards", "vasopressor", "hemodynamic",
    "cardiac arrest", "crrt", "renal replacement", "status epilepticus", "toxicology",
    "overdose", "dka", "acidosis", "coagulopathy", "transfusion", "trauma",
]

FOAMED_SOURCES = [
    {"name": "EMCrit", "feed": "https://emcrit.org/feed/", "filter_keywords": False},
    {"name": "PulmCrit", "feed": "https://emcrit.org/category/pulmcrit/feed/", "filter_keywords": False},
    {"name": "REBEL EM", "feed": "https://rebelem.com/feed/", "filter_keywords": True},
    {"name": "LITFL", "feed": "https://litfl.com/feed/", "filter_keywords": True},
]

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


def is_top_journal(journal_name):
    lowered = (journal_name or "").lower()
    return any(m in lowered for m in TOP_JOURNAL_MATCHERS)


def article_from_summary(pmid, s, abstracts):
    authors = [a["name"] for a in s.get("authors", []) if a.get("name")]
    journal = s.get("fulljournalname") or s.get("source", "")
    return {
        "pmid": pmid,
        "title": re.sub(r"\s+", " ", s.get("title", "")).strip(),
        "journal": journal,
        "pubdate": s.get("pubdate", ""),
        "authors": authors,
        "doi": doi_for(s),
        "abstract": abstracts.get(pmid, ""),
        "citation_count": int(s.get("pmcrefcount") or 0),
        "is_top_journal": is_top_journal(journal),
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


def strip_html(text):
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_feed(url):
    req = urllib.request.Request(url, headers={"User-Agent": f"{TOOL} (contact: {CONTACT_EMAIL})"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def build_foamed_source(source):
    try:
        raw = fetch_feed(source["feed"])
    except Exception as e:
        print(f"  warning: {source['name']} feed failed: {e}")
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as e:
        print(f"  warning: {source['name']} feed parse failed: {e}")
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=FOAMED_DAYS)
    ns = {"dc": "http://purl.org/dc/elements/1.1/"}
    items = []
    for item in root.findall(".//item"):
        title_el = item.find("title")
        link_el = item.find("link")
        pubdate_el = item.find("pubDate")
        if title_el is None or link_el is None or pubdate_el is None:
            continue
        try:
            pub_dt = email.utils.parsedate_to_datetime(pubdate_el.text)
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue
        if pub_dt < cutoff:
            continue

        title = (title_el.text or "").strip()
        categories = [c.text for c in item.findall("category") if c.text]
        haystack = f"{title} {' '.join(categories)}".lower()
        if source["filter_keywords"] and not any(k in haystack for k in FOAMED_KEYWORDS):
            continue

        desc_el = item.find("description")
        creator_el = item.find("dc:creator", ns)

        items.append(
            {
                "title": title,
                "url": (link_el.text or "").split("?utm_")[0].strip(),
                "source": source["name"],
                "author": (creator_el.text or "").strip() if creator_el is not None else "",
                "pubdate": pub_dt.strftime("%Y-%m-%d"),
                "summary": strip_html(desc_el.text if desc_el is not None else "")[:400],
                "_sort": pub_dt,
            }
        )
        if len(items) >= FOAMED_MAX_PER_SOURCE:
            break
    return items


def build_foamed():
    all_items = []
    for source in FOAMED_SOURCES:
        print(f"Fetching {source['name']}...")
        all_items.extend(build_foamed_source(source))
        time.sleep(REQUEST_DELAY)

    all_items.sort(key=lambda x: x["_sort"], reverse=True)
    for item in all_items:
        del item["_sort"]
    return all_items[:FOAMED_TOTAL_MAX]


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

    print("Fetching FOAMed & blogs...")
    try:
        foamed_articles = build_foamed()
    except Exception as e:
        print(f"  warning: FOAMed fetch failed: {e}")
        foamed_articles = []

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window_days": RELDATE_DAYS,
        "trending": {
            "window_days": TRENDING_DAYS,
            "articles": trending_articles,
        },
        "foamed": {
            "window_days": FOAMED_DAYS,
            "articles": foamed_articles,
        },
        "categories": categories_out,
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "articles.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    total = sum(len(c["articles"]) for c in categories_out)
    print(f"Wrote {total} articles across {len(categories_out)} categories, "
          f"{len(trending_articles)} trending, and {len(foamed_articles)} FOAMed posts to {out_path}")


if __name__ == "__main__":
    main()
