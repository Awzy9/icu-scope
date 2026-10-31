"""Orchestration: ingest -> verify -> settle states -> AI validation -> stamp public evidence block.

Single code path used by every module (categories, trending, guidelines, KSA, trials,
preprints, FOAMed, Bottom Line, spotlight, classics). No per-page verification logic exists.
"""
import re
from collections import Counter

from . import ai_validate, appraisal, http, publish, sources, verify
from .ledger import Ledger, LedgerError, NOT_REPORTED, UNABLE, PROTECTIVE, now_iso
from .normalize import content_hash, doi_syntax_ok, norm_doi, norm_pmid

import datetime as dt

AUTO_CLASSES = {"original_research", "evidence_synthesis", "review", "registry_record", "preprint", "expert_interpretation"}
NO_EXTERNAL_VERIFICATION = {"expert_interpretation"}
SYSTEM = "system:auto-policy"


def material_hash(article):
    return content_hash(article.get("title"), article.get("abstract") or article.get("summary"), article.get("doi"), article.get("study_type"))


def verification_view(article):
    """Article as seen by the verifier (preprint DOIs live in the URL)."""
    a = dict(article)
    if not a.get("doi") and "doi.org/" in str(a.get("url", "")).lower():
        a["doi"] = norm_doi(a["url"])
    return a


class Pipeline:
    def __init__(self, ledger=None, today=None):
        self.ledger = ledger or Ledger()
        self.policy = self.ledger.policy
        self.today = today or dt.date.today()
        self.alerts, self.stats = [], Counter()
        self.articles = {}     # content_id -> first article instance seen
        self.placements = {}   # content_id -> [section names]

    # ------------------------------------------------------------------ ingest
    def ingest(self, sections, legacy=False):
        for section, articles in sections.items():
            for a in articles:
                cls = publish.classify(a, section.split("/")[0])
                rec, created = self.ledger.get_or_create(a, cls)
                if created:
                    self.stats["records_created"] += 1
                    if legacy:   # existing published item: stays visible, labelled 'not yet verified', until verified
                        rec["legacy"] = True
                if rec["state"] not in ("published", "updated", "verified", "retracted", "under_investigation"):
                    rec["title"], rec["publication_date"] = a.get("title", rec["title"]), a.get("pubdate", rec["publication_date"])
                    rec["authors"] = a.get("authors") or rec["authors"]
                    rec["journal"] = a.get("journal") or rec["journal"]
                appraisal.ensure_appraisal(rec)
                self.articles.setdefault(rec["content_id"], a)
                self.placements.setdefault(rec["content_id"], [])
                if section not in self.placements[rec["content_id"]]:
                    self.placements[rec["content_id"]].append(section)

    def rec_for(self, article):
        hits = self.ledger.find(article)
        return self.ledger.records[hits[0]] if hits else None

    # ------------------------------------------------------------------ alerts
    def alert(self, kind, rec, detail=""):
        al = {"ts": now_iso(), "kind": kind, "content_id": rec["content_id"], "title": rec["title"], "pmid": rec["pmid"], "doi": rec["doi"],
              "detail": detail, "derived_content": self.derived(rec), "notified": False}
        self.alerts.append(al)
        self.stats["alerts"] += 1
        http.log_event("warn", "evidence_alert", kind=kind, content_id=rec["content_id"], detail=detail)

    def derived(self, rec):
        d = [f"displayed in: {s}" for s in self.placements.get(rec["content_id"], [])]
        if rec["ai"]["status"] != "none":
            d.append("AI summary / appraisal (data/ai_cache.json)")
        if rec["pmid"]:
            d.append(f"possible spotlight / cache key pmid:{rec['pmid']}")
        return d

    # ------------------------------------------------------------ verification
    def needs_verification(self, rec):
        if rec["content_class"] in NO_EXTERNAL_VERIFICATION or rec["content_class"] == "landmark_trial":
            return False
        if rec["source_verification"]["status"] in ("not_checked", "unavailable"):
            return True
        return bool(rec.get("next_check")) and rec["next_check"] <= now_iso()

    def verify_pending(self, budget=None):
        budget = budget if budget is not None else self.policy["max_verify_per_run"]
        for cid, rec in self.ledger.records.items():     # commentary/blog content: no external identifiers to verify
            if cid in self.articles and rec["content_class"] in NO_EXTERNAL_VERIFICATION:
                self.settle(rec)
        todo = [(cid, rec) for cid, rec in self.ledger.records.items() if cid in self.articles and self.needs_verification(rec)]
        todo.sort(key=lambda t: (t[1]["source_verification"]["checked_at"] or "", t[0]))
        todo = todo[:budget]
        self.verify_records(todo)

    def verify_records(self, todo, source="verification"):
        pmids = [norm_pmid(self.articles[c].get("pmid")) for c, _ in todo if self.articles[c].get("pmid")]
        prefetched, batch_err = {}, None
        try:
            prefetched = sources.pubmed_fetch(pmids) if pmids else {}
        except http.SourceError as e:
            batch_err = str(e)
        for cid, rec in todo:
            art = verification_view(self.articles[cid])
            if art.get("pmid") and batch_err:
                res = {"status": "unavailable", "error": batch_err, "level": "metadata", "checks": [], "discrepancies": [], "notices": [], "retraction_status": None}
            else:
                res = verify.gather_and_verify(art, prefetched_pubmed=prefetched)
            self.apply_verification(rec, res, source)

    def apply_verification(self, rec, res, source="verification"):
        L, now = self.ledger, now_iso()
        rec["last_attempt"] = now
        if res["status"] == "unavailable":      # outage: NEVER alters verified content
            self.stats["unavailable"] += 1
            return "unavailable"
        old_sv, old_rs = rec["source_verification"]["status"], rec["retraction_status"]
        old_notices = {(n["type"], n.get("pmid", ""), n.get("doi", "")) for n in rec["notices"]}
        rec["source_verification"] = {"status": res["status"], "level": "metadata", "checked_at": now, "discrepancies": res["discrepancies"][:8],
                                      "checks": [{k: c[k] for k in ("name", "result", "detail")} for c in res["checks"]][:14]}
        pm = res.get("pubmed")
        if pm:
            rec["journal"], rec["authors"] = pm["journal"] or rec["journal"], pm["authors"] or rec["authors"]
            rec["doi"] = rec["doi"] or pm["doi"]
            rec["pubtypes"] = list(pm["pubtypes"])
            pt = [p for p in pm["pubtypes"] if p != "Journal Article"]
            rec["study_design"] = ", ".join(pt[:3]) if pt else rec["study_design"]
            rec["trial_registration"] = sorted(set(rec["trial_registration"]) | set(pm["nct_ids"]))
        for nct, st in (res.get("registry") or {}).items():
            if rec["content_class"] == "registry_record":
                rec["sample_size"] = f"{st['enrollment']} ({st['enrollment_type'].lower() or 'type not stated'})" if st.get("enrollment") else NOT_REPORTED
                rec["intervention"] = "; ".join(st["interventions"][:4]) or NOT_REPORTED
                rec["comparator"] = "; ".join(a for a in st["arm_labels"] if re.search(r"placebo|control|standard|usual", a, re.I)) or UNABLE
                rec["primary_outcomes"] = "; ".join(st["primary_outcomes"][:3]) or NOT_REPORTED
                rec["main_results"] = "Registration only — results " + ("posted on ClinicalTrials.gov" if st["has_results"] else "not available")
                prev = (rec.get("registry") or {})
                rec["registry"] = {"status": st["status"], "has_results": st["has_results"], "last_update": st["last_update"]}
                if prev and prev.get("status") != st["status"]:
                    self.alert("registry_status_changed", rec, f"{prev.get('status')} -> {st['status']}")
                    L.flag(rec, "registry_status_changed", source)
                if prev and not prev.get("has_results") and st["has_results"]:
                    self.alert("registry_results_posted", rec, "Results newly posted — reassess")
                    L.flag(rec, "registry_results_posted", source)
        merged = {(n["type"], n.get("pmid", ""), n.get("doi", "")): n for n in rec["notices"]}
        merged.update({(n["type"], n.get("pmid", ""), n.get("doi", "")): n for n in res["notices"]})
        rec["notices"] = list(merged.values())
        new_types = {k[0] for k in merged} - {k[0] for k in old_notices}
        fp = "v2:" + content_hash(pm["title"] if pm else rec["title"], rec["doi"])   # notices/pub-types are tracked separately
        prev_fp = rec.get("source_fingerprint")
        if prev_fp and prev_fp.startswith("v2:") and prev_fp != fp:     # versioned: an algorithm change can never look like a source change
            L.flag(rec, "source_metadata_changed", source)
            self.alert("source_metadata_changed", rec, "Title/DOI changed at source")
        rec["source_fingerprint"] = fp
        # sticky protective status: only a human reassessment can lower it
        rs = res["retraction_status"]
        if old_rs == "retracted" and rs != "retracted":
            rs = "retracted"
            L.flag(rec, "retraction_status_conflict", source)
        rec["retraction_status"] = rs or old_rs
        recent = dt.date.fromisoformat(self.today.isoformat()).year - (int(re.search(r"(19|20)\d{2}", rec["publication_date"]).group(0)) if re.search(r"(19|20)\d{2}", rec["publication_date"] or "") else 0) <= self.policy["recent_years"]
        days = self.policy["recheck_days_recent"] if recent else self.policy["recheck_days_old"]
        rec["next_check"] = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)).isoformat(timespec="seconds")
        if res["status"] != old_sv or rs != old_rs:
            L.audit.append(f"system:{source}", "verification_result", rec["content_id"], status=res["status"], retraction_status=rs, discrepancies=res["discrepancies"][:5])
        appraisal.ensure_appraisal(rec)
        appraisal.prefill(rec)
        self._protect(rec, res, new_types, source)
        self.settle(rec)
        return res["status"]

    def _protect(self, rec, res, new_types, source):
        L, actor = self.ledger, f"system:{source}"
        notice = (res.get("pubmed") or {}).get("is_notice") or sources.notice_kind_from_title(rec["title"])
        if notice:
            L.flag(rec, "not_primary_evidence", actor)
            if rec["state"] not in PROTECTIVE and rec["state"] != "archived":
                L.transition(rec, "archived", actor, f"record is a {notice.replace('_', ' ')}, not a primary publication (kept in archive; not shown as evidence)")
            return
        rs = rec["retraction_status"]
        if rs == "retracted" and rec["state"] != "retracted":
            L.transition(rec, "retracted", actor, "retraction detected at source")
            self.alert("retracted", rec, "Retraction notice found (PubMed/Crossref)")   # before AI reset so derived content is listed
            rec["ai"]["status"] = "none"
        elif rs == "expression_of_concern" and rec["state"] not in ("under_investigation", "retracted"):
            L.transition(rec, "under_investigation", actor, "expression of concern")
            self.alert("expression_of_concern", rec, "Expression of concern found")
        elif {"correction", "update"} & new_types and rec["state"] in ("published", "verified", "updated"):
            L.flag(rec, "reassess_after_correction", actor)
            if rec["state"] != "updated":
                L.transition(rec, "updated", actor, "correction/update notice detected — reassessment required")
            self.alert("correction_or_update", rec, ", ".join(sorted({"correction", "update"} & new_types)))
            rec["ai"]["status"] = "none"
        if rec["source_verification"]["status"] == "failed" and rec["state"] in ("published", "updated", "verified"):
            L.transition(rec, "under_investigation", actor, "source verification now failing")
            self.alert("verification_failed", rec, "; ".join(rec["source_verification"]["discrepancies"][:3]))
        elif rec["source_verification"]["status"] == "failed":
            self.stats["failed_verification"] += 1

    # ------------------------------------------------------------------ states
    def settle(self, rec):
        L, st, sv = self.ledger, rec["state"], rec["source_verification"]["status"]
        if st != "unverified":
            return
        if rec["content_class"] in NO_EXTERNAL_VERIFICATION and rec["source_verification"]["status"] == "not_checked":
            rec["source_verification"]["status"] = sv = "not_applicable"
        if sv not in ("verified", "not_applicable", "discrepancy"):
            return
        if sv == "discrepancy" or self.policy.get("strict_mode") or rec["content_class"] not in AUTO_CLASSES or "not_primary_evidence" in rec["flags"]:
            L.transition(rec, "pending_review", SYSTEM, "editorial approval required (" + ("discrepancy" if sv == "discrepancy" else "policy") + ")")
            self.stats["pending_review"] += 1
            return
        L.transition(rec, "verified", SYSTEM, "automated multi-source metadata verification passed")
        L.transition(rec, "published", SYSTEM, "auto-publication policy for bibliographic records")
        art = self.articles.get(rec["content_id"])
        if art:
            rec["approved_snapshot"] = {"hash": material_hash(art), "at": now_iso()}
        self.stats["auto_published"] += 1

    def snapshot(self, rec, article):
        rec["approved_snapshot"] = {"hash": material_hash(article), "at": now_iso()}
        rec["pending_update"] = None

    # ------------------------------------------------------- overwrite guard
    def guard_update(self, old, fresh):
        """Called wherever a fresh fetch would replace an archived item. Approved content is
        never silently changed: a material change is parked as pending_update for review."""
        rec = self.rec_for(old)
        if not rec or rec["state"] not in ("published", "updated", "verified") or not rec.get("approved_snapshot"):
            return fresh
        # Compare with the stored copy of THIS bucket entry (the same PMID legitimately appears in several
        # sections, whose copies may be older/newer than each other).
        if material_hash(fresh) == material_hash(old):
            merged = dict(old)
            merged.update({k: v for k, v in fresh.items() if k in ("citation_count", "is_open_access", "pmc_url", "volume", "issue", "pages")})
            return merged
        if not rec.get("pending_update") or rec["pending_update"].get("hash") != material_hash(fresh):
            rec["pending_update"] = {"hash": material_hash(fresh), "detected_at": now_iso(), "article": {k: v for k, v in fresh.items() if not k.startswith("ai_") and k != "evidence"}}
            self.ledger.flag(rec, "source_changed", "system:guard")
            self.ledger.audit.append("system:guard", "pending_update_parked", rec["content_id"], new_hash=material_hash(fresh))
            self.alert("approved_content_changed", rec, "Source text/title/DOI changed; approved version retained pending review")
        return old

    # ------------------------------------------------------------- filtering
    def visible(self, article):
        rec = self.rec_for(article)
        return bool(rec and publish.is_visible(rec))

    def promotable(self, article):
        rec = self.rec_for(article)
        return bool(rec and publish.is_promotable(rec)) or bool(rec and rec["content_class"] == "expert_interpretation" and publish.is_visible(rec))

    def featurable(self, article):
        """Eligible for 'Article of the Week': promotable AND metadata-verified."""
        rec = self.rec_for(article)
        return bool(rec and publish.is_promotable(rec) and rec["source_verification"]["status"] == "verified")

    def filter_visible(self, section, articles):
        out = []
        for a in articles:
            rec = self.rec_for(a)
            if not rec or not publish.is_visible(rec):
                self.stats["held_back"] += 1
                continue
            root = section.split("/")[0]
            if root in publish.STRICT_PROMOTION and rec["content_class"] != "expert_interpretation" and not publish.is_promotable(rec):
                self.stats["not_promoted"] += 1
                continue
            if root in publish.PROMOTION_SECTIONS and (rec["state"] in PROTECTIVE or rec["retraction_status"] in ("retracted", "expression_of_concern")):
                self.stats["not_promoted"] += 1
                continue
            out.append(a)
        return out

    # -------------------------------------------------------------------- AI
    def finalize_ai(self, articles):
        """Validate any AI text attached to articles, then enforce display policy."""
        for a in articles:
            rec = self.rec_for(a)
            if not rec:
                continue
            has_ai = any(a.get(f) for f in publish.AI_ARTICLE_FIELDS)
            if has_ai:
                src = a.get("abstract") or a.get("summary") or ""
                result = dict(a.get("ai_appraisal") or {})
                for f, k in (("ai_summary", "summary"), ("ai_significance", "significance"), ("ai_key_stats", "key_stats"), ("ai_rounds_takeaway", "rounds_takeaway")):
                    if a.get(f):
                        result[k] = a[f]
                v = ai_validate.validate(result, src, a.get("study_type", ""), rec["content_class"], title=a.get("title", ""))
                prev = rec["ai"]
                keep_approval = prev["status"] == "editor_approved" and prev.get("source_hash") == v["source_hash"]
                if "reassess_after_correction" in rec["flags"] and not keep_approval:
                    v["status"] = "none"
                if not keep_approval:
                    rec["ai"] = {**prev, "status": v["status"], "source_hash": v["source_hash"], "validated_at": now_iso(), "issues": v["issues"],
                                 "trace": v["trace"], "practice_text_approved": False, "reviewer": None}
                    if v["status"] == "failed":
                        self.stats["ai_failed_validation"] += 1
                    else:
                        self.stats["ai_auto_validated"] += 1
                else:
                    rec["ai"]["trace"], rec["ai"]["issues"] = v["trace"], v["issues"]
            publish.stamp(a, rec)

    def stamp_only(self, articles):
        for a in articles:
            rec = self.rec_for(a)
            if rec:
                publish.stamp(a, rec)

    def harmonize_study_type(self, articles, normalize_fn):
        """One canonical study design per publication, derived from the verified PubMed publication types,
        so stale archived copies cannot show a different design (RCT vs 'Study') in another section."""
        n = 0
        for a in articles:
            rec = self.rec_for(a)
            if rec and rec.get("pubtypes") and a.get("pmid") and a.get("study_type") in (None, "", "Study", "Multicenter Study", "Clinical Trial", "Comparative Study", "Observational Study", "Review", "Randomized Controlled Trial", "Systematic Review", "Meta-Analysis", "Guideline", "Practice Guideline", "Case Reports"):
                canon = normalize_fn(rec["pubtypes"])
                if canon != a.get("study_type"):
                    a["study_type"] = canon
                    n += 1
        self.stats["study_type_harmonized"] += n

    def persist(self):
        self.ledger.save()


def iter_archive(archive):
    for sec, bucket in archive.items():
        if sec == "categories":
            for cid, items in bucket.items():
                for a in items.values():
                    yield f"categories/{cid}", a
        else:
            for a in bucket.values():
                yield sec, a
