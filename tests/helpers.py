import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "scripts"))
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

from evidence import http  # noqa: E402
from evidence.ledger import Ledger  # noqa: E402
from evidence.pipeline import Pipeline  # noqa: E402


def pubmed_xml(*records):
    """records: dict(pmid,title,doi,journal,year,pubtypes,nct,comments=[(reftype,pmid)])"""
    out = ['<?xml version="1.0"?><PubmedArticleSet>']
    for r in records:
        pts = "".join(f"<PublicationType>{p}</PublicationType>" for p in r.get("pubtypes", ["Journal Article"]))
        cc = "".join(f'<CommentsCorrections RefType="{t}"><RefSource>Journal. 2026. doi: 10.9999/notice{p}</RefSource><PMID>{p}</PMID></CommentsCorrections>' for t, p in r.get("comments", []))
        db = f'<DataBankList><DataBank><DataBankName>ClinicalTrials.gov</DataBankName><AccessionNumberList><AccessionNumber>{r["nct"]}</AccessionNumber></AccessionNumberList></DataBank></DataBankList>' if r.get("nct") else ""
        out.append(f'''<PubmedArticle><MedlineCitation><PMID>{r["pmid"]}</PMID><Article><Journal><Title>{r.get("journal", "Intensive care medicine")}</Title>
<JournalIssue><PubDate><Year>{r.get("year", 2026)}</Year><Month>Oct</Month></PubDate></JournalIssue></Journal><ArticleTitle>{r["title"]}</ArticleTitle>
<Abstract><AbstractText>{r.get("abstract", "")}</AbstractText></Abstract><AuthorList><Author><LastName>{r.get("author", "Smith")}</LastName><Initials>J</Initials></Author></AuthorList>
<PublicationTypeList>{pts}</PublicationTypeList>{db}</Article><CommentsCorrectionsList>{cc}</CommentsCorrectionsList></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">{r["pmid"]}</ArticleId>{f'<ArticleId IdType="doi">{r["doi"]}</ArticleId>' if r.get("doi") else ""}</ArticleIdList></PubmedData></PubmedArticle>''')
    out.append("</PubmedArticleSet>")
    return "".join(out).encode()


def crossref_json(doi, title, year=2026, container="Intensive Care Medicine", author="Smith", updates=None):
    msg = {"DOI": doi, "title": [title], "container-title": [container], "issued": {"date-parts": [[year, 10]]}, "type": "journal-article",
           "author": [{"family": author}]}
    if updates:
        msg["updated-by"] = [{"DOI": u[1], "type": u[0], "label": u[0], "source": "publisher", "updated": {"date-time": "2026-10-01T00:00:00Z"}} for u in updates]
    return json.dumps({"message": msg}).encode()


class FakeNet:
    """Routes URLs to canned responses. Unknown URLs -> 404. `fail` makes hosts return 503."""

    def __init__(self):
        self.routes, self.calls, self.down = [], [], set()
        self.sleeps = []
        http.TRANSPORT = self._transport
        http.SLEEP = lambda s: self.sleeps.append(s)
        http._last_call.clear()
        http.METRICS.update(requests=0, retries=0, errors=[], not_found=0)

    def add(self, substr, body, status=200):
        self.routes.append((substr, status, body if isinstance(body, bytes) else json.dumps(body).encode()))

    def _transport(self, url, headers, timeout):
        self.calls.append(url)
        for host in self.down:
            if host in url:
                return 503, b"", {}
        for substr, status, body in reversed(self.routes):
            if substr in url:
                return status, body, {}
        return 404, b"", {}

    def pubmed(self, *records):
        self.add("efetch.fcgi", pubmed_xml(*records))


class TmpData:
    def __enter__(self):
        self.dir = tempfile.mkdtemp(prefix="icu-ev-")
        return self.dir

    def __exit__(self, *a):
        shutil.rmtree(self.dir, ignore_errors=True)


def make_pipeline(data_dir, **policy):
    pol = {"strict_mode": False, "max_verify_per_run": 400, "recheck_days_recent": 7, "recheck_days_old": 30, "recent_years": 2, "surveillance_budget": 250}
    pol.update(policy)
    return Pipeline(Ledger(data_dir, policy=pol))


GOOD = {"pmid": "1001", "doi": "10.1000/good.1", "title": "Early vasopressin in septic shock: a randomized trial", "journal": "Intensive care medicine",
        "pubdate": "2026 Oct", "authors": ["Smith J"], "study_type": "Randomized Controlled Trial",
        "abstract": "In this multicentre randomized trial of 1200 patients, 28-day mortality was 20.1% versus 24.3% (RR 0.83, 95% CI 0.70-0.98; p=0.03). Hypotension was more frequent. " * 2,
        "url": "https://pubmed.ncbi.nlm.nih.gov/1001/"}


def standard_net(extra=None):
    n = FakeNet()
    n.pubmed({"pmid": "1001", "doi": "10.1000/good.1", "title": GOOD["title"], "pubtypes": ["Journal Article", "Randomized Controlled Trial"]})
    n.add("api.crossref.org/works/10.1000", json.loads(crossref_json("10.1000/good.1", GOOD["title"])))
    return n
