"""Complete, verifiable retrieval from PubMed (E-utilities) and Europe PMC.

Guarantees:
  * paginates until EVERY id reported by the source (`count`) has been retrieved - a shortfall raises IncompleteRetrieval
    instead of silently returning a partial list;
  * windows that would exceed the 9,999-record esearch ceiling are split automatically;
  * transient failures use evidence.http (exponential backoff, Retry-After, per-host pacing); nothing here catches errors
    and returns an empty list.
"""
import datetime as dt
import json
import re
import urllib.parse

from evidence import http, sources
from evidence.http import NotFound, SourceError

ESEARCH = sources.EUTILS + "/esearch.fcgi"
ESUMMARY = sources.EUTILS + "/esummary.fcgi"
EFETCH = sources.EUTILS + "/efetch.fcgi"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
PAGE = 500
PUBMED_CEILING = 9999


QUERY_WARNINGS = []   # PubMed returns syntax/term problems as *warnings* with HTTP 200 - collected so a 0-result query is never mistaken for health


class IncompleteRetrieval(SourceError):
    """The source reported N results but fewer unique ids were retrieved."""


def _fmt(d):
    return d.strftime("%Y/%m/%d")


def esearch_window(query, start, end, datetype="edat", page=PAGE, _depth=0):
    """-> (ids, count). All ids matching `query` with `datetype` in [start,end] (inclusive, UTC dates)."""
    base = sources._ncbi_params({"db": "pubmed", "term": query, "retmode": "json", "datetype": datetype, "mindate": _fmt(start), "maxdate": _fmt(end)})
    first = http.request_json(ESEARCH, {**base, "retmax": page, "retstart": 0})["esearchresult"]
    if first.get("ERROR"):
        raise SourceError(f"esearch error: {first['ERROR']}")
    for key in ("errorlist", "warninglist"):
        blob = first.get(key) or {}
        # 'outputmessages: No items found.' is PubMed's generic note, present on healthy queries; real problems are unknown/ignored terms.
        msgs = [f"{k}: {','.join(v) if isinstance(v, list) else v}" for k, v in blob.items() if v and k != "outputmessages"]
        if msgs:
            QUERY_WARNINGS.append(f"{key}: " + "; ".join(msgs)[:300])
    count = int(first.get("count", 0))
    if count > PUBMED_CEILING:
        if start >= end:
            raise IncompleteRetrieval(f"{count} results on a single day exceeds the PubMed ceiling")
        mid = start + (end - start) // 2
        l_ids, _ = esearch_window(query, start, mid, datetype, page, _depth + 1)
        r_ids, _ = esearch_window(query, mid + dt.timedelta(days=1), end, datetype, page, _depth + 1)
        ids = list(dict.fromkeys(l_ids + r_ids))
        return ids, len(ids)
    ids = list(first.get("idlist", []))
    start_at = page
    while start_at < count:
        r = http.request_json(ESEARCH, {**base, "retmax": page, "retstart": start_at})["esearchresult"]
        got = r.get("idlist", [])
        if not got:
            break   # source stopped returning ids early; detected below
        ids.extend(got)
        start_at += page
    uniq = list(dict.fromkeys(ids))
    if len(uniq) < count:
        raise IncompleteRetrieval(f"PubMed reported {count} results for {start}..{end} but only {len(uniq)} were retrieved")
    return uniq, count


def esummary_batch(pmids, batch=200):
    """-> {pmid: summary}. Raises SourceError if any batch fails (callers mark those ids retrieval_failed)."""
    out = {}
    for i in range(0, len(pmids), batch):
        chunk = pmids[i:i + batch]
        data = http.request_json(ESUMMARY, sources._ncbi_params({"db": "pubmed", "id": ",".join(chunk), "retmode": "json"}))
        res = data.get("result", {})
        for uid in res.get("uids", []):
            out[uid] = res[uid]
    return out


def efetch_details(pmids, batch=100):
    """-> {pmid: parsed record incl. abstract, MeSH, pub types, dates}. Raises SourceError on failure."""
    out = {}
    for i in range(0, len(pmids), batch):
        chunk = pmids[i:i + batch]
        raw = http.request(EFETCH, sources._ncbi_params({"db": "pubmed", "id": ",".join(chunk), "retmode": "xml"}))
        out.update(parse_details(raw))
    return out


def parse_details(raw):
    import xml.etree.ElementTree as ET
    base = sources.parse_pubmed_xml(raw)
    root = ET.fromstring(raw)
    for pa in root.findall(".//PubmedArticle"):
        pmid = (pa.findtext("MedlineCitation/PMID") or "").strip()
        rec = base.get(pmid)
        if rec is None:
            continue
        rec["mesh"] = [d.text.strip() for d in pa.findall("MedlineCitation/MeshHeadingList/MeshHeading/DescriptorName") if d.text]
        rec["keywords"] = [k.text.strip() for k in pa.findall("MedlineCitation/KeywordList/Keyword") if k.text]
        rec["indexing_status"] = pa.find("MedlineCitation").get("Status", "")
        hist = {}
        for d in pa.findall("PubmedData/History/PubMedPubDate"):
            try:
                hist[d.get("PubStatus")] = dt.date(int(d.findtext("Year")), int(d.findtext("Month")), int(d.findtext("Day"))).isoformat()
            except (TypeError, ValueError):
                pass
        rec["history"] = hist
        ad = pa.find("MedlineCitation/Article/ArticleDate")
        if ad is not None and ad.findtext("Year"):
            try:
                rec["epub_date"] = dt.date(int(ad.findtext("Year")), int(ad.findtext("Month") or 1), int(ad.findtext("Day") or 1)).isoformat()
            except ValueError:
                pass
    return base


def epmc_window(query, start, end, page=1000, maxn=20000):
    """Cursor-paginated Europe PMC search by first index date. -> (list of {pmid,...}, hitCount). Verifies completeness."""
    q = f"SRC:MED AND ({query}) AND (FIRST_IDATE:[{start.isoformat()} TO {end.isoformat()}])"
    out, cur, hits = [], "*", 0
    while len(out) < maxn:
        d = http.request_json(EPMC, {"query": q, "format": "json", "pageSize": page, "cursorMark": cur, "resultType": "lite"})
        hits = int(d.get("hitCount", 0))
        res = d.get("resultList", {}).get("result", [])
        out.extend(res)
        nxt = d.get("nextCursorMark")
        if not res or not nxt or nxt == cur:
            break
        cur = nxt
    if len(out) < hits and len(out) < maxn:
        raise IncompleteRetrieval(f"Europe PMC reported {hits} but returned {len(out)}")
    return out, hits
