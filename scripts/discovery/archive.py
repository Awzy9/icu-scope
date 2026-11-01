"""Writing retrieved articles into data/archive.json without ever overwriting approved clinical content."""
import json
import os

from evidence.ledger import atomic_write


def load_archive(path):
    data = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    for k in ("categories", "foamed", "guidelines", "preprints", "trials", "bottom_line", "ksa"):
        data.setdefault(k, {})
    return data


def merge_payloads(engine, archive, guard=None):
    """Insert this run's retrieved articles into archive['categories'][cat][pmid].
    New pmid -> added. Existing pmid -> `guard(old, fresh)` decides (approved content is parked, not replaced). Returns (added, kept_existing)."""
    added = kept = 0
    for pmid, (article, cats, _verdict) in engine.payloads.items():
        for c in cats:
            bucket = archive["categories"].setdefault(c, {})
            old = bucket.get(pmid)
            if old is None:
                bucket[pmid] = dict(article)
                added += 1
            else:
                bucket[pmid] = guard(old, dict(article)) if guard else old
                kept += 1
    return added, kept


def save_archive(path, archive):
    atomic_write(path, json.dumps(archive, indent=2, ensure_ascii=False))
