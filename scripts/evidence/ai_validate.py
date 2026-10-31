"""Deterministic grounding validation of AI-generated clinical text.

This runs independently of the LLM that wrote the text. It can only *reject* or
mark text as 'auto_validated' (= grounded in the abstract; NOT clinically reviewed).
Practice-facing text (rounds takeaway / appraisal bottom line) is never auto-approved.
"""
import re

from .normalize import nct_ids, norm_text, text_hash

PRACTICE_FIELDS = ("rounds_takeaway", "bottom_line")
OBSERVATIONAL = re.compile(r"cohort|observational|retrospective|case[- ]control|cross[- ]sectional|registry|database|prospective(?!ly randomi)", re.I)
NOT_RCT_TYPES = {"Review", "Systematic Review", "Meta-Analysis", "Guideline", "Practice Guideline", "Multicenter Study", "Observational Study", "Study", "Preprint (not peer-reviewed)"}
CAUSAL = re.compile(r"\b(caus(?:e|es|ed|ing)|leads? to|led to|prevent(?:s|ed)?|results? in|resulted in|improv(?:es|ed) survival|reduc(?:es|ed) mortality)\b", re.I)
NEG_SOURCE = re.compile(r"no (statistically )?significant|did not (significantly )?(reduce|improve|differ|decrease)|failed to|not (statistically )?significant|no difference", re.I)
POS_AI = re.compile(r"\bsignificantly (reduc|improv|increas|lower|higher|decreas)|\b(proves?|proved|definitive(ly)?|confirms? that)\b", re.I)
DIRECTIVE = re.compile(r"\b(should|must|ought to|is recommended|are recommended|we recommend|recommend(?:s|ed)? (?:using|giving|that)|should be (?:used|given|adopted|considered))\b", re.I)
NUM = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)*(?![\w])")
STOP_ACRONYMS = {"ICU", "ARDS", "RCT", "CI", "NNT", "ARR", "RRR", "OR", "HR", "RR", "AKI", "DNA", "USA", "UK", "NICE", "CRP", "IV", "PBW", "SOFA", "MV"}


ALIASES = [{"covid 19", "sars cov 2", "coronavirus"}, {"icu", "intensive care unit", "intensive care"}, {"ards", "acute respiratory distress syndrome"}]
SMALL = {"of", "and", "the", "for", "in", "to", "a", "an", "with", "on", "by"}


def _acronym_supported(acr, src_norm):
    """True if the acronym (or its plural / an alias) occurs, or is the initialism of a phrase in the source."""
    a = norm_text(acr)
    a_sing = a[:-1] if a.endswith("s") and len(a) > 3 else a
    for cand in (a, a_sing):
        if re.search(r"(?<![a-z0-9])" + re.escape(cand) + r"(?![a-z0-9])", src_norm):
            return True
    for group in ALIASES:
        if a in group or a_sing in group:
            if any(g in src_norm for g in group):
                return True
    letters = a_sing.replace(" ", "")
    words = [w for w in src_norm.split() if w not in SMALL]
    n = len(letters)
    if 2 <= n <= 8:
        for i in range(len(words) - n + 1):
            if "".join(w[0] for w in words[i:i + n]) == letters:
                return True
    # hyphenated trial names / compounds: every part must be supported
    parts = [p for p in re.split(r"[\s]+", a) if p]
    return len(parts) > 1 and all(re.search(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])", src_norm) for p in parts)


WORDNUM = {w: str(i) for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())}
WORDNUM.update({"thirty": "30", "forty": "40", "fifty": "50", "sixty": "60", "seventy": "70", "eighty": "80", "ninety": "90", "hundred": "100"})


def canon_source(text):
    """Make source numbers comparable: '17 956' / '17\u2009956' / '17,956' -> 17956; spelled-out numbers -> digits."""
    t = re.sub(r"(?<=\d)[\s\u00a0\u2009\u202f](?=\d{3}(?!\d))", "", str(text or ""))
    t = re.sub(r"(?<![\d\w])\.(?=\d)", "0.", t)            # 'P<.001' -> 'P<0.001' (leading zero omitted by many journals)
    if re.search(r"\b(CI|confidence interval)", t):             # '95% CI' convention when the source reports a CI without the level
        t += " 95%"
    t = re.sub(r"\b(" + "|".join(WORDNUM) + r")\b", lambda m: WORDNUM[m.group(1).lower()], t, flags=re.I)
    return t


def _numbers(text):
    out = set()
    for m in NUM.findall(text or ""):
        n = m.replace(",", "")
        out.add(n)
        out.add(n.rstrip("0").rstrip(".") if "." in n else n)
    return out


def _source_spans(source, number):
    for s in re.split(r"(?<=[.;])\s+", source):
        if number in s.replace(",", ""):
            return s.strip()[:240]
    return ""


def check_stats(stats_text):
    """Internal consistency of reported CI / p / NNT. -> list of issue strings."""
    issues = []
    for m in re.finditer(r"(RR|OR|HR|aOR|aHR|aRR)\s*[=:]?\s*(\d+(?:\.\d+)?)\s*\(\s*(?:95%\s*)?CI[:\s]*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)", stats_text or ""):
        est, lo, hi = float(m.group(2)), float(m.group(3)), float(m.group(4))
        if not (lo <= est <= hi):
            issues.append(f"{m.group(1)} {est} lies outside its CI {lo}-{hi}")
        p = re.search(r"p\s*[=<]\s*(0?\.\d+)", stats_text)
        if p and "<" not in p.group(0).replace("=", ""):
            pv = float(p.group(1))
            if (lo <= 1 <= hi) and pv < 0.05:
                issues.append(f"p={pv} implies significance but the CI {lo}-{hi} includes 1")
            if not (lo <= 1 <= hi) and pv > 0.05:
                issues.append(f"p={pv} is non-significant but the CI {lo}-{hi} excludes 1")
    arr, nnt = re.search(r"ARR\s*[=:]?\s*(\d+(?:\.\d+)?)\s*%", stats_text or ""), re.search(r"NNT\s*[=:]?\s*(\d+(?:\.\d+)?)", stats_text or "")
    if arr and nnt and float(arr.group(1)) > 0:
        expect = 100 / float(arr.group(1))
        if abs(expect - float(nnt.group(1))) > max(1.0, 0.15 * expect):
            issues.append(f"NNT {nnt.group(1)} inconsistent with ARR {arr.group(1)}% (expected ≈{expect:.0f})")
    return issues


def ai_fields(result):
    if not result:
        return {}
    return {k: v for k, v in result.items() if isinstance(v, str) and v.strip()}


def validate(result, source_text, study_type="", content_class="original_research", allow_directive=False, title=""):
    """-> {status, issues, trace, source_hash}. status in auto_validated|failed.
    `source_text` is the abstract/summary the model was given; the title is also part of what it saw."""
    issues, trace = [], []
    fields = ai_fields(result)
    if not fields:
        return {"status": "none", "issues": [], "trace": [], "source_hash": None}
    src = source_text or ""
    full_src = f"{title}. {src}" if title else src
    if len(src.strip()) < 80:
        return {"status": "failed", "issues": ["No source abstract/text available to ground this AI content"], "trace": [], "source_hash": text_hash(src)}
    canon = canon_source(full_src)
    src_norm, src_numbers, src_text_norm = canon.replace(",", ""), _numbers(canon), norm_text(full_src)

    for fname, text in fields.items():
        for raw in dict.fromkeys(NUM.findall(text)):
            n = raw.replace(",", "")
            forms = {n, n.rstrip("0").rstrip(".") if "." in n else n}
            if forms & src_numbers or (n.isdigit() and len(n) == 1):
                if not (n.isdigit() and len(n) == 1):
                    trace.append({"field": fname, "claim": raw, "source_span": _source_spans(src, n)})
                continue
            issues.append(f"{fname}: number '{raw}' not present in source text")
        for ident in nct_ids(text):
            if ident not in src.upper():
                issues.append(f"{fname}: trial identifier {ident} not in source")
        for m in sorted(set(re.findall(r"\b[A-Z][A-Za-z]*[A-Z]{2,}[A-Za-z0-9-]*\b|\b[A-Z]{3,}\b", text))):
            if m not in STOP_ACRONYMS and not _acronym_supported(m, src_text_norm):
                issues.append(f"{fname}: term '{m}' does not appear in the source (possible fabrication)")
        if fname not in PRACTICE_FIELDS and not allow_directive:
            for d in DIRECTIVE.finditer(text):
                if d.group(0).lower() not in full_src.lower():       # the authors' own recommendation wording is faithful
                    issues.append(f"{fname}: directive/treatment-recommendation language ('{d.group(0)}') not supported by cited evidence")
                    break
        if POS_AI.search(text) and NEG_SOURCE.search(src) and not re.search(r"significantly (reduc|improv|increas|lower|higher|decreas)", src, re.I):
            issues.append(f"{fname}: states a significant/definitive effect but the source reports no significant difference")
        if re.search(r"\bproves?\b|\bdefinitive(ly)?\b", text, re.I):
            issues.append(f"{fname}: overstates certainty ('proves'/'definitive')")

    is_obs = (study_type in NOT_RCT_TYPES and study_type not in ("Meta-Analysis", "Systematic Review", "Guideline", "Practice Guideline")) or bool(OBSERVATIONAL.search(src[:600]))
    if is_obs and "randomi" not in src_text_norm:
        for fname, text in fields.items():
            for cm in CAUSAL.finditer(text):
                if cm.group(0).lower() not in full_src.lower():       # authors' own wording is preserved, not introduced by the AI
                    issues.append(f"{fname}: causal wording for a non-randomised/observational source ('{cm.group(0)}') — association ≠ causation")
                    break

    for fname in ("key_stats", "outcome"):
        if fname in fields:
            issues.extend(f"{fname}: {i}" for i in check_stats(fields[fname]))
    return {"status": "failed" if issues else "auto_validated", "issues": issues[:12], "trace": trace[:30], "source_hash": text_hash(src)}
