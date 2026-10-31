"""HTTP client: per-host rate limiting, retry with exponential backoff, structured logs."""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "")
USER_AGENT = "icu-scope-evidence/1.0 (+https://github.com/Awzy9/icu-scope; mailto:%s)" % (CONTACT_EMAIL or "unset")
MIN_INTERVAL = {"eutils.ncbi.nlm.nih.gov": 0.4, "api.crossref.org": 0.12, "clinicaltrials.gov": 0.25, "doi.org": 0.2}
if os.environ.get("NCBI_API_KEY"):
    MIN_INTERVAL["eutils.ncbi.nlm.nih.gov"] = 0.12


class SourceError(Exception):
    """Source unreachable / rate-limited / erroring. Never means 'not found'."""


class NotFound(Exception):
    """Source answered definitively that the record does not exist (HTTP 404)."""


METRICS = {"requests": 0, "retries": 0, "errors": [], "not_found": 0}
_last_call = {}


def log_event(level, event, **fields):
    rec = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "level": level, "event": event}
    rec.update(fields)
    print(json.dumps(rec, ensure_ascii=False), file=sys.stderr)


def _default_transport(url, headers, timeout):
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read() if hasattr(e, "read") else b"", dict(e.headers or {})


TRANSPORT = _default_transport   # replaced in tests
SLEEP = time.sleep               # replaced in tests


def request(url, params=None, retries=4, base_delay=1.0, timeout=30):
    """GET with retry/backoff. Returns bytes. Raises NotFound or SourceError."""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    host = urllib.parse.urlparse(url).netloc
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, application/xml;q=0.9, */*;q=0.5"}
    last = None
    for attempt in range(retries + 1):
        gap = MIN_INTERVAL.get(host, 0.2) - (time.monotonic() - _last_call.get(host, 0))
        if gap > 0:
            SLEEP(gap)
        _last_call[host] = time.monotonic()
        METRICS["requests"] += 1
        try:
            status, body, resp_headers = TRANSPORT(url, headers, timeout)
        except Exception as e:  # network error / timeout
            status, body, resp_headers, last = None, b"", {}, f"{type(e).__name__}: {e}"
        if status == 200:
            return body
        if status == 404:
            METRICS["not_found"] += 1
            raise NotFound(url)
        if status is not None:
            last = f"HTTP {status}"
        retryable = status is None or status == 429 or status >= 500
        if not retryable:
            break
        if attempt < retries:
            delay = base_delay * (2 ** attempt)
            ra = (resp_headers or {}).get("Retry-After")
            if ra and str(ra).isdigit():
                delay = max(delay, min(int(ra), 60))
            METRICS["retries"] += 1
            log_event("warn", "retry", host=host, reason=last, attempt=attempt + 1, delay=delay)
            SLEEP(delay)
    METRICS["errors"].append({"host": host, "reason": last})
    log_event("error", "source_unavailable", host=host, reason=last, url=url[:200])
    raise SourceError(f"{host}: {last}")


def request_json(url, params=None, **kw):
    try:
        return json.loads(request(url, params, **kw))
    except json.JSONDecodeError as e:
        METRICS["errors"].append({"host": urllib.parse.urlparse(url).netloc, "reason": "invalid JSON"})
        raise SourceError(f"invalid JSON from {url[:80]}: {e}")
