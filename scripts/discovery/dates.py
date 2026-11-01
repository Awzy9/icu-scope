"""Date handling that never silently fails.

PubMed gives three different notions of 'when':
  * publication date  (pubdate / [pdat]) - the issue date; may be month/season/range precision or in the FUTURE
  * electronic date   ([epdat])          - when it appeared online
  * indexing date     ([edat])           - when it entered PubMed; the reliable "new since last run" key
All comparisons are done in UTC calendar dates.
"""
import datetime as dt
import re

MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
SEASONS = {"spring": 3, "summer": 6, "fall": 9, "autumn": 9, "winter": 12}


def utc_today():
    return dt.datetime.now(dt.timezone.utc).date()


def parse_pubmed_date(text):
    """-> (date | None, precision) with precision in 'day','month','year','none'.
    Handles '2026 Oct 29', '2026 Oct', '2026', '2026 Oct-Dec', '2026 Fall', '2026 Oct 29-Nov 2', '2026/10/29', '2026-10-29',
    and leading-space/odd-case variants. Ranges resolve to their START (never to the future)."""
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    if not t:
        return None, "none"
    m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})", t)
    if m:
        return _safe(int(m.group(1)), int(m.group(2)), int(m.group(3))), "day"
    m = re.match(r"^(\d{4})[-/](\d{1,2})$", t)
    if m:
        return _safe(int(m.group(1)), int(m.group(2)), 1), "month"
    m = re.match(r"^(\d{4})\s+([A-Za-z]+)(?:\s+(\d{1,2}))?", t)
    if m:
        y, word, day = int(m.group(1)), m.group(2).lower(), m.group(3)
        mon = MONTHS.get(word[:3]) if word[:3] in MONTHS else SEASONS.get(word)
        if mon:
            return _safe(y, mon, int(day) if day else 1), ("day" if day else "month")
    m = re.match(r"^(\d{4})\b", t)
    if m:
        return _safe(int(m.group(1)), 1, 1), "year"
    return None, "none"


def _safe(y, m, d):
    try:
        return dt.date(y, m, d)
    except ValueError:
        try:
            return dt.date(y, m, 1)
        except ValueError:
            return None


def effective_date(article, today=None):
    """Best estimate of when the work became available (for 'this week', ordering).
    Prefers an electronic date; a FUTURE print-issue date is never trusted over an earlier known date."""
    today = today or utc_today()
    cands = []
    for key in ("epub_date", "pubdate_iso", "pubdate", "indexed_date"):
        d, prec = parse_pubmed_date(article.get(key))
        if d:
            cands.append((d, prec, key))
    if not cands:
        return None, "none"
    past = [c for c in cands if c[0] <= today]
    if not past:
        return min(cands)[0], "future-only"
    day_level = [c for c in past if c[1] == "day"]
    pick = min(day_level) if day_level else min(past)
    return pick[0], pick[1]


def window_chunks(start, end, days):
    """Inclusive [start,end] split into <=days-day chunks (so no single esearch exceeds the 9,999-record ceiling)."""
    out, cur = [], start
    while cur <= end:
        nxt = min(cur + dt.timedelta(days=days - 1), end)
        out.append((cur, nxt))
        cur = nxt + dt.timedelta(days=1)
    return out
