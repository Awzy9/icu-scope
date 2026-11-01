"""Authoritative-source clients: PubMed (NCBI E-utilities), Crossref, doi.org, ClinicalTrials.gov.

Each function distinguishes 'record does not exist' (returned as absent / found=False)
from 'source unavailable' (raises http.SourceError). Callers must never treat an
outage as a failed verification.
"""
import os
import re
import urllib.parse
import xml.etree.ElementTree as ET

from . import http
from .normalize import norm_doi, strip_markup, nct_ids

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
CROSSREF = "https://api.crossref.org/works/"
CTGOV = "https://clinicaltrials.gov/api/v2/studies/"
DOI_HANDLE = "https://doi.org/api/handles/"

NOTICE_REFTYPES = {
    "RetractionIn": "retraction", "RetractionOf": "retraction_notice",
    "ExpressionOfConcernIn": "expression_of_concern", "ExpressionOfConcernFor": "expression_of_concern_notice",
    "ErratumIn": "correction", "ErratumFor": "correction_notice",
    "CorrectedandRepublishedIn": "correction", "CorrectedandRepublishedFrom": "correction_notice",
    "RepublishedIn": "correction", "UpdateIn": "update", "UpdateOf": "update_of",
}
NOTICE_TITLE_RE = re.compile(r"^\s*(?:author\s+)?(erratum|corrigendum|correction|publisher correction|addendum|retraction notice|retraction|expression of concern|notice of retraction)\b\s*[:\-–]", re.I)
NOTICE_TITLE_KIND = {"retraction": "retraction_notice", "retraction notice": "retraction_notice", "notice of retraction": "retraction_notice",
                     "expression of concern": "expression_of_concern_notice"}


def notice_kind_from_title(title):
    m = NOTICE_TITLE_RE.match(title or "")
    return NOTICE_TITLE_KIND.get(m.group(1).lower(), "correction_notice") if m else None


NOTICE_PUBTYPES = {"Published Erratum": "correction_notice", "Retraction of Publication": "retraction_notice",
                   "Expression of Concern": "expression_of_concern_notice", "Retraction Notice": "retraction_notice"}


def _ncbi_params(extra):
    p = {"tool": "icu-scope", "email": http.CONTACT_EMAIL}
    if os.environ.get("NCBI_API_KEY"):
        p["api_key"] = os.environ["NCBI_API_KEY"]
    p.update(extra)
    return p


def _pubdate(art):
    ad = art.find(".//ArticleDate")
    if ad is not None and ad.findtext("Year"):
        return "-".join(x for x in (ad.findtext("Year"), ad.findtext("Month"), ad.findtext("Day")) if x)
    pd = art.find(".//JournalIssue/PubDate")
    if pd is None:
        return ""
    if pd.findtext("Year"):
        return " ".join(x for x in (pd.findtext("Year"), pd.findtext("Month"), pd.findtext("Day")) if x)
    return pd.findtext("MedlineDate") or ""


def parse_pubmed_xml(raw):
    root = ET.fromstring(raw)
    out = {}
    for pa in root.findall(".//PubmedArticle"):
        mc = pa.find("MedlineCitation")
        pmid = (mc.findtext("PMID") or "").strip()
        art = mc.find("Article")
        if not pmid or art is None:
            continue
        ids = pa.find("PubmedData/ArticleIdList")
        doi = ""
        if ids is not None:
            for i in ids.findall("ArticleId"):
                if i.get("IdType") == "doi":
                    doi = norm_doi(i.text)
                    break
        if not doi:
            for e in art.findall("ELocationID"):
                if e.get("EIdType") == "doi":
                    doi = norm_doi(e.text)
        authors = []
        for a in art.findall("AuthorList/Author"):
            if a.findtext("CollectiveName"):
                authors.append(a.findtext("CollectiveName"))
            elif a.findtext("LastName"):
                authors.append(f"{a.findtext('LastName')} {a.findtext('Initials') or ''}".strip())
        pubtypes = [(p.text or "").strip() for p in art.findall("PublicationTypeList/PublicationType")]
        notices = []
        for c in mc.findall("CommentsCorrectionsList/CommentsCorrections"):
            kind = NOTICE_REFTYPES.get(c.get("RefType"))
            if kind:
                src = c.findtext("RefSource") or ""
                m = re.search(r"doi:\s*(\S+)", src)
                notices.append({"type": kind, "pmid": (c.findtext("PMID") or "").strip(),
                                "doi": norm_doi(m.group(1)) if m else "", "ref": src[:160], "source": "pubmed"})
        nct = set()
        for db in art.findall("DataBankList/DataBank"):
            if (db.findtext("DataBankName") or "").lower().startswith("clinicaltrials"):
                nct.update(x.text.strip().upper() for x in db.findall("AccessionNumberList/AccessionNumber") if x.text)
        abstract = " ".join("".join(t.itertext()).strip() for t in art.findall("Abstract/AbstractText"))
        title = "".join(art.find("ArticleTitle").itertext()).strip() if art.find("ArticleTitle") is not None else ""
        out[pmid] = {
            "pmid": pmid, "title": title, "journal": art.findtext("Journal/Title") or "",
            "pubdate": _pubdate(art), "authors": authors, "doi": doi, "pubtypes": pubtypes,
            "notices": notices, "nct_ids": sorted(nct | set(nct_ids(abstract))), "abstract": abstract,
            "retracted_flag": "Retracted Publication" in pubtypes,
            "is_notice": next((NOTICE_PUBTYPES[p] for p in pubtypes if p in NOTICE_PUBTYPES), None) or notice_kind_from_title(title),
        }
    return out


def pubmed_fetch(pmids, batch=100):
    """-> dict pmid -> record. IDs absent from the dict were definitively not returned by PubMed.
    Raises SourceError if any batch could not be fetched (no partial 'not found' conclusions)."""
    pmids = [p for p in dict.fromkeys(str(p) for p in pmids) if p]
    found = {}
    for i in range(0, len(pmids), batch):
        chunk = pmids[i:i + batch]
        raw = http.request(f"{EUTILS}/efetch.fcgi", _ncbi_params({"db": "pubmed", "id": ",".join(chunk), "retmode": "xml"}))
        try:
            found.update(parse_pubmed_xml(raw))
        except ET.ParseError as e:
            raise http.SourceError(f"PubMed XML parse error: {e}")
    return found


def _crossref_updates(msg):
    ups = []
    for field, direction in (("update-to", "this_is_notice_for"), ("updated-by", "updated_by")):
        for u in msg.get(field) or []:
            ups.append({"type": (u.get("type") or "").lower(), "label": u.get("label") or "", "doi": norm_doi(u.get("DOI")),
                        "date": (u.get("updated") or {}).get("date-time", "")[:10], "source": f"crossref:{u.get('source') or 'publisher'}",
                        "direction": direction})
    return ups


def crossref_work(doi):
    """-> dict(found=True,...) | dict(found=False). Raises SourceError on outage."""
    doi = norm_doi(doi)
    try:
        data = http.request_json(CROSSREF + urllib.parse.quote(doi, safe="/()"), {"mailto": http.CONTACT_EMAIL} if http.CONTACT_EMAIL else None)
    except http.NotFound:
        return {"found": False}
    m = data.get("message") or {}
    issued = ((m.get("issued") or {}).get("date-parts") or [[None]])[0]
    return {
        "found": True, "doi": norm_doi(m.get("DOI") or doi),
        "title": strip_markup((m.get("title") or [""])[0]).strip(),
        "container": strip_markup((m.get("container-title") or [""])[0]).strip(),
        "year": issued[0] if issued else None, "type": m.get("type") or "",
        "first_author": ((m.get("author") or [{}])[0].get("family") or "") if m.get("author") else "",
        "updates": _crossref_updates(m),
    }


def doi_registered(doi):
    """True/False from the doi.org handle service; raises SourceError on outage."""
    try:
        d = http.request_json(DOI_HANDLE + urllib.parse.quote(norm_doi(doi), safe="/()"))
    except http.NotFound:
        return False
    return d.get("responseCode") == 1


def ctgov_study(nct):
    nct = nct.upper()
    try:
        d = http.request_json(CTGOV + nct)
    except http.NotFound:
        return {"found": False, "nct_id": nct}
    p = d.get("protocolSection") or {}
    ident, status, design = p.get("identificationModule") or {}, p.get("statusModule") or {}, p.get("designModule") or {}
    arms = p.get("armsInterventionsModule") or {}
    return {
        "found": True, "nct_id": ident.get("nctId") or nct,
        "title": ident.get("briefTitle") or "", "official_title": ident.get("officialTitle") or "",
        "status": status.get("overallStatus") or "", "why_stopped": status.get("whyStopped") or "",
        "last_update": (status.get("lastUpdatePostDateStruct") or {}).get("date", ""),
        "has_results": bool(d.get("hasResults")),
        "study_type": design.get("studyType") or "", "allocation": (design.get("designInfo") or {}).get("allocation", ""),
        "masking": ((design.get("designInfo") or {}).get("maskingInfo") or {}).get("masking", ""),
        "enrollment": (design.get("enrollmentInfo") or {}).get("count"),
        "enrollment_type": (design.get("enrollmentInfo") or {}).get("type", ""),
        "interventions": [i.get("name", "") for i in arms.get("interventions") or []],
        "arm_labels": [a.get("label", "") for a in arms.get("armGroups") or []],
        "primary_outcomes": [o.get("measure", "") for o in (p.get("outcomesModule") or {}).get("primaryOutcomes") or []],
    }
