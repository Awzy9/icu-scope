"""Multi-source metadata verification.

IMPORTANT: this verifies bibliographic METADATA against PubMed / Crossref /
doi.org / ClinicalTrials.gov. It is never full-text verification;
`full_text_review` is always "not_performed" unless a human reviewer records it.
"""
import datetime as dt
import re

from . import http, sources
from .normalize import (doi_syntax_ok, nct_ids, norm_doi, norm_pmid, norm_text, title_similarity, year_of)

PASS, WARN, FAIL, SKIP = "pass", "warn", "fail", "skipped"
SOURCE_NOTICE_TYPES = {"retraction", "expression_of_concern", "correction", "update", "withdrawal", "removal"}


def _chk(name, result, detail="", critical=False):
    return {"name": name, "result": result, "detail": detail, "critical": bool(critical and result == FAIL)}


def retraction_status(pubmed, crossref):
    """-> (status, notices). status: none|corrected|updated|expression_of_concern|retracted."""
    notices = list((pubmed or {}).get("notices") or [])
    for u in (crossref or {}).get("updates") or []:
        if u["direction"] == "updated_by" or u["type"] in ("retraction", "withdrawal"):
            notices.append({"type": u["type"].replace("-", "_"), "doi": u["doi"], "date": u["date"], "source": u["source"]})
    types = {n["type"] for n in notices}
    title = ((pubmed or {}).get("title") or (crossref or {}).get("title") or "")
    retracted = ((pubmed or {}).get("retracted_flag") or {"retraction", "withdrawal", "removal"} & types
                 or re.match(r"\s*(retracted|withdrawn)\s*[:\-]", title, re.I))
    if retracted:
        status = "retracted"
    elif "expression_of_concern" in types:
        status = "expression_of_concern"
    elif types & {"correction", "erratum"}:
        status = "corrected"
    elif "update" in types:
        status = "updated"
    else:
        status = "none"
    seen, uniq = set(), []
    for n in notices:
        k = (n["type"], n.get("pmid", ""), n.get("doi", ""))
        if k not in seen:
            seen.add(k)
            uniq.append(n)
    return status, uniq


def verify_publication(article, pubmed=None, crossref=None, doi_exists=None, ctgov=None, today=None):
    """Pure comparison logic over already-fetched source data.

    pubmed:   record dict, or None meaning PubMed answered 'no such PMID'
    crossref: dict(found=...) | None meaning not queried
    doi_exists: True/False/None(not checked)
    ctgov:    {nct: study_dict}
    Returns {status, checks, discrepancies, retraction_status, notices, sources}.
    """
    today = today or dt.date.today()
    checks = []
    pmid, doi = norm_pmid(article.get("pmid")), norm_doi(article.get("doi"))
    queried = {"pubmed": bool(pmid), "crossref": crossref is not None, "ctgov": bool(ctgov)}

    if pmid:
        if pubmed is None:
            checks.append(_chk("pmid_exists", FAIL, f"PMID {pmid} not found in PubMed", critical=True))
        else:
            checks.append(_chk("pmid_exists", PASS, f"PMID {pmid} found in PubMed"))
    if doi:
        if not doi_syntax_ok(doi):
            checks.append(_chk("doi_syntax", FAIL, f"'{doi}' is not valid DOI syntax", critical=True))
        elif crossref is not None and crossref.get("found"):
            checks.append(_chk("doi_registered", PASS, "DOI registered (Crossref)"))
        elif doi_exists is True:
            checks.append(_chk("doi_registered", PASS, "DOI registered (doi.org handle; Crossref has no record, e.g. DataCite/other agency)"))
        elif crossref is not None and doi_exists is False:
            checks.append(_chk("doi_registered", FAIL, "DOI does not resolve (not in Crossref or doi.org)", critical=True))
        else:
            checks.append(_chk("doi_registered", SKIP, "DOI existence could not be checked"))

    feed_notice = sources.notice_kind_from_title(article.get("title"))
    if feed_notice and not (pubmed and pubmed.get("is_notice")):
        checks.append(_chk("is_primary_publication", FAIL, f"Title identifies this record as a {feed_notice.replace('_', ' ')}, not a primary publication"))
    if pubmed:
        pdoi = norm_doi(pubmed.get("doi"))
        if doi and pdoi:
            if doi == pdoi:
                checks.append(_chk("doi_matches_pmid", PASS, "Feed DOI equals DOI recorded by PubMed for this PMID"))
            else:
                checks.append(_chk("doi_matches_pmid", FAIL, f"Feed DOI {doi} != PubMed DOI {pdoi} for PMID {pmid}", critical=True))
        elif doi and not pdoi:
            checks.append(_chk("doi_matches_pmid", WARN, "PubMed records no DOI for this PMID; match unverifiable"))
        sim = title_similarity(article.get("title"), pubmed.get("title"))
        checks.append(_chk("title_vs_pubmed", PASS if sim >= 0.9 else WARN if sim >= 0.7 else FAIL,
                           f"title similarity {sim:.2f}", critical=False))
        yf, yp = year_of(article.get("pubdate")), year_of(pubmed.get("pubdate"))
        if yf and yp:
            checks.append(_chk("pubdate_vs_pubmed", PASS if abs(yf - yp) <= 1 else FAIL, f"feed {yf} vs PubMed {yp}"))
        if article.get("study_type") == "Randomized Controlled Trial":
            ok = "Randomized Controlled Trial" in pubmed.get("pubtypes", [])
            checks.append(_chk("study_type_vs_pubmed", PASS if ok else WARN,
                               "PubMed publication types: " + ", ".join(pubmed.get("pubtypes", [])[:6])))
        if pubmed.get("is_notice"):
            checks.append(_chk("is_primary_publication", FAIL, f"This record is a {pubmed['is_notice'].replace('_', ' ')}, not a primary publication", critical=False))

    if crossref and crossref.get("found"):
        ref_title = pubmed.get("title") if pubmed else article.get("title")
        sim = title_similarity(ref_title, crossref.get("title"))
        checks.append(_chk("title_vs_crossref", PASS if sim >= 0.9 else WARN if sim >= 0.7 else FAIL, f"title similarity {sim:.2f}"))
        ref_year = year_of(pubmed.get("pubdate")) if pubmed else year_of(article.get("pubdate"))
        if ref_year and crossref.get("year"):
            checks.append(_chk("year_vs_crossref", PASS if abs(ref_year - crossref["year"]) <= 1 else FAIL, f"{ref_year} vs Crossref {crossref['year']}"))
        if pubmed and pubmed.get("authors") and crossref.get("first_author"):
            fa = norm_text(pubmed["authors"][0].split()[0])
            checks.append(_chk("first_author", PASS if fa == norm_text(crossref["first_author"]) else WARN,
                               f"PubMed '{pubmed['authors'][0]}' vs Crossref '{crossref['first_author']}'"))

    trial_ids = sorted(set(([article["nct_id"]] if article.get("nct_id") else []) + (pubmed or {}).get("nct_ids", [])))
    for nct in trial_ids:
        st = (ctgov or {}).get(nct)
        if st is None:
            checks.append(_chk(f"registry_{nct}", SKIP, "ClinicalTrials.gov not queried"))
        elif not st.get("found"):
            checks.append(_chk(f"registry_{nct}", FAIL, f"{nct} does not exist in ClinicalTrials.gov", critical=True))
        elif article.get("nct_id") == nct:
            sim = max(title_similarity(article.get("title"), st.get("title")), title_similarity(article.get("title"), st.get("official_title")))
            checks.append(_chk(f"registry_{nct}", PASS if sim >= 0.8 else FAIL, f"{nct} exists; title similarity {sim:.2f}", critical=True))
        else:
            checks.append(_chk(f"registry_{nct}", PASS, f"{nct} exists in ClinicalTrials.gov"))

    status_r, notices = retraction_status(pubmed, crossref)
    fails = [c for c in checks if c["result"] == FAIL]
    crit = [c for c in fails if c["critical"]]
    evidence_checks = [c for c in checks if c["result"] in (PASS, FAIL, WARN)]
    if crit:
        status = "failed"
    elif fails or any(c["result"] == WARN and c["name"] in ("doi_matches_pmid",) for c in checks):
        status = "discrepancy"
    elif any(c["result"] == PASS for c in checks):
        status = "verified"
    else:
        status = "unavailable" if any(c["result"] == SKIP for c in checks) else "not_checked"
    return {"status": status, "level": "metadata", "checks": checks, "discrepancies": [c["detail"] for c in fails + [c for c in checks if c["result"] == WARN]],
            "retraction_status": status_r, "notices": notices, "sources": queried, "registry": {k: v for k, v in (ctgov or {}).items() if v.get("found")}}


def gather_and_verify(article, prefetched_pubmed=None):
    """Fetch from the authoritative sources, then compare. A source outage yields
    status 'unavailable' (never 'failed') so previously verified content is never harmed."""
    pmid, doi = norm_pmid(article.get("pmid")), norm_doi(article.get("doi"))
    try:
        pubmed = None
        if pmid:
            pm = prefetched_pubmed if prefetched_pubmed is not None else sources.pubmed_fetch([pmid])
            pubmed = pm.get(pmid)
        crossref = doi_exists = None
        if doi and doi_syntax_ok(doi):
            crossref = sources.crossref_work(doi)
            if not crossref.get("found"):
                doi_exists = sources.doi_registered(doi)
        ncts = set(([article["nct_id"]] if article.get("nct_id") else []) + (pubmed or {}).get("nct_ids", []))
        ctgov = {n: sources.ctgov_study(n) for n in sorted(ncts)}
    except http.SourceError as e:
        return {"status": "unavailable", "level": "metadata", "checks": [], "discrepancies": [], "error": str(e)[:200],
                "retraction_status": None, "notices": [], "sources": {}}
    res = verify_publication(article, pubmed, crossref, doi_exists, ctgov)
    res["pubmed"] = pubmed
    return res
