import datetime as dt
import json
import urllib.parse

from tests.helpers import *  # noqa: F401,F403
from evidence import http
from discovery import engine as dengine, retrieval


def art(pmid, title="Vasopressin in septic shock in the ICU", day="2026-10-20", doi=None, abstract="Critically ill adults with septic shock in the intensive care unit. " * 4,
        mesh=("Shock, Septic", "Critical Care", "Adult"), journal="Crit Care Med", pubtypes=("Journal Article",), pubdate=None, epub=None, **kw):
    return {"pmid": str(pmid), "title": title, "edat": day, "doi": doi if doi is not None else f"10.1000/t.{pmid}", "abstract": abstract, "mesh": list(mesh), "journal": journal,
            "pubtypes": list(pubtypes), "pubdate": pubdate or day.replace("-", " ", 1)[:8], "epub": epub or day, **kw}


class FakeNCBI:
    """In-memory PubMed + Europe PMC. Serves real esearch pagination (count / retstart / retmax) over a date-filtered corpus."""

    def __init__(self):
        self.corpus = {}
        self.matches = lambda query, a: True          # which corpus items a given query returns
        self.calls, self.sleeps = [], []
        self.fail_plan = []                           # list of ("500"|"429"|"timeout"|"truncate", n) consumed in order for esearch
        self.hook = None
        self.down = set()
        self.epmc_ids = []
        http.TRANSPORT, http.SLEEP = self.transport, lambda s: self.sleeps.append(s)
        http._last_call.clear(); http.METRICS.update(requests=0, retries=0, errors=[], not_found=0)

    def add(self, *arts):
        for a in arts:
            self.corpus[a["pmid"]] = a

    def transport(self, url, headers, timeout):
        self.calls.append(url)
        if self.hook:
            self.hook(url)
        u = urllib.parse.urlparse(url); q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        for h in self.down:
            if h in u.netloc:
                return 503, b"", {}
        if "esearch" in u.path:
            return self._esearch(q)
        if "esummary" in u.path:
            return self._esummary(q)
        if "efetch" in u.path:
            return self._efetch(q)
        if "ebi.ac.uk" in u.netloc:
            return self._epmc(q)
        return 404, b"", {}

    def _esearch(self, q):
        if self.fail_plan:
            kind = self.fail_plan[0][0]
            if kind in ("500", "429", "timeout"):
                n = self.fail_plan[0][1] - 1
                self.fail_plan[0] = (kind, n)
                if n <= 0:
                    self.fail_plan.pop(0)
                if kind == "timeout":
                    raise TimeoutError("timed out")
                return int(kind), b"<html>error</html>", ({"Retry-After": "3"} if kind == "429" else {})
        a, b = [dt.date.fromisoformat(q[k].replace("/", "-")) for k in ("mindate", "maxdate")]
        hits = sorted((x["pmid"] for x in self.corpus.values() if a <= dt.date.fromisoformat(x["edat"]) <= b and self.matches(q["term"], x)), key=int)
        start, n = int(q.get("retstart", 0)), int(q.get("retmax", 20))
        page = hits[start:start + n]
        if self.fail_plan and self.fail_plan[0][0] == "truncate" and start > 0:
            page = []                                  # server reports `count` but stops returning ids
        return 200, json.dumps({"esearchresult": {"count": str(len(hits)), "retmax": str(len(page)), "retstart": str(start), "idlist": page}}).encode(), {}

    def _esummary(self, q):
        res = {"uids": []}
        for pmid in q["id"].split(","):
            x = self.corpus.get(pmid)
            if x and not x.get("no_summary"):
                res["uids"].append(pmid)
                res[pmid] = {"uid": pmid, "title": x["title"], "fulljournalname": x["journal"], "pubdate": x["pubdate"], "authors": [{"name": "Smith J"}], "pubtype": x["pubtypes"],
                             "articleids": [{"idtype": "doi", "value": x["doi"]}] if x["doi"] else [], "pmcrefcount": 0, "volume": "", "issue": "", "pages": ""}
        return 200, json.dumps({"result": res}).encode(), {}

    def _efetch(self, q):
        out = ['<?xml version="1.0"?><PubmedArticleSet>']
        for pmid in q["id"].split(","):
            x = self.corpus.get(pmid)
            if not x or x.get("no_detail"):
                continue
            pts = "".join(f"<PublicationType>{p}</PublicationType>" for p in x["pubtypes"])
            mesh = "".join(f"<MeshHeading><DescriptorName>{m}</DescriptorName></MeshHeading>" for m in x["mesh"])
            y, m, d = x["epub"].split("-")
            e = x["edat"].split("-")
            out.append(f'''<PubmedArticle><MedlineCitation Status="MEDLINE"><PMID>{pmid}</PMID><Article><Journal><Title>{x["journal"]}</Title><JournalIssue><PubDate><Year>{y}</Year></PubDate></JournalIssue></Journal>
<ArticleTitle>{x["title"]}</ArticleTitle><Abstract><AbstractText>{x["abstract"]}</AbstractText></Abstract><AuthorList><Author><LastName>Smith</LastName><Initials>J</Initials></Author></AuthorList>
<PublicationTypeList>{pts}</PublicationTypeList><ArticleDate><Year>{y}</Year><Month>{m}</Month><Day>{d}</Day></ArticleDate></Article><MeshHeadingList>{mesh}</MeshHeadingList></MedlineCitation>
<PubmedData><History><PubMedPubDate PubStatus="entrez"><Year>{e[0]}</Year><Month>{e[1]}</Month><Day>{e[2]}</Day></PubMedPubDate></History><ArticleIdList><ArticleId IdType="pubmed">{pmid}</ArticleId>{f'<ArticleId IdType="doi">{x["doi"]}</ArticleId>' if x["doi"] else ""}</ArticleIdList></PubmedData></PubmedArticle>''')
        out.append("</PubmedArticleSet>")
        return 200, "".join(out).encode(), {}

    def _epmc(self, q):
        ids = self.epmc_ids
        return 200, json.dumps({"hitCount": len(ids), "nextCursorMark": "*", "resultList": {"result": [{"pmid": p, "source": "MED"} for p in ids]}}).encode(), {}


def simple_builder(pmid, summary, detail):
    return {"pmid": pmid, "title": (summary or {}).get("title") or detail.get("title", ""), "journal": (summary or {}).get("fulljournalname") or detail.get("journal", ""),
            "pubdate": (summary or {}).get("pubdate") or detail.get("pubdate", ""), "authors": detail.get("authors", []),
            "doi": detail.get("doi") or None, "abstract": detail.get("abstract", ""), "study_type": "Study", "is_top_journal": False, "citation_count": 0,
            "epub_date": detail.get("epub_date"), "indexed_date": (detail.get("history") or {}).get("entrez"), "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"}


Q = [{"id": "s1:keyword", "specialty": "sepsis", "kind": "keyword", "query": "sepsis"}]


def make_engine(d, today="2026-10-31", queries=None, **cfg):
    return dengine.Engine(d, config={"use_europepmc": False, **cfg}, today=dt.date.fromisoformat(today), queries=queries if queries is not None else Q, epmc_queries=[])
