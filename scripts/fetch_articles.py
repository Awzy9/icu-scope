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
RELDATE_DAYS = int(os.environ.get("RELDATE_DAYS", "120"))
MAX_PER_CATEGORY = int(os.environ.get("MAX_PER_CATEGORY", "8"))
TRENDING_DAYS = int(os.environ.get("TRENDING_DAYS", "30"))
TRENDING_CANDIDATES = int(os.environ.get("TRENDING_CANDIDATES", "60"))
TRENDING_TOP_N = int(os.environ.get("TRENDING_TOP_N", "10"))
FOAMED_DAYS = int(os.environ.get("FOAMED_DAYS", "30"))
FOAMED_MAX_PER_SOURCE = int(os.environ.get("FOAMED_MAX_PER_SOURCE", "6"))
FOAMED_TOTAL_MAX = int(os.environ.get("FOAMED_TOTAL_MAX", "15"))

MEDRXIV_API = "https://api.biorxiv.org/details/medrxiv"
MEDRXIV_CATEGORY = "intensive care and critical care medicine"
PREPRINT_DAYS = int(os.environ.get("PREPRINT_DAYS", "14"))
PREPRINT_MAX = int(os.environ.get("PREPRINT_MAX", "10"))

CLINICALTRIALS_API = "https://clinicaltrials.gov/api/v2/studies"
CLINICALTRIALS_CONDITIONS = "critical illness OR critical care OR intensive care unit OR sepsis OR septic shock OR ARDS"
TRIALS_DAYS = int(os.environ.get("TRIALS_DAYS", "30"))
TRIALS_CANDIDATES = int(os.environ.get("TRIALS_CANDIDATES", "40"))
TRIALS_MAX = int(os.environ.get("TRIALS_MAX", "10"))

REQUEST_DELAY = 0.4  # stay under NCBI's 3 req/sec unauthenticated limit

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
AI_SUMMARY_MAX_PER_RUN = int(os.environ.get("AI_SUMMARY_MAX_PER_RUN", "40"))
AI_REQUEST_DELAY = 0.6

# Optional: powers client-side semantic search (see cloudflare-worker/ +
# README "Semantic search"). Without this secret, embeddings.json simply
# never gets written and the frontend's semantic-search button stays hidden.
HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "")
HF_EMBEDDING_MODEL = os.environ.get("HF_EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
HF_EMBEDDING_ENDPOINT = f"https://api-inference.huggingface.co/pipeline/feature-extraction/{HF_EMBEDDING_MODEL}"
EMBEDDING_MAX_PER_RUN = int(os.environ.get("EMBEDDING_MAX_PER_RUN", "60"))
EMBEDDING_REQUEST_DELAY = 0.3

ICU_CONTEXT = (
    '("critical care"[MeSH] OR "intensive care units"[MeSH] OR "critical illness"[MeSH] OR "critically ill") '
    'NOT (pediatric*[Title] OR paediatric*[Title] OR neonat*[Title] OR infant*[Title] OR child*[Title] '
    'OR adolescent*[Title] OR "infant, newborn"[MeSH] OR "pediatrics"[MeSH] OR "child"[MeSH] OR "adolescent"[MeSH])'
)

# Category feeds and trending are restricted to this journal allowlist —
# the "best" general + critical-care-specific journals — rather than a
# broad keyword search across every indexed journal.
JOURNAL_FILTER = (
    '("N Engl J Med"[Journal] OR "JAMA"[Journal] OR "Lancet"[Journal] '
    'OR "Lancet Respir Med"[Journal] OR "Intensive Care Med"[Journal] '
    'OR "Crit Care Med"[Journal] OR "Am J Respir Crit Care Med"[Journal] '
    'OR "Chest"[Journal] OR "Crit Care"[Journal])'
)

# Substring matchers for is_top_journal() below. "lancet" and "critical care"
# are handled separately (bare-name-or-"(London, England)"-suffix check)
# since a plain substring match would also catch sister journals like
# "Lancet Oncology" or "Journal of Critical Care".
TOP_JOURNAL_MATCHERS = [
    "new england journal of medicine",
    "jama",
    "lancet respiratory medicine",
    "intensive care medicine",
    "critical care medicine",
    "chest",
    "american journal of respiratory and critical care medicine",
]
TOP_JOURNAL_BARE_NAMES = ("lancet", "critical care")

PUB_TYPE_PRIORITY = [
    "Randomized Controlled Trial",
    "Meta-Analysis",
    "Systematic Review",
    "Practice Guideline",
    "Guideline",
    "Multicenter Study",
    "Clinical Trial",
    "Comparative Study",
    "Observational Study",
    "Case Reports",
    "Review",
]

GUIDELINE_DAYS = int(os.environ.get("GUIDELINE_DAYS", "180"))
GUIDELINE_MAX = int(os.environ.get("GUIDELINE_MAX", "10"))

# Rotating link-liveness check: archives never shrink, so DOI/FOAMed/preprint
# links can rot silently over time. Only a bounded number are (re-)checked
# per run, oldest-checked-first, so the whole archive gets covered gradually
# without hammering external hosts on every fetch.
LINK_CHECK_MAX_PER_RUN = int(os.environ.get("LINK_CHECK_MAX_PER_RUN", "25"))
LINK_CHECK_RECHECK_DAYS = int(os.environ.get("LINK_CHECK_RECHECK_DAYS", "30"))

# Matched against title+abstract (lowercase) to badge guidelines issued by a
# named critical-care society, in addition to whatever PubMed's own
# guideline[pt] tagging catches.
SOCIETY_GUIDELINE_MATCHERS = [
    ("surviving sepsis campaign", "Surviving Sepsis Campaign"),
    ("society of critical care medicine", "SCCM"),
    ("european society of intensive care medicine", "ESICM"),
]

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
    {
        "id": "procedures-pocus",
        "label": "Procedures & POCUS",
        "abbr": "Procedures",
        "query": f'{ICU_CONTEXT} AND ("point-of-care ultrasound" OR POCUS OR "critical care ultrasonography" OR intubation OR tracheostomy OR "central venous catheterization" OR "arterial catheterization" OR "chest tube" OR thoracostomy OR bronchoscopy)',
    },
    {
        "id": "pharmacology",
        "label": "Pharmacology",
        "abbr": "Pharm",
        "query": f'{ICU_CONTEXT} AND ("critical care pharmacotherapy"[MeSH Terms] OR "drug-related side effects and adverse reactions"[MeSH] OR "pharmacokinetics"[MeSH] AND "critical illness"[MeSH] OR sedation OR analgosedation OR "drug dosing" OR "therapeutic drug monitoring")',
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


def pmcid_for(summary):
    for aid in summary.get("articleids", []):
        if aid.get("idtype") == "pmc":
            return aid.get("value")
    return None


def is_top_journal(journal_name):
    lowered = (journal_name or "").lower().strip()
    for base in TOP_JOURNAL_BARE_NAMES:
        if lowered == base or lowered.startswith(base + " ("):
            return True
    return any(m in lowered for m in TOP_JOURNAL_MATCHERS)


def normalize_pub_type(pubtypes):
    for candidate in PUB_TYPE_PRIORITY:
        if candidate in pubtypes:
            return candidate
    return "Study"


def article_from_summary(pmid, s, abstracts):
    authors = [a["name"] for a in s.get("authors", []) if a.get("name")]
    journal = s.get("fulljournalname") or s.get("source", "")
    pmcid = pmcid_for(s)
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
        "study_type": normalize_pub_type(s.get("pubtype", [])),
        "volume": s.get("volume", ""),
        "issue": s.get("issue", ""),
        "pages": s.get("pages", ""),
        "is_open_access": bool(pmcid),
        "pmc_url": f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/" if pmcid else None,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
    }


def build_category(cat):
    query = f'{cat["query"]} AND {JOURNAL_FILTER}'
    pmids = esearch(query, RELDATE_DAYS, MAX_PER_CATEGORY)
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
    query = f'{ICU_CONTEXT} AND {JOURNAL_FILTER}'
    pmids = esearch(query, TRENDING_DAYS, TRENDING_CANDIDATES)
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


def detect_society(title, abstract):
    haystack = f"{title} {abstract}".lower()
    for needle, name in SOCIETY_GUIDELINE_MATCHERS:
        if needle in haystack:
            return name
    return None


def build_guidelines():
    query = (
        f'{ICU_CONTEXT} AND (guideline[pt] OR "practice guideline"[pt] '
        'OR "consensus development conference"[pt] '
        'OR "Surviving Sepsis Campaign"[Title/Abstract] '
        'OR "Society of Critical Care Medicine"[Title/Abstract] '
        'OR "European Society of Intensive Care Medicine"[Title/Abstract])'
    )
    pmids = esearch(query, GUIDELINE_DAYS, GUIDELINE_MAX)
    time.sleep(REQUEST_DELAY)
    summaries = esummary(pmids)
    time.sleep(REQUEST_DELAY)
    abstracts = efetch_abstracts(pmids)
    time.sleep(REQUEST_DELAY)

    articles = []
    for pmid in pmids:
        if pmid not in summaries:
            continue
        article = article_from_summary(pmid, summaries[pmid], abstracts)
        article["society"] = detect_society(article["title"], article["abstract"])
        articles.append(article)
    return articles


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
                "study_type": "FOAMed/Blog",
                "is_open_access": True,
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


def build_preprints():
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=PREPRINT_DAYS)
    url = f"{MEDRXIV_API}/{start.isoformat()}/{end.isoformat()}/0/json"
    req = urllib.request.Request(url, headers={"User-Agent": f"{TOOL} (contact: {CONTACT_EMAIL})"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    items = []
    for entry in data.get("collection", []):
        if (entry.get("category") or "").strip().lower() != MEDRXIV_CATEGORY:
            continue
        doi = (entry.get("doi") or "").strip()
        if not doi:
            continue
        items.append(
            {
                "title": re.sub(r"\s+", " ", entry.get("title", "")).strip(),
                "url": f"https://doi.org/{doi}",
                "source": "medRxiv preprint",
                "author": (entry.get("author_corresponding") or "").strip(),
                "pubdate": entry.get("date", ""),
                "summary": strip_html(entry.get("abstract", ""))[:500],
                "study_type": "Preprint (not peer-reviewed)",
                "is_open_access": True,
                "is_preprint": True,
            }
        )

    items.sort(key=lambda x: parsed_pubdate_for_sort(x.get("pubdate", "")), reverse=True)
    return items[:PREPRINT_MAX]


def build_trials():
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=TRIALS_DAYS)
    params = {
        "query.cond": CLINICALTRIALS_CONDITIONS,
        "filter.overallStatus": "RECRUITING,ACTIVE_NOT_RECRUITING,COMPLETED",
        "sort": "LastUpdatePostDate:desc",
        "pageSize": TRIALS_CANDIDATES,
        "format": "json",
    }
    qs = urllib.parse.urlencode(params)
    url = f"{CLINICALTRIALS_API}?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": f"{TOOL} (contact: {CONTACT_EMAIL})"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    items = []
    for study in data.get("studies", []):
        proto = study.get("protocolSection", {})
        ident = proto.get("identificationModule", {})
        status = proto.get("statusModule", {})
        desc = proto.get("descriptionModule", {})
        sponsor = (proto.get("sponsorCollaboratorsModule", {}) or {}).get("leadSponsor", {}) or {}

        nct_id = ident.get("nctId", "")
        title = re.sub(r"\s+", " ", ident.get("briefTitle") or ident.get("officialTitle") or "").strip()
        if not nct_id or not title or is_pediatric({"title": title}):
            continue

        last_update = ((status.get("lastUpdatePostDateStruct") or {}).get("date") or "")
        first_post = ((status.get("studyFirstPostDateStruct") or {}).get("date") or "")
        pubdate = last_update or first_post
        if pubdate:
            try:
                pd = datetime.strptime(pubdate[:10], "%Y-%m-%d").date()
                if pd < start:
                    continue
            except ValueError:
                pass

        overall_status = (status.get("overallStatus") or "").replace("_", " ").title()
        items.append(
            {
                "title": title,
                "url": f"https://clinicaltrials.gov/study/{nct_id}",
                "source": (sponsor.get("name") or "").strip() or "ClinicalTrials.gov",
                "author": "",
                "pubdate": pubdate,
                "summary": strip_html(desc.get("briefSummary", ""))[:500],
                "study_type": f"Clinical Trial ({overall_status})" if overall_status else "Clinical Trial",
                "is_open_access": True,
                "is_trial": True,
                "nct_id": nct_id,
            }
        )
        if len(items) >= TRIALS_MAX:
            break

    return items


AI_CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ai_cache.json")


def load_ai_cache():
    try:
        with open(AI_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_ai_cache(cache):
    with open(AI_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)


EMBEDDING_CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "embeddings.json")


def load_embedding_cache():
    try:
        with open(EMBEDDING_CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_embedding_cache(cache):
    # No indent: this file is fetched lazily by the frontend only when
    # semantic search is used, and can hold thousands of 384-float vectors,
    # so compactness matters more than readability here.
    with open(EMBEDDING_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))


def hf_embed(text):
    if not HF_API_TOKEN:
        return None
    body = json.dumps({"inputs": text[:2000], "options": {"wait_for_model": True}}).encode("utf-8")
    req = urllib.request.Request(
        HF_EMBEDDING_ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {HF_API_TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"  warning: HF embedding request failed: {e}")
        return None
    return _pool_embedding_response(data)


def _pool_embedding_response(data):
    """Normalize the feature-extraction response into one flat vector.

    Depending on the model's pipeline tag, the API returns either the
    already-pooled sentence vector (a flat list of floats) or per-token
    vectors (a list of lists) that need mean-pooling ourselves.
    """
    if not isinstance(data, list) or not data:
        return None
    first = data[0]
    if isinstance(first, (int, float)):
        return data
    if isinstance(first, list) and first and isinstance(first[0], (int, float)):
        dim = len(first)
        return [sum(row[i] for row in data) / len(data) for i in range(dim)]
    return None


def groq_chat_json(messages, max_tokens=300, temperature=0.3, log_label=""):
    body = json.dumps(
        {
            "model": GROQ_MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        GROQ_ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "icu-scope/1.0 (+https://github.com/Awzy9/icu-scope)",
        },
        method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(3 * (attempt + 1))
                continue
            try:
                err_body = e.read().decode("utf-8", errors="replace")[:300]
            except Exception:
                err_body = ""
            print(f"  warning: Groq API error {e.code} for '{log_label[:60]}': {err_body}")
            return None
        except Exception as e:
            print(f"  warning: Groq call failed for '{log_label[:60]}': {e}")
            return None
    return None


def ai_summarize(title, text):
    messages = [
        {
            "role": "system",
            "content": "You are a concise clinical research summarizer. Always respond with valid JSON only, no other text.",
        },
        {
            "role": "user",
            "content": (
                "You are helping ICU/critical-care clinicians triage research quickly. "
                "Given the title and text below (a study abstract or a FOAMed blog/podcast description), "
                "respond with STRICT JSON only, no markdown fences, with exactly these four keys: "
                "key_stats, summary, significance, rounds_takeaway.\n\n"
                "key_stats: a short line of the study's key reported numbers, formatted like "
                "'n=1200, RR 0.82 (95% CI 0.71-0.95), ARR 4.2%, NNT 24, p=0.01'. "
                "Only include sample size and effect measures (RR, OR, HR, ARR, RRR, NNT, mean difference, "
                "p-value, confidence interval) that are EXPLICITLY reported in the text — never estimate or "
                "infer a number. Omit any measure not stated. Use an empty string if the text has no such "
                "reportable numbers (e.g. a review, guideline, or commentary with no primary study data).\n\n"
                "summary: 2-3 plain-language sentences on what was done and found.\n\n"
                "significance: 1-2 sentences on why this matters for ICU clinical practice.\n\n"
                "rounds_takeaway: ONE short, concrete, actionable sentence a clinician could act on during "
                "bedside rounds (e.g. 'Consider X in patients with Y' or 'No change to current practice — "
                "confirms existing approach'). Not a restatement of the summary. Use an empty string if the "
                "text doesn't support a concrete practice takeaway (e.g. a purely descriptive or hypothesis-"
                "generating piece)."
                f"\n\nTitle: {title}\n\nText: {text[:3000]}"
            ),
        },
    ]
    parsed = groq_chat_json(messages, max_tokens=400, temperature=0.2, log_label=title)
    if not parsed:
        return None
    key_stats = (parsed.get("key_stats") or "").strip()
    summary = (parsed.get("summary") or "").strip()
    significance = (parsed.get("significance") or "").strip()
    rounds_takeaway = (parsed.get("rounds_takeaway") or "").strip()
    if summary or significance:
        return {
            "key_stats": key_stats,
            "summary": summary,
            "significance": significance,
            "rounds_takeaway": rounds_takeaway,
        }
    return None


def article_ai_id(article):
    return f"pmid:{article['pmid']}" if article.get("pmid") else f"url:{article['url']}"


def gather_ai_targets(categories_out, trending_articles, foamed_articles, guideline_articles=(), preprint_articles=(), trial_articles=()):
    by_id = {}

    def register(article):
        text = article.get("abstract") or article.get("summary") or ""
        if not text:
            return
        aid = article_ai_id(article)
        entry = by_id.setdefault(aid, {"title": article["title"], "text": text, "targets": []})
        entry["targets"].append(article)

    for cat in categories_out:
        for a in cat["articles"]:
            register(a)
    for a in trending_articles:
        register(a)
    for a in foamed_articles:
        register(a)
    for a in guideline_articles:
        register(a)
    for a in preprint_articles:
        register(a)
    for a in trial_articles:
        register(a)
    return by_id


def enrich_with_ai(categories_out, trending_articles, foamed_articles, guideline_articles=(), preprint_articles=(), trial_articles=()):
    if not GROQ_API_KEY:
        print("  GROQ_API_KEY not set, skipping AI summaries")
        return

    cache = load_ai_cache()
    by_id = gather_ai_targets(categories_out, trending_articles, foamed_articles, guideline_articles, preprint_articles, trial_articles)

    remaining_budget = AI_SUMMARY_MAX_PER_RUN
    new_count = 0
    cached_count = 0

    for aid, entry in by_id.items():
        result = cache.get(aid)
        if result is None:
            if remaining_budget <= 0:
                continue
            result = ai_summarize(entry["title"], entry["text"])
            remaining_budget -= 1
            time.sleep(AI_REQUEST_DELAY)
            if result:
                cache[aid] = result
                new_count += 1
        else:
            cached_count += 1

        if result:
            for target in entry["targets"]:
                target["ai_key_stats"] = result.get("key_stats", "")
                target["ai_summary"] = result["summary"]
                target["ai_significance"] = result["significance"]
                target["ai_rounds_takeaway"] = result.get("rounds_takeaway", "")

    # Keep the cache bounded to ids still relevant this run.
    pruned_cache = {aid: cache[aid] for aid in by_id if aid in cache}
    save_ai_cache(pruned_cache)
    print(f"  AI summaries: {new_count} new, {cached_count} from cache, "
          f"{len(by_id) - new_count - cached_count} skipped (budget exhausted)")


def enrich_with_embeddings(categories_out, trending_articles, foamed_articles, guideline_articles=(), preprint_articles=(), trial_articles=()):
    if not HF_API_TOKEN:
        print("  HF_API_TOKEN not set, skipping embeddings")
        return

    cache = load_embedding_cache()
    by_id = gather_ai_targets(categories_out, trending_articles, foamed_articles, guideline_articles, preprint_articles, trial_articles)

    remaining_budget = EMBEDDING_MAX_PER_RUN
    new_count = 0
    cached_count = 0

    for aid, entry in by_id.items():
        if aid in cache:
            cached_count += 1
            continue
        if remaining_budget <= 0:
            continue
        vector = hf_embed(f"{entry['title']}. {entry['text']}")
        remaining_budget -= 1
        time.sleep(EMBEDDING_REQUEST_DELAY)
        if vector:
            cache[aid] = vector
            new_count += 1

    pruned_cache = {aid: cache[aid] for aid in by_id if aid in cache}
    save_embedding_cache(pruned_cache)
    print(f"  Embeddings: {new_count} new, {cached_count} from cache, "
          f"{len(by_id) - new_count - cached_count} skipped (budget exhausted)")


SPOTLIGHT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "spotlight.json")


def load_spotlight():
    try:
        with open(SPOTLIGHT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def save_spotlight(data):
    with open(SPOTLIGHT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def current_week_anchor():
    """Return the date (YYYY-MM-DD) of the most recent Saturday, UTC.

    Using a Saturday-anchored week (rather than ISO week) means the spotlight
    refreshes on Saturdays instead of Mondays.
    """
    now = datetime.now(timezone.utc)
    days_since_saturday = (now.weekday() - 5) % 7  # Monday=0 ... Saturday=5, Sunday=6
    anchor = (now - timedelta(days=days_since_saturday)).date()
    return anchor.isoformat()


def pick_spotlight(candidates):
    listing = "\n".join(
        f"{i + 1}. [{c['pmid']}] {c['title']} — {(c.get('abstract') or '')[:400]}"
        for i, c in enumerate(candidates)
    )
    messages = [
        {
            "role": "system",
            "content": "You are an ICU attending curating a journal club. Always respond with valid JSON only, no other text.",
        },
        {
            "role": "user",
            "content": (
                "Select the single most clinically significant paper this week for an ICU journal club, "
                "from the numbered candidates below. Respond with STRICT JSON only, matching exactly this schema: "
                '{"pmid": "<the pmid of your chosen article, exactly as given in brackets>", '
                '"why_selected": "1-2 sentences on why this is the most significant pick", '
                '"discussion_prompts": ["question 1", "question 2", "question 3"]}.'
                f"\n\nCandidates:\n{listing}"
            ),
        },
    ]
    parsed = groq_chat_json(messages, max_tokens=500, temperature=0.4, log_label="spotlight selection")
    if not parsed:
        return None
    pmid = str(parsed.get("pmid", "")).strip()
    match = next((c for c in candidates if c["pmid"] == pmid), None) or candidates[0]
    prompts = [p.strip() for p in (parsed.get("discussion_prompts") or []) if p and p.strip()][:5]
    return {
        "pmid": match["pmid"],
        "title": match["title"],
        "journal": match.get("journal", ""),
        "url": match["url"],
        "pubdate": match.get("pubdate", ""),
        "why_selected": (parsed.get("why_selected") or "").strip(),
        "discussion_prompts": prompts,
    }


def build_spotlight(trending_articles):
    week = current_week_anchor()
    existing = load_spotlight()
    if existing and existing.get("week") == week:
        return existing
    if not GROQ_API_KEY or not trending_articles:
        return existing

    result = pick_spotlight(trending_articles[:8])
    if not result:
        return existing

    result["week"] = week
    result["generated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    save_spotlight(result)
    return result


RSS_PATH = os.path.join(os.path.dirname(__file__), "..", "feed.xml")
SITE_URL = "https://awzy9.github.io/icu-scope/"


def xml_escape(text):
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def build_rss_feed(categories_out, foamed_articles, preprint_articles=(), trial_articles=()):
    items = []
    for cat in categories_out:
        for a in cat["articles"]:
            items.append((a, cat["label"]))
    for a in foamed_articles:
        items.append((a, a.get("source", "FOAMed")))
    for a in preprint_articles:
        items.append((a, "Preprint"))
    for a in trial_articles:
        items.append((a, "Clinical Trial"))

    def sort_key(pair):
        return parsed_pubdate_for_sort(pair[0].get("pubdate", ""))

    items.sort(key=sort_key, reverse=True)
    items = items[:60]

    now_rfc822 = email.utils.format_datetime(datetime.now(timezone.utc))
    entries = []
    for article, label in items:
        title = xml_escape(article.get("title", ""))
        link = xml_escape(article.get("url", ""))
        desc = xml_escape((article.get("ai_summary") or article.get("abstract") or article.get("summary") or "")[:500])
        guid = xml_escape(article.get("pmid") and f"pmid:{article['pmid']}" or article.get("url", ""))
        entries.append(
            f"    <item>\n"
            f"      <title>{title}</title>\n"
            f"      <link>{link}</link>\n"
            f"      <guid isPermaLink=\"false\">{guid}</guid>\n"
            f"      <category>{xml_escape(label)}</category>\n"
            f"      <description>{desc}</description>\n"
            f"    </item>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0">\n'
        "  <channel>\n"
        "    <title>ICU Scope</title>\n"
        f"    <link>{SITE_URL}</link>\n"
        "    <description>Daily-updated ICU/critical-care literature and FOAMed, organized by organ system.</description>\n"
        f"    <lastBuildDate>{now_rfc822}</lastBuildDate>\n"
        + "\n".join(entries)
        + "\n  </channel>\n</rss>\n"
    )
    with open(RSS_PATH, "w", encoding="utf-8") as f:
        f.write(xml)


def parsed_pubdate_for_sort(pubdate_str):
    for fmt in ("%Y %b %d", "%Y %b", "%Y-%m-%d", "%Y"):
        try:
            return datetime.strptime(pubdate_str, fmt)
        except ValueError:
            continue
    return datetime.min


ARCHIVE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "archive.json")


def load_archive():
    try:
        with open(ARCHIVE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    data.setdefault("categories", {})
    data.setdefault("foamed", {})
    data.setdefault("guidelines", {})
    data.setdefault("preprints", {})
    data.setdefault("trials", {})
    return data


def save_archive(archive):
    with open(ARCHIVE_PATH, "w", encoding="utf-8") as f:
        json.dump(archive, f, indent=2, ensure_ascii=False)


LINK_CHECK_STATE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "link_check.json")


def load_link_check_state():
    try:
        with open(LINK_CHECK_STATE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_link_check_state(state):
    with open(LINK_CHECK_STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)


def url_is_reachable(url):
    def attempt(method):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": f"{TOOL} (contact: {CONTACT_EMAIL})"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status < 400

    try:
        return attempt("HEAD")
    except urllib.error.HTTPError as e:
        if e.code in (403, 405):
            # Some hosts (incl. common doi.org redirect targets) reject HEAD.
            try:
                return attempt("GET")
            except Exception:
                return False
        return False
    except Exception:
        return False


def check_links(check_targets):
    """Verify a bounded, rotating slice of (check_id, url, article) links.

    Sets article["link_broken"] only for links actually (re-)checked this
    run; articles never checked yet simply have no key, so the UI can tell
    "known broken" apart from "not verified yet".
    """
    state = load_link_check_state()
    now = datetime.now(timezone.utc)

    due = []
    for check_id, url, article in check_targets:
        last = state.get(check_id)
        if last:
            try:
                last_dt = datetime.fromisoformat(last)
            except ValueError:
                last_dt = None
            if last_dt and (now - last_dt).days < LINK_CHECK_RECHECK_DAYS:
                continue
        due.append((check_id, url, article))

    checked = 0
    for check_id, url, article in due:
        if checked >= LINK_CHECK_MAX_PER_RUN:
            break
        article["link_broken"] = not url_is_reachable(url)
        state[check_id] = now.isoformat(timespec="seconds")
        checked += 1
        time.sleep(0.3)

    save_link_check_state(state)
    print(f"  Link check: {checked} checked this run, {len(due) - checked} still due out of {len(check_targets)} total")


PEDIATRIC_TITLE_KEYWORDS = [
    "pediatric", "paediatric", "neonat", "infant", "child", "adolescent", "newborn",
]


def is_pediatric(article):
    title = (article.get("title") or "").lower()
    return any(kw in title for kw in PEDIATRIC_TITLE_KEYWORDS)


def merge_into_bucket(bucket, fresh_articles, id_fn):
    """Add/update fresh_articles into bucket (keyed dict, mutated in place).

    Existing entries are never deleted here for staleness, even if they're no
    longer part of today's fresh fetch — that's how "never remove, just add"
    is enforced. The one exception is pediatric/neonatal content, which is
    explicitly out of scope and pruned on every run (covers both new fetches
    and anything archived before this exclusion existed).
    """
    for a in fresh_articles:
        bucket[id_fn(a)] = a
    for key in [k for k, a in bucket.items() if is_pediatric(a)]:
        del bucket[key]
    return sorted(bucket.values(), key=lambda a: parsed_pubdate_for_sort(a.get("pubdate", "")), reverse=True)


def main():
    if not CONTACT_EMAIL:
        raise SystemExit("CONTACT_EMAIL env var is required (NCBI usage policy).")

    archive = load_archive()

    categories_out = []
    for cat in CATEGORIES:
        print(f"Fetching {cat['label']}...")
        try:
            fresh = build_category(cat)
        except Exception as e:
            print(f"  warning: {cat['label']} failed: {e}")
            fresh = []
        bucket = archive["categories"].setdefault(cat["id"], {})
        merged = merge_into_bucket(bucket, fresh, lambda a: a["pmid"])
        categories_out.append(
            {
                "id": cat["id"],
                "label": cat["label"],
                "abbr": cat["abbr"],
                "articles": merged,
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
        fresh_foamed = build_foamed()
    except Exception as e:
        print(f"  warning: FOAMed fetch failed: {e}")
        fresh_foamed = []
    foamed_articles = merge_into_bucket(archive["foamed"], fresh_foamed, lambda a: a["url"])

    print("Fetching guideline watch...")
    try:
        fresh_guidelines = build_guidelines()
    except Exception as e:
        print(f"  warning: guideline fetch failed: {e}")
        fresh_guidelines = []
    guideline_articles = merge_into_bucket(archive["guidelines"], fresh_guidelines, lambda a: a["pmid"])

    print("Fetching medRxiv preprints...")
    try:
        fresh_preprints = build_preprints()
    except Exception as e:
        print(f"  warning: preprint fetch failed: {e}")
        fresh_preprints = []
    preprint_articles = merge_into_bucket(archive["preprints"], fresh_preprints, lambda a: a["url"])

    print("Fetching ClinicalTrials.gov tracker...")
    try:
        fresh_trials = build_trials()
    except Exception as e:
        print(f"  warning: trials fetch failed: {e}")
        fresh_trials = []
    trial_articles = merge_into_bucket(archive["trials"], fresh_trials, lambda a: a["nct_id"])

    save_archive(archive)

    # Run before the bulk AI summarization below so it isn't starved of
    # tokens-per-minute budget on Groq's free tier.
    print("Selecting article of the week...")
    try:
        spotlight = build_spotlight(trending_articles)
    except Exception as e:
        print(f"  warning: spotlight selection failed: {e}")
        spotlight = load_spotlight()

    print("Generating AI summaries...")
    try:
        enrich_with_ai(categories_out, trending_articles, foamed_articles, guideline_articles, preprint_articles, trial_articles)
    except Exception as e:
        print(f"  warning: AI summarization failed: {e}")

    print("Generating embeddings for semantic search...")
    try:
        enrich_with_embeddings(categories_out, trending_articles, foamed_articles, guideline_articles, preprint_articles, trial_articles)
    except Exception as e:
        print(f"  warning: embedding generation failed: {e}")

    print("Checking for broken links...")
    try:
        link_targets = []
        for cat in categories_out:
            for a in cat["articles"]:
                if a.get("doi"):
                    link_targets.append((f"doi:{a['doi']}", f"https://doi.org/{a['doi']}", a))
        for a in trending_articles:
            if a.get("doi"):
                link_targets.append((f"doi:{a['doi']}", f"https://doi.org/{a['doi']}", a))
        for a in guideline_articles:
            if a.get("doi"):
                link_targets.append((f"doi:{a['doi']}", f"https://doi.org/{a['doi']}", a))
        for a in foamed_articles:
            link_targets.append((f"url:{a['url']}", a["url"], a))
        for a in preprint_articles:
            link_targets.append((f"url:{a['url']}", a["url"], a))
        for a in trial_articles:
            link_targets.append((f"url:{a['url']}", a["url"], a))
        check_links(link_targets)
    except Exception as e:
        print(f"  warning: link check failed: {e}")

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
        "guidelines": {
            "window_days": GUIDELINE_DAYS,
            "articles": guideline_articles,
        },
        "preprints": {
            "window_days": PREPRINT_DAYS,
            "articles": preprint_articles,
        },
        "trials": {
            "window_days": TRIALS_DAYS,
            "articles": trial_articles,
        },
        "spotlight": spotlight,
        "categories": categories_out,
    }

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "articles.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    try:
        build_rss_feed(categories_out, foamed_articles, preprint_articles, trial_articles)
    except Exception as e:
        print(f"  warning: RSS feed generation failed: {e}")

    total = sum(len(c["articles"]) for c in categories_out)
    print(f"Wrote {total} articles across {len(categories_out)} categories, "
          f"{len(trending_articles)} trending, {len(foamed_articles)} FOAMed posts, "
          f"{len(guideline_articles)} guidelines, {len(preprint_articles)} preprints, "
          f"and {len(trial_articles)} trials to {out_path}")


if __name__ == "__main__":
    main()
