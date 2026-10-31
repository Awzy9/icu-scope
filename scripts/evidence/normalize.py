"""Identifier / text normalisation and de-duplication keys."""
import difflib
import hashlib
import html
import re
import unicodedata

_DOI_RE = re.compile(r"^10\.\d{4,9}/\S+$")
_NCT_RE = re.compile(r"\bNCT\d{8}\b", re.I)
_GREEK = {"β": "beta", "ß": "beta", "α": "alpha", "γ": "gamma", "δ": "delta", "μ": "mu", "κ": "kappa"}


def strip_markup(text):
    text = re.sub(r"<[^>]+>", " ", str(text or ""))
    return html.unescape(text)


def norm_doi(value):
    v = str(value or "").strip().lower()
    v = re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", v)
    v = re.sub(r"^doi:\s*", "", v)
    return v.rstrip(".,;")


def doi_syntax_ok(doi):
    return bool(_DOI_RE.match(norm_doi(doi)))


def norm_pmid(value):
    v = re.sub(r"\D", "", str(value or ""))
    return v.lstrip("0")


def nct_ids(text):
    return sorted({m.upper() for m in _NCT_RE.findall(str(text or ""))})


def norm_text(text):
    t = strip_markup(text)
    for k, v in _GREEK.items():
        t = t.replace(k, v)
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower()
    t = re.sub(r"^\s*(retracted|erratum|correction)\s*[:\-]\s*", "", t)
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def title_similarity(a, b):
    na, nb = norm_text(a), norm_text(b)
    if not na or not nb:
        return 0.0
    return difflib.SequenceMatcher(None, na, nb).ratio()


def year_of(pubdate):
    m = re.search(r"(19|20)\d{2}", str(pubdate or ""))
    return int(m.group(0)) if m else None


def content_hash(*parts):
    h = hashlib.sha256()
    for p in parts:
        h.update(norm_text(p).encode("utf-8"))
        h.update(b"\x1f")
    return h.hexdigest()[:16]


def text_hash(text):
    return hashlib.sha256(re.sub(r"\s+", " ", str(text or "")).strip().encode("utf-8")).hexdigest()[:16]


def identity_keys(article):
    """All identifiers under which one publication may be known.

    Used for de-duplication: records are matched on PMID, DOI, trial
    registration number, then normalised title+year.
    """
    keys = []
    pmid = norm_pmid(article.get("pmid"))
    if pmid:
        keys.append(f"pmid:{pmid}")
    doi = norm_doi(article.get("doi"))
    if not doi:
        u = str(article.get("url") or "")
        if "doi.org/" in u.lower():
            doi = norm_doi(u)
    if doi:
        keys.append(f"doi:{doi}")
    nct = article.get("nct_id") or ""
    for n in ([nct] if nct else []) + nct_ids(article.get("url")):
        keys.append(f"nct:{n.upper()}")
    title = norm_text(article.get("title"))
    if title and not (pmid or doi or article.get("nct_id")):
        keys.append(f"title:{title}|{year_of(article.get('pubdate')) or ''}")
    if not keys:
        u = str(article.get("url") or "").strip().lower().rstrip("/")
        if u:
            keys.append(f"url:{u}")
    return keys
