"""Bounded, retryable discovery of official kindergarten school sources.

The job is deliberately separate from unit tests and publication. It captures
candidate evidence for a target entry year; only an explicit review can make a
fact publishable. No previous-year value is promoted to the target year.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import http.client
import ipaddress
import json
import pathlib
import re
import socket
import ssl
import subprocess
import time
import urllib.parse
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from typing import Any, Iterable

TARGET_YEAR = 2027
SCHEMA = 1
MAX_PAGES_PER_SCHOOL = 6
MAX_DOCUMENT_BYTES = 2_000_000
MAX_TOTAL_BYTES = 1_200_000_000
RETRIES = 3
MIN_HOST_INTERVAL_SECONDS = 0.35
MAX_FAILURE_URL_LENGTH = 2_048
FIELD_NAMES = ("application", "form", "fees", "hours")
SOURCE_STATUSES = {"NOT_RUN", "CANDIDATE", "REVIEW", "FETCH_FAILED", "NOT_FOUND", "PUBLISHED"}
FAILURE_REASON_MESSAGES = {
    "UNAPPROVED_URL": "URL 不在核准來源範圍",
    "HOST_RESOLUTION_FAILED": "來源主機無法解析",
    "NON_PUBLIC_HOST": "來源主機不是公開網絡位址",
    "UNAPPROVED_REDIRECT": "重新導向離開核准來源範圍",
    "DOCUMENT_SIZE_LIMIT": "文件超過大小上限",
    "CAPTURE_BYTE_BUDGET": "擷取總容量已達上限",
    "PDF_TEXT_EXTRACTION_FAILED": "PDF 文字擷取失敗",
    "NO_REGISTERED_SCHOOL_WEBSITE": "年度校情資料未有登記學校網址",
    "HTTP_400": "來源回應 HTTP 400",
    "HTTP_403": "來源拒絕自動擷取（HTTP 403）",
    "HTTP_405": "來源不接受此讀取方式（HTTP 405）",
    "HTTP_4XX": "來源回應用戶端錯誤",
    "HTTP_5XX": "來源回應伺服器錯誤",
    "HTTP_PROTOCOL_ERROR": "來源 HTTP 傳輸中斷",
    "TLS_ERROR": "來源的 HTTPS 憑證或協定無法驗證",
    "CONTENT_DECODE_ERROR": "來源內容編碼無法解析",
    "TIMEOUT": "來源連線逾時",
    "NETWORK_ERROR": "來源網絡連線失敗",
    "UNKNOWN_ERROR": "來源擷取發生未分類錯誤",
}
SENSITIVE_QUERY_KEY = re.compile(r"(?:token|secret|password|passwd|api[_-]?key|auth|signature|sig|credential)", re.I)
RELEVANT_TERMS = (
    "2027", "2028", "2027/28", "2027/2028", "幼兒班", "K1", "入學", "收生", "報名",
    "申請", "學費", "費用", "上課", "時間", "時段", "表格", "下載", "online", "online form",
)
FORM_LINK_TERMS = (
    "申請表", "報名表", "入學表", "表格", "表單", "下載表格", "網上報名", "網上申請",
    "報名連結", "申請連結", "form", "application-form", "admission-form", "enrolment-form",
    "registration-form", "online form", "online application", "online registration",
)
CLASS_HOUR_TERMS = (
    "上課", "課堂", "上午班", "下午班", "半日班", "全日班", "上學", "放學", "下課",
    "作息", "課時", "class hours", "class time", "school hours", "lesson time", "dismissal",
)
SUBMISSION_HOUR_TERMS = (
    "派表", "收表", "交表", "遞交", "提交", "報名", "申請", "截止", "索取", "親臨",
    "submission", "application",
)
OFFICE_HOUR_TERMS = (
    "辦公", "辦事處", "校務處", "查詢", "致電", "聯絡", "服務時間", "開放時間", "office", "contact",
)
FIELD_TERMS = {
    "application": ("入學", "收生", "報名", "申請", "截止", "收表", "註冊"),
    "form": ("表格", "下載", "online", "網上", "申請"),
    "fees": ("學費", "費用", "收費", "註冊費", "報名費", "膳食"),
    "hours": CLASS_HOUR_TERMS,
}
FEE_KIND_TERMS = {
    "postage": ("郵費", "郵票", "回郵", "郵寄", "郵資", "postage", "mail"),
    "application": ("報名費", "申請費", "報名表費"),
    "registration": ("註冊費", "登記費", "留位費"),
    "meal": ("膳食", "膳費", "午膳", "午餐", "茶點", "飯費", "餐費"),
    "tuition": ("學費", "學券", "月費", "tuition"),
}
NON_TUITION_FEE_KINDS = {"application", "registration", "postage"}
NON_ADMISSION_FORM_TERMS = (
    "開放日", "體驗日", "遊戲日", "簡介會", "講座", "暫託",
    "open day", "experience day", "play day", "briefing", "seminar", "school tour",
)
ADMISSION_CONFIRMING_TERMS = (
    "入學申請", "申請入學", "首輪申請", "招生申請", "申請截止", "遞交申請", "提交申請",
    "開始招生", "現正招生", "admission application", "apply for admission", "application deadline",
)
DATE_RE = re.compile(r"(?:\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}[./-]\d{1,2}[./-]\d{4})")
TIME_RE = re.compile(r"(?:[01]?\d|2[0-3])(?::|時)[0-5]?\d(?:分)?")
MONEY_RE = re.compile(r"(?:HK\$|港幣|港元|\$)\s*[\d,]+(?:\.\d{1,2})?")
GENERIC_GUIDANCE = (
    "請瀏覽學校網頁", "請參閱學校網頁", "請向學校查詢", "先查目標學年校方公告",
    "瀏覽學校網頁", "參閱學校網頁", "向學校查詢",
)
SCHOOL_YEAR_RE = re.compile(r"(?<!\d)(?:(20\d{2})|(\d{2}))\s*(?:/|至|-|–|—)\s*(?:(20\d{2})|(\d{2}))(?!\d)")


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def normalized_host(value: str | None) -> str:
    return (value or "").lower().removeprefix("www.").rstrip(".")


def canonical_url(value: str) -> str:
    """Canonicalise safe URLs for evidence keys and trailing-slash fetches."""
    try:
        parsed = urllib.parse.urlparse(value)
    except ValueError:
        return value
    if not parsed.scheme or not parsed.netloc:
        return value
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/") or "/"
    return urllib.parse.urlunparse(parsed._replace(path=path, fragment=""))


def content_sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def document_key(raw: bytes, is_pdf: bool) -> str:
    return f"{content_sha256(raw)}-{'pdf' if is_pdf else 'html'}"


def checked_url(value: str | None) -> str:
    """Return a bounded checked URL without credentials or sensitive query values."""
    raw = str(value or "")
    try:
        parsed = urllib.parse.urlparse(raw)
        hostname = parsed.hostname
        if not parsed.scheme or not hostname:
            return raw[:MAX_FAILURE_URL_LENGTH]
        authority = hostname
        if parsed.port is not None:
            authority = f"{authority}:{parsed.port}"
        query = urllib.parse.urlencode([
            (key, "[REDACTED]" if SENSITIVE_QUERY_KEY.search(key) else query_value)
            for key, query_value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        ])
        safe = parsed._replace(netloc=authority, query=query, fragment="")
        return urllib.parse.urlunparse(safe)[:MAX_FAILURE_URL_LENGTH]
    except (TypeError, ValueError):
        return raw[:MAX_FAILURE_URL_LENGTH]


def failure_reason(exc: BaseException | str | None) -> tuple[str, str]:
    """Map implementation errors to stable, non-secret UI/status values."""
    raw = exc if isinstance(exc, str) else str(exc or "")
    if raw in FAILURE_REASON_MESSAGES:
        return raw, FAILURE_REASON_MESSAGES[raw]
    if isinstance(exc, urllib.error.HTTPError):
        code = f"HTTP_{exc.code}" if f"HTTP_{exc.code}" in FAILURE_REASON_MESSAGES else "HTTP_4XX" if 400 <= exc.code < 500 else "HTTP_5XX" if exc.code >= 500 else "NETWORK_ERROR"
        return code, FAILURE_REASON_MESSAGES[code]
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return "TIMEOUT", FAILURE_REASON_MESSAGES["TIMEOUT"]
    if isinstance(exc, socket.gaierror):
        return "HOST_RESOLUTION_FAILED", FAILURE_REASON_MESSAGES["HOST_RESOLUTION_FAILED"]
    if isinstance(exc, (ssl.SSLError, ssl.CertificateError)):
        return "TLS_ERROR", FAILURE_REASON_MESSAGES["TLS_ERROR"]
    if isinstance(exc, http.client.HTTPException):
        return "HTTP_PROTOCOL_ERROR", FAILURE_REASON_MESSAGES["HTTP_PROTOCOL_ERROR"]
    if isinstance(exc, UnicodeError):
        return "CONTENT_DECODE_ERROR", FAILURE_REASON_MESSAGES["CONTENT_DECODE_ERROR"]
    if isinstance(exc, urllib.error.URLError):
        if isinstance(exc.reason, (TimeoutError, socket.timeout)):
            return "TIMEOUT", FAILURE_REASON_MESSAGES["TIMEOUT"]
        if isinstance(exc.reason, socket.gaierror):
            return "HOST_RESOLUTION_FAILED", FAILURE_REASON_MESSAGES["HOST_RESOLUTION_FAILED"]
        if isinstance(exc.reason, (ssl.SSLError, ssl.CertificateError)):
            return "TLS_ERROR", FAILURE_REASON_MESSAGES["TLS_ERROR"]
        return "NETWORK_ERROR", FAILURE_REASON_MESSAGES["NETWORK_ERROR"]
    if isinstance(exc, (subprocess.CalledProcessError, subprocess.TimeoutExpired)):
        return "PDF_TEXT_EXTRACTION_FAILED", FAILURE_REASON_MESSAGES["PDF_TEXT_EXTRACTION_FAILED"]
    return "UNKNOWN_ERROR", FAILURE_REASON_MESSAGES["UNKNOWN_ERROR"]


def failure_provenance(page: dict[str, Any]) -> dict[str, str]:
    """Keep only bounded failure metadata; a failed fetch is never evidence."""
    code, message = failure_reason(page.get("reason_code") or page.get("reason"))
    return {
        "checked_url": checked_url(page.get("checked_url") or page.get("url")),
        "checked_at": str(page.get("checked_at") or now())[:64],
        "reason_code": code,
        "reason": message,
    }


def approved_hosts(base_host: str | None) -> set[str]:
    return {normalized_host(base_host), "edb.gov.hk", "applications.edb.gov.hk"}


def safe_https_url(value: str, base_host: str | None = None) -> str | None:
    try:
        parsed = urllib.parse.urlparse(value)
        port = parsed.port
    except ValueError:
        return None
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or port:
        return None
    host = normalized_host(parsed.hostname)
    allowed = approved_hosts(base_host)
    if host not in allowed:
        return None
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return None
    except ValueError:
        pass
    return canonical_url(urllib.parse.urlunparse(parsed._replace(fragment="")))


def school_https_root(value: str) -> tuple[str | None, str | None]:
    roots, base_host = school_https_roots(value)
    return (roots[0] if roots else None), base_host


def school_https_roots(value: str) -> tuple[list[str], str | None]:
    """Return bounded HTTPS variants for the registered school website."""
    try:
        parsed = urllib.parse.urlparse(value)
        if not parsed.hostname and "://" not in value:
            parsed = urllib.parse.urlparse(f"https://{value.strip()}")
        base_host = parsed.hostname
    except ValueError:
        return [], None
    if not base_host or parsed.username or parsed.password or parsed.port:
        return [], None
    if parsed.scheme == "http":
        parsed = parsed._replace(scheme="https")
    if parsed.scheme != "https":
        return [], base_host
    alternate_host = base_host[4:] if base_host.lower().startswith("www.") else f"www.{base_host}"
    candidates = [
        urllib.parse.urlunparse(parsed),
        urllib.parse.urlunparse(parsed._replace(path="/", params="", query="", fragment="")),
        urllib.parse.urlunparse(parsed._replace(netloc=alternate_host)),
        urllib.parse.urlunparse(parsed._replace(netloc=alternate_host, path="/", params="", query="", fragment="")),
    ]
    roots = []
    for candidate in candidates:
        safe = safe_https_url(candidate, base_host)
        if safe and safe not in roots:
            roots.append(safe)
    return roots, base_host


def require_public_host(host: str) -> None:
    """Reject literal or DNS-resolved non-public destinations before connecting."""
    try:
        addresses = {item[4][0].split("%")[0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        raise ValueError("HOST_RESOLUTION_FAILED") from exc
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("NON_PUBLIC_HOST")


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, base_host: str) -> None:
        self.base_host = base_host

    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> Any:
        safe = safe_https_url(urllib.parse.urljoin(req.full_url, newurl), self.base_host)
        if safe is None:
            raise ValueError("UNAPPROVED_REDIRECT")
        require_public_host(urllib.parse.urlparse(safe).hostname or "")
        return super().redirect_request(req, fp, code, msg, headers, safe)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._label: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._label = []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = max(0, self._skip - 1)
        if tag == "a" and self._href:
            self.links.append((self._href, " ".join(self._label).strip()))
            self._href = None
            self._label = []

    def handle_data(self, data: str) -> None:
        if self._skip == 0 and self._href is not None:
            self._label.append(data)


class TextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag in ("p", "div", "br", "li", "tr", "td", "h1", "h2", "h3", "h4"):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = max(0, self._skip - 1)

    def handle_data(self, data: str) -> None:
        if self._skip == 0:
            self.parts.append(data)


def decode_html(raw: bytes, content_type: str = "") -> str:
    declared = re.search(r"charset\s*=\s*['\"]?([^\s;'\"]+)", content_type, re.I)
    meta = re.search(br"charset\s*=\s*['\"]?([^\s;'\">]+)", raw[:4096], re.I)
    encodings = [declared.group(1) if declared else "", meta.group(1).decode("ascii", "ignore") if meta else "", "utf-8-sig", "big5hkscs", "cp950", "gb18030"]
    for encoding in dict.fromkeys(x for x in encodings if x):
        try:
            return raw.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def html_text(raw: bytes, content_type: str = "") -> str:
    parser = TextParser()
    parser.feed(decode_html(raw, content_type))
    return "\n".join(x.strip() for x in "".join(parser.parts).splitlines() if x.strip())


def is_target_year(text: str, target_year: int = TARGET_YEAR) -> bool:
    text = urllib.parse.unquote(html.unescape(text))
    starts = {
        start
        for match in SCHOOL_YEAR_RE.finditer(text)
        for start, end in [(int(match.group(1) or f"20{match.group(2)}"), int(match.group(3) or f"20{match.group(4)}"))]
        if end == start + 1
    }
    return starts == {target_year}


def _field_for(text: str) -> list[str]:
    lower = text.casefold()
    return [field for field, terms in FIELD_TERMS.items() if any(term.casefold() in lower for term in terms)]


def _excerpt(line: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", line)).strip()[:500]


def _evidence(
    field: str,
    value: str,
    url: str,
    target: bool,
    target_year: int = TARGET_YEAR,
    *,
    dates: list[str] | None = None,
    fee_kind: str | None = None,
    hour_kind: str | None = None,
) -> dict[str, Any]:
    evidence = {
        "field": field,
        "value": value,
        "evidence_excerpt": _excerpt(value),
        "url": canonical_url(url),
        "target_year": target_year if target else None,
        "reference_period": f"{target_year}/{str(target_year + 1)[-2:]}" if target else None,
        "capture_status": "CAPTURED",
        "review_status": "REVIEW_REQUIRED",
        "publication_status": "UNPUBLISHED",
        "dates": dates or [],
    }
    if fee_kind is not None:
        evidence["fee_kind"] = fee_kind
    if hour_kind is not None:
        evidence["hour_kind"] = hour_kind
    return evidence


def _dedupe_evidence(evidence: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for item in evidence:
        item["url"] = canonical_url(str(item.get("url") or ""))
        key = (item.get("field"), item.get("value"), item.get("url"), item.get("target_year"))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def _fee_kind(text: str) -> str | None:
    lower = text.casefold()
    for kind, terms in FEE_KIND_TERMS.items():
        if any(term.casefold() in lower for term in terms):
            return kind
    return None


def _has_term(text: str, terms: Iterable[str]) -> bool:
    lower = text.casefold()
    return any(term.casefold() in lower for term in terms)


def _class_hour_context(line: str, window: str) -> bool:
    context = f"{line} {window}"
    non_class_terms = (*SUBMISSION_HOUR_TERMS, *OFFICE_HOUR_TERMS)
    if _has_term(line, CLASS_HOUR_TERMS):
        return not _has_term(line, non_class_terms)
    return _has_term(context, CLASS_HOUR_TERMS) and not _has_term(context, non_class_terms)


def _application_hour_kind(line: str, window: str) -> str | None:
    if _has_term(line, SUBMISSION_HOUR_TERMS):
        return "submission"
    if _has_term(line, OFFICE_HOUR_TERMS):
        return "office"
    context = f"{line} {window}"
    if _has_term(context, SUBMISSION_HOUR_TERMS):
        return "submission"
    if _has_term(context, OFFICE_HOUR_TERMS):
        return "office"
    return None


def _is_form_link(label: str, href: str) -> bool:
    text = f"{label} {href}".casefold()
    return not _has_term(text, NON_ADMISSION_FORM_TERMS) and (
        any(term.casefold() in text for term in FORM_LINK_TERMS if term != "form")
        or re.search(r"(?<![a-z])forms?(?![a-z])", text) is not None
    )


def _is_non_admission_event(text: str) -> bool:
    return _has_term(text, NON_ADMISSION_FORM_TERMS) and not _has_term(text, ADMISSION_CONFIRMING_TERMS)


def _is_root_url(value: str) -> bool:
    parsed = urllib.parse.urlparse(canonical_url(value))
    return parsed.path in ("", "/")


def extract_facts(text: str, url: str, links: Iterable[tuple[str, str]] = (), target_year: int = TARGET_YEAR) -> dict[str, list[dict[str, Any]]]:
    """Extract bounded evidence snippets; never declares them publishable."""
    lines = [x.strip() for x in text.splitlines() if x.strip()]
    facts: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, line in enumerate(lines):
        if any(phrase in line for phrase in GENERIC_GUIDANCE):
            continue
        window = " ".join(lines[max(0, index - 2):index + 3])
        target = is_target_year(window, target_year)
        fields = _field_for(window)
        dates = DATE_RE.findall(line)
        times = TIME_RE.findall(line)
        non_admission_event = _is_non_admission_event(line)
        if dates and not non_admission_event and any(term in window for term in FIELD_TERMS["application"]):
            facts["application"].append(_evidence("application_dates", line, url, target, target_year, dates=dates))
        if times:
            if _class_hour_context(line, window):
                facts["hours"].append(_evidence("hours", line, url, target, target_year))
            elif (hour_kind := _application_hour_kind(line, window)) is not None:
                facts["application"].append(_evidence("application_submission_hours", line, url, target, target_year, hour_kind=hour_kind))
        kind = _fee_kind(line)
        if (MONEY_RE.search(line) or (kind == "tuition" and any(term in line for term in ("全免", "免費")))) and any(term in window for term in FIELD_TERMS["fees"]):
            fee_year = next((
                lines[position]
                for position in range(index, max(-1, index - 8), -1)
                if SCHOOL_YEAR_RE.search(urllib.parse.unquote(html.unescape(lines[position])))
            ), "")
            fee_target = is_target_year(f"{fee_year} {line}", target_year)
            if kind in {"tuition", "meal"}:
                facts["fees"].append(_evidence("fees", line, url, fee_target, target_year, fee_kind=kind))
            elif not non_admission_event and (kind in NON_TUITION_FEE_KINDS or any(term in window for term in FIELD_TERMS["application"])):
                facts["application"].append(_evidence("application_step", line, url, target, target_year, fee_kind=kind) if kind else _evidence("application_step", line, url, target, target_year))
        if not non_admission_event and any(term in window for term in FIELD_TERMS["application"]) and not dates and not any(term in line for term in GENERIC_GUIDANCE):
            if any(action in line for action in ("遞交", "提交", "填寫", "登記", "報名", "申請", "文件")):
                facts["application"].append(_evidence("application_step", line, url, target, target_year))
        if "form" in fields and not _has_term(line, NON_ADMISSION_FORM_TERMS) and any(term in line for term in ("表格", "下載", "網上", "online")):
            facts["form"].append(_evidence("form_reference", line, url, target, target_year))
    page_url = url
    base_host = urllib.parse.urlparse(page_url).hostname
    for href, label in links:
        if not href or href.lstrip().startswith("#"):
            continue
        resolved = urllib.parse.urljoin(page_url, href)
        if urllib.parse.urlparse(resolved).fragment:
            continue
        candidate = safe_https_url(urllib.parse.urljoin(page_url, href), base_host)
        label_text = f"{label} {href}"
        if not candidate or candidate == canonical_url(page_url) or _is_root_url(candidate) or not _is_form_link(label, href):
            continue
        target = is_target_year(label_text, target_year)
        facts["form"].append(_evidence("form_url", candidate, page_url, target, target_year))
    return {key: _dedupe_evidence(values) for key, values in facts.items()}


def discover_links(raw: bytes, page_url: str, limit: int = MAX_PAGES_PER_SCHOOL - 1, content_type: str = "") -> list[str]:
    parser = LinkParser()
    parser.feed(decode_html(raw, content_type))
    page_url = canonical_url(page_url)
    base_host = urllib.parse.urlparse(page_url).hostname
    scored: dict[str, int] = {}
    for href, label in parser.links:
        url = safe_https_url(urllib.parse.urljoin(page_url, href), base_host)
        if not url or url == page_url:
            continue
        text = f"{label} {url}"
        matches = [term for term in RELEVANT_TERMS if term.casefold() in text.casefold()]
        score = sum(4 if term.casefold() in text.casefold() else 1 for term in matches)
        if matches:
            scored[url] = max(score, scored.get(url, 0))
    return [url for url, _ in sorted(scored.items(), key=lambda item: (-item[1], item[0]))[:limit]]


def field_states(pages: list[dict[str, Any]], failures: int, target_year: int = TARGET_YEAR) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for field in FIELD_NAMES:
        evidence = _dedupe_evidence(e for page in pages for e in page.get("facts", {}).get(field, []))
        target = [e for e in evidence if e.get("target_year") == target_year]
        if target:
            status = "CANDIDATE"
        elif evidence:
            status = "REVIEW"
        elif failures and not pages:
            status = "FETCH_FAILED"
        else:
            status = "NOT_FOUND"
        result[field] = {
            "status": status,
            "target_year": target_year,
            "reference_year": target_year if target else None,
            "evidence_count": len(evidence),
            "total_evidence_count": len(evidence),
            "target_evidence_count": len(target),
            "evidence": (target + [e for e in evidence if e.get("target_year") != target_year])[:20],
            "review_status": "REVIEW_REQUIRED" if evidence else "NOT_FOUND",
            "publication_status": "UNPUBLISHED",
        }
    return result


def read_base_schools(base: pathlib.Path, parent_inputs: pathlib.Path | None = None) -> list[dict[str, Any]]:
    manifest = json.loads((base / "catalog-manifest.json").read_text(encoding="utf8"))
    if parent_inputs is not None:
        payload = json.loads(parent_inputs.read_text(encoding="utf8"))
        if payload.get("schema") != 1 or payload.get("data_id") != manifest["data_id"]:
            raise ValueError("Parent-card scope differs from base catalog")
        source = payload.get("records", [])
    else:
        data = base / "data" / manifest["data_id"]
        index = json.loads((data / "index.json").read_text(encoding="utf8"))
        source = [json.loads((data / "schools" / f"{summary['id']}.json").read_text(encoding="utf8")) for summary in index if summary.get("level") == "KG"]
    schools = []
    for detail in sorted(source, key=lambda s: s["id"]):
        annual = detail.get("annual", [])
        fields = annual[0].get("fields", {}) if len(annual) == 1 else {}
        schools.append({
            "school_id": detail["id"],
            "name": detail.get("name", ""),
            "address": detail.get("address", ""),
            "website": fields.get("學校網址", ""),
        })
    return schools


class Fetcher:
    def __init__(self, out: pathlib.Path, timeout: float = 15.0) -> None:
        self.out = out
        self.timeout = timeout
        import threading
        self.host_locks: defaultdict[str, Any] = defaultdict(threading.Lock)
        self.host_last_request: dict[str, float] = {}
        self.total_bytes = 0
        self.total_lock = threading.Lock()

    def failed(self, url: str, reason: BaseException | str) -> dict[str, Any]:
        code, message = failure_reason(reason)
        checked = checked_url(url)
        return {
            "url": checked,
            "checked_url": checked,
            "capture_status": "FETCH_FAILED",
            "reason_code": code,
            "reason": message,
            "checked_at": now(),
        }

    def fetch(self, url: str, base_host: str) -> dict[str, Any]:
        safe = safe_https_url(url, base_host)
        if not safe:
            return self.failed(url, "UNAPPROVED_URL")
        host = normalized_host(urllib.parse.urlparse(safe).hostname)
        with self.host_locks[host]:
            last: BaseException | str = "UNKNOWN_ERROR"
            for attempt in range(1, RETRIES + 1):
                try:
                    require_public_host(urllib.parse.urlparse(safe).hostname or "")
                    delay = MIN_HOST_INTERVAL_SECONDS - (time.monotonic() - self.host_last_request.get(host, 0.0))
                    if delay > 0:
                        time.sleep(delay)
                    self.host_last_request[host] = time.monotonic()
                    request = urllib.request.Request(safe, headers={
                        "User-Agent": "Mozilla/5.0 (compatible; HK-School-Guide-KG-2027-Source/1.1)",
                        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
                    })
                    opener = urllib.request.build_opener(SafeRedirectHandler(base_host))
                    with opener.open(request, timeout=self.timeout) as response:
                        final = safe_https_url(response.geturl(), base_host)
                        if final is None or normalized_host(urllib.parse.urlparse(final).hostname) not in approved_hosts(base_host):
                            raise ValueError("UNAPPROVED_REDIRECT")
                        raw = response.read(MAX_DOCUMENT_BYTES + 1)
                        content_type = response.headers.get("content-type", "")
                    if len(raw) > MAX_DOCUMENT_BYTES:
                        raise ValueError("DOCUMENT_SIZE_LIMIT")
                    with self.total_lock:
                        if self.total_bytes + len(raw) > MAX_TOTAL_BYTES:
                            raise ValueError("CAPTURE_BYTE_BUDGET")
                        self.total_bytes += len(raw)
                    is_pdf = raw.startswith(b"%PDF") or "application/pdf" in content_type.lower()
                    document_sha = content_sha256(raw)
                    url_key = document_key(raw, is_pdf)
                    ext = ".pdf" if is_pdf else ".html"
                    path = self.out / "documents" / (url_key + ext)
                    text_path = self.out / "documents" / (url_key + ".txt")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(raw)
                    if is_pdf:
                        subprocess.run(["pdftotext", "-layout", str(path), str(text_path)], check=True, capture_output=True, timeout=20)
                        text = text_path.read_text(encoding="utf8", errors="replace")
                    else:
                        text = html_text(raw, content_type)
                        text_path.write_text(text, encoding="utf8")
                    links: list[tuple[str, str]] = []
                    if not is_pdf:
                        parser = LinkParser(); parser.feed(decode_html(raw, content_type)); links = parser.links
                    return {
                        "url": safe, "capture_status": "CAPTURED", "attempt": attempt,
                        "captured_at": now(), "checked_at": now(), "path": str(path.relative_to(self.out)),
                        "text_path": str(text_path.relative_to(self.out)), "sha256": document_sha,
                        "text_sha256": content_sha256(text_path.read_bytes()), "bytes": len(raw),
                        "facts": extract_facts(text, safe, links), "discovered_links": [] if is_pdf else discover_links(raw, safe, content_type=content_type),
                        "review_status": "REVIEW_REQUIRED", "publication_status": "UNPUBLISHED",
                    }
                except Exception as exc:  # explicit source jobs retain failure state and continue other schools
                    last = exc
                    code, _ = failure_reason(exc)
                    if attempt < RETRIES and code in {"HOST_RESOLUTION_FAILED", "TIMEOUT", "NETWORK_ERROR", "HTTP_5XX"}:
                        time.sleep(attempt)
                    else:
                        break
            return self.failed(safe, last)


def capture_school(school: dict[str, Any], fetcher: Fetcher, target_year: int = TARGET_YEAR) -> dict[str, Any]:
    website = school.get("website", "")
    roots, base_host = school_https_roots(website)
    base = {**school, "target_entry_year": target_year, "checked_at": now(), "review_status": "REVIEW_REQUIRED", "publication_status": "UNPUBLISHED"}
    if not roots or not base_host:
        code = "NO_REGISTERED_SCHOOL_WEBSITE" if not str(website).strip() else "UNAPPROVED_URL"
        return {**base, "discovery_status": "NOT_FOUND", "reason_code": code, "reason": FAILURE_REASON_MESSAGES[code], "pages": [], "fetch_failures": [], "fields": field_states([], 0, target_year)}
    pages = []
    fetch_failures = []
    first = None
    for root in roots:
        attempt = fetcher.fetch(root, base_host)
        if attempt.get("capture_status") == "CAPTURED":
            first = attempt
            pages.append(attempt)
            break
        fetch_failures.append(failure_provenance(attempt))
    failures = len(fetch_failures)
    if first:
        visited = {canonical_url(item) for item in roots} | {canonical_url(first.get("url") or roots[0])}
        for url in first.get("discovered_links", [])[:MAX_PAGES_PER_SCHOOL - 1]:
            url = canonical_url(url)
            if url in visited:
                continue
            visited.add(url)
            page = fetcher.fetch(url, base_host)
            if page.get("capture_status") == "CAPTURED": pages.append(page)
            else:
                fetch_failures.append(failure_provenance(page))
                failures += 1
    fields = field_states(pages, failures, target_year)
    statuses = [x["status"] for x in fields.values()]
    discovery = "CANDIDATE" if any(x == "CANDIDATE" for x in statuses) else "REVIEW" if pages else "FETCH_FAILED"
    return {**base, "discovery_status": discovery, "identity_status": "CANDIDATE", "pages": pages, "fetch_failures": fetch_failures, "fields": fields}


def run(base: pathlib.Path, out: pathlib.Path, target_year: int = TARGET_YEAR, plan_only: bool = False, parent_inputs: pathlib.Path | None = None) -> dict[str, Any]:
    schools = read_base_schools(base, parent_inputs)
    if len(schools) != 1025:
        raise ValueError(f"Unexpected KG scope: {len(schools)}")
    if plan_only:
        result = {"schema": SCHEMA, "target_entry_year": target_year, "scope": "ALL_KG_PARENT_CARDS", "school_count": len(schools), "fetch_failure_count": 0, "fetch_failure_reason_counts": {}, "schools": schools, "capture_status": "PLAN_ONLY"}
        out.mkdir(parents=True, exist_ok=True); (out / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8"); return result
    out.mkdir(parents=True, exist_ok=True)
    fetcher = Fetcher(out)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(lambda school: capture_school(school, fetcher, target_year), schools))
    reason_counts = Counter(
        failure["reason_code"]
        for school in records
        for failure in school.get("fetch_failures", [])
    )
    failure_count = sum(reason_counts.values())
    result = {
        "schema": SCHEMA, "target_entry_year": target_year, "scope": "ALL_KG_PARENT_CARDS",
        "school_count": len(records), "captured_school_count": sum(bool(s["pages"]) for s in records),
        "candidate_school_count": sum(s["discovery_status"] == "CANDIDATE" for s in records),
        "fetch_failed_school_count": sum(s["discovery_status"] == "FETCH_FAILED" for s in records),
        "not_found_school_count": sum(s["discovery_status"] == "NOT_FOUND" for s in records),
        "fetch_failure_count": failure_count,
        "fetch_failure_reason_counts": dict(sorted(reason_counts.items())),
        "checked_at": now(), "capture_status": "CAPTURED_WITH_EXPLICIT_GAPS", "schools": records,
        "policy": {"max_pages_per_school": MAX_PAGES_PER_SCHOOL, "max_document_bytes": MAX_DOCUMENT_BYTES, "retries": RETRIES, "official_hosts_only": True},
    }
    (out / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    return result
