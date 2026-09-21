"""Bounded, retryable discovery of official kindergarten school sources.

The job is deliberately separate from unit tests and publication. It captures
candidate evidence for a target entry year; only an explicit review can make a
fact publishable. No previous-year value is promoted to the target year.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import ipaddress
import json
import pathlib
import re
import socket
import subprocess
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from typing import Any, Iterable

TARGET_YEAR = 2027
SCHEMA = 1
MAX_PAGES_PER_SCHOOL = 6
MAX_DOCUMENT_BYTES = 2_000_000
MAX_TOTAL_BYTES = 1_200_000_000
RETRIES = 2
MIN_HOST_INTERVAL_SECONDS = 0.35
FIELD_NAMES = ("application", "form", "fees", "hours")
SOURCE_STATUSES = {"NOT_RUN", "CANDIDATE", "REVIEW", "FETCH_FAILED", "NOT_FOUND", "PUBLISHED"}
RELEVANT_TERMS = (
    "2027", "2028", "2027/28", "2027/2028", "幼兒班", "K1", "入學", "收生", "報名",
    "申請", "學費", "費用", "上課", "時間", "時段", "表格", "下載", "online", "online form",
)
FIELD_TERMS = {
    "application": ("入學", "收生", "報名", "申請", "截止", "收表", "註冊"),
    "form": ("表格", "下載", "online", "網上", "申請"),
    "fees": ("學費", "費用", "收費", "註冊費", "報名費", "膳食"),
    "hours": ("上課", "時間", "時段", "上午班", "下午班", "全日班", "放學"),
}
DATE_RE = re.compile(r"(?:\d{4}年\d{1,2}月\d{1,2}日|\d{1,2}[./-]\d{1,2}[./-]\d{4})")
TIME_RE = re.compile(r"(?:[01]?\d|2[0-3])(?::|時)[0-5]?\d(?:分)?")
MONEY_RE = re.compile(r"(?:HK\$|港幣|港元|\$)\s*[\d,]+(?:\.\d{1,2})?")
GENERIC_GUIDANCE = (
    "請瀏覽學校網頁", "請參閱學校網頁", "請向學校查詢", "先查目標學年校方公告",
    "瀏覽學校網頁", "參閱學校網頁", "向學校查詢",
)


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def normalized_host(value: str | None) -> str:
    return (value or "").lower().removeprefix("www.").rstrip(".")


def content_sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


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
    return urllib.parse.urlunparse(parsed._replace(fragment=""))


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
    next_year = target_year + 1
    return bool(re.search(rf"{target_year}\s*(?:/|至|-|–|—)\s*(?:{next_year}|{str(next_year)[-2:]})(?!\d)", text))


def _field_for(text: str) -> list[str]:
    lower = text.casefold()
    return [field for field, terms in FIELD_TERMS.items() if any(term.casefold() in lower for term in terms)]


def _excerpt(line: str) -> str:
    return html.unescape(re.sub(r"\s+", " ", line)).strip()[:500]


def _evidence(field: str, value: str, url: str, target: bool, target_year: int = TARGET_YEAR, *, dates: list[str] | None = None) -> dict[str, Any]:
    return {
        "field": field,
        "value": value,
        "evidence_excerpt": _excerpt(value),
        "url": url,
        "target_year": target_year if target else None,
        "reference_period": f"{target_year}/{str(target_year + 1)[-2:]}" if target else None,
        "capture_status": "CAPTURED",
        "review_status": "REVIEW_REQUIRED",
        "publication_status": "UNPUBLISHED",
        "dates": dates or [],
    }


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
        if dates and any(term in window for term in FIELD_TERMS["application"]):
            facts["application"].append(_evidence("application_dates", line, url, target, target_year, dates=dates))
        if times and any(term in window for term in FIELD_TERMS["hours"]):
            facts["hours"].append(_evidence("hours", line, url, target, target_year))
        if MONEY_RE.search(line) and any(term in window for term in FIELD_TERMS["fees"]):
            facts["fees"].append(_evidence("fees", line, url, target, target_year))
        if any(term in window for term in FIELD_TERMS["application"]) and not dates and not any(term in line for term in GENERIC_GUIDANCE):
            if any(action in line for action in ("遞交", "提交", "填寫", "登記", "報名", "申請", "文件")):
                facts["application"].append(_evidence("application_step", line, url, target, target_year))
        if "form" in fields and any(term in line for term in ("表格", "下載", "網上", "online")):
            facts["form"].append(_evidence("form_reference", line, url, target, target_year))
    page_url = url
    base_host = urllib.parse.urlparse(page_url).hostname
    for href, label in links:
        candidate = safe_https_url(urllib.parse.urljoin(page_url, href), base_host)
        label_text = f"{label} {href}"
        if not candidate or not any(term.casefold() in label_text.casefold() for term in RELEVANT_TERMS):
            continue
        target = is_target_year(label_text, target_year) or is_target_year(text, target_year)
        facts["form"].append(_evidence("form_url", candidate, page_url, target, target_year))
    return {key: values for key, values in facts.items()}


def discover_links(raw: bytes, page_url: str, limit: int = MAX_PAGES_PER_SCHOOL - 1, content_type: str = "") -> list[str]:
    parser = LinkParser()
    parser.feed(decode_html(raw, content_type))
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
        evidence = [e for page in pages for e in page.get("facts", {}).get(field, [])]
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
            "evidence": evidence[:20],
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

    def fetch(self, url: str, base_host: str) -> dict[str, Any]:
        safe = safe_https_url(url, base_host)
        if not safe:
            return {"url": url, "capture_status": "FETCH_FAILED", "reason": "UNAPPROVED_URL"}
        host = normalized_host(urllib.parse.urlparse(safe).hostname)
        with self.host_locks[host]:
            last = "UNKNOWN"
            for attempt in range(1, RETRIES + 1):
                try:
                    require_public_host(urllib.parse.urlparse(safe).hostname or "")
                    delay = MIN_HOST_INTERVAL_SECONDS - (time.monotonic() - self.host_last_request.get(host, 0.0))
                    if delay > 0:
                        time.sleep(delay)
                    self.host_last_request[host] = time.monotonic()
                    request = urllib.request.Request(safe, headers={"User-Agent": "HK-School-Guide-KG-2027-Source/1.0"})
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
                    url_key = hashlib.sha256(safe.encode()).hexdigest()[:24]
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
                        "text_path": str(text_path.relative_to(self.out)), "sha256": hashlib.sha256(raw).hexdigest(),
                        "text_sha256": content_sha256(text_path.read_bytes()), "bytes": len(raw),
                        "facts": extract_facts(text, safe, links), "discovered_links": [] if is_pdf else discover_links(raw, safe, content_type=content_type),
                        "review_status": "REVIEW_REQUIRED", "publication_status": "UNPUBLISHED",
                    }
                except Exception as exc:  # explicit source jobs retain failure state and continue other schools
                    last = f"{type(exc).__name__}:{str(exc)[:200]}"
                    if attempt < RETRIES:
                        time.sleep(0.25 * attempt)
            return {"url": safe, "capture_status": "FETCH_FAILED", "reason": last, "checked_at": now()}


def capture_school(school: dict[str, Any], fetcher: Fetcher, target_year: int = TARGET_YEAR) -> dict[str, Any]:
    website = school.get("website", "")
    base_host = urllib.parse.urlparse(website).hostname
    root = safe_https_url(website, base_host)
    base = {**school, "target_entry_year": target_year, "checked_at": now(), "review_status": "REVIEW_REQUIRED", "publication_status": "UNPUBLISHED"}
    if not root or not base_host:
        return {**base, "discovery_status": "NOT_FOUND", "reason": "NO_APPROVED_HTTPS_SCHOOL_WEBSITE", "pages": [], "fields": field_states([], 0, target_year)}
    first = fetcher.fetch(root, base_host)
    pages = [first] if first.get("capture_status") == "CAPTURED" else []
    failures = 0 if pages else 1
    if pages:
        for url in first.get("discovered_links", [])[:MAX_PAGES_PER_SCHOOL - 1]:
            page = fetcher.fetch(url, base_host)
            if page.get("capture_status") == "CAPTURED": pages.append(page)
            else: failures += 1
    fields = field_states(pages, failures, target_year)
    statuses = [x["status"] for x in fields.values()]
    discovery = "CANDIDATE" if any(x == "CANDIDATE" for x in statuses) else "REVIEW" if pages else "FETCH_FAILED"
    return {**base, "discovery_status": discovery, "identity_status": "CANDIDATE", "pages": pages, "fields": fields}


def run(base: pathlib.Path, out: pathlib.Path, target_year: int = TARGET_YEAR, plan_only: bool = False, parent_inputs: pathlib.Path | None = None) -> dict[str, Any]:
    schools = read_base_schools(base, parent_inputs)
    if len(schools) != 1025:
        raise ValueError(f"Unexpected KG scope: {len(schools)}")
    if plan_only:
        result = {"schema": SCHEMA, "target_entry_year": target_year, "scope": "ALL_KG_PARENT_CARDS", "school_count": len(schools), "schools": schools, "capture_status": "PLAN_ONLY"}
        out.mkdir(parents=True, exist_ok=True); (out / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8"); return result
    out.mkdir(parents=True, exist_ok=True)
    fetcher = Fetcher(out)
    with ThreadPoolExecutor(max_workers=3) as pool:
        records = list(pool.map(lambda school: capture_school(school, fetcher, target_year), schools))
    result = {
        "schema": SCHEMA, "target_entry_year": target_year, "scope": "ALL_KG_PARENT_CARDS",
        "school_count": len(records), "captured_school_count": sum(bool(s["pages"]) for s in records),
        "candidate_school_count": sum(s["discovery_status"] == "CANDIDATE" for s in records),
        "checked_at": now(), "capture_status": "CAPTURED_WITH_EXPLICIT_GAPS", "schools": records,
        "policy": {"max_pages_per_school": MAX_PAGES_PER_SCHOOL, "max_document_bytes": MAX_DOCUMENT_BYTES, "retries": RETRIES, "official_hosts_only": True},
    }
    (out / "manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf8")
    return result
