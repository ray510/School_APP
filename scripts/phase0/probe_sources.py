#!/usr/bin/env python3
"""Phase 0 read-only source probe for hk-school-guide.

Scope (DEVELOPMENT.md §12 Phase 0):
  * GET each explicitly reviewed official resource (no catalog-as-API guessing).
  * Preserve raw bytes + response headers + SHA-256 under archive/<source_id>/<sha256>/.
  * Parse CSV/JSON only to record the *actual* header row, row count and
    identifier-column uniqueness. No normalisation, no cloud writes.
  * Emit artifacts/probes/<run_id>.json as evidence.

This is a throwaway verification tool written in stdlib-only Python so that
Phase 0 does not depend on the not-yet-created pnpm workspace. The real
`pnpm school source probe` CLI (TypeScript) must reproduce the same raw hashes,
header lists and row counts as a regression baseline.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "hk-school-guide-phase0-probe/0.1 (read-only official open-data check)"
CONNECT_TIMEOUT_S = 10          # design value from DEVELOPMENT.md §3.3
REQUEST_TIMEOUT_S = 90          # relaxed for one-off full downloads; CLI design value is 30 s
MAX_RESPONSE_BYTES = 20 * 1024 * 1024  # 20 MiB local safety cap; abort (do not truncate) if exceeded
MAX_ATTEMPTS = 2
MAX_REDIRECTS = 3
CHUNK = 256 * 1024
ALLOWED_HOSTS = {"www.edb.gov.hk", "www.chsc.hk"}

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_DIR = ROOT / "archive"
PROBE_DIR = ROOT / "artifacts" / "probes"

# Explicitly reviewed targets. resource_id = data.gov.hk resource UUID (data-id attribute
# on the catalog page, captured 2026-09-18). declared_size = data-size attribute.
TARGETS: list[dict] = [
    # S01 -------------------------------------------------------------------
    {"source_id": "edb-school-directory", "tag": "csv-en-current", "kind": "csv", "language": "en+zh",
     "resource_id": "730bb98d-89b4-4c1b-9dd5-5033c686e24a", "declared_size": 1910257,
     "catalog_url": "https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information",
     "declared_url": "http://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.csv",
     "edition_label": None},
    {"source_id": "edb-school-directory", "tag": "json-en-current", "kind": "json", "language": "en+zh",
     "resource_id": "71b4483b-db8d-4f9d-a4ae-5278a64e2cdb", "declared_size": 4313050,
     "catalog_url": "https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information",
     "declared_url": "http://www.edb.gov.hk/attachment/en/student-parents/sch-info/sch-search/sch-location-info/SCH_LOC_EDB.json",
     "edition_label": None},
    {"source_id": "edb-school-directory", "tag": "dataspec-pdf-en", "kind": "pdf", "language": "en",
     "resource_id": None, "declared_size": None,
     "catalog_url": "https://data.gov.hk/en-data/dataset/hk-edb-schinfo-school-location-and-information",
     "declared_url": "http://www.edb.gov.hk/attachment/en/student-parents/sch-info/datagovhk/DataSpec_School_Location_and_Information_en.pdf",
     "edition_label": None},
    # S02 -------------------------------------------------------------------
    {"source_id": "edb-kg-profiles", "tag": "csv-tc-2025-26", "kind": "csv", "language": "tc",
     "resource_id": "5fadbca7-4b66-4025-b167-44e1466784c5", "declared_size": 2772515,
     "catalog_url": "https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile",
     "declared_url": "http://www.edb.gov.hk/attachment/tc/edu-system/preprimary-kindergarten/free-quality-kg-edu/KGP_2025_tc.csv",
     "edition_label": "幼稚園及幼稚園暨幼兒中心概覽2025/26（繁體中文）"},
    {"source_id": "edb-kg-profiles", "tag": "csv-en-2025-26", "kind": "csv", "language": "en",
     "resource_id": "9e16fb7a-8478-4144-8df6-cd32a787510c", "declared_size": 6679550,
     "catalog_url": "https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile",
     "declared_url": "http://www.edb.gov.hk/attachment/en/edu-system/preprimary-kindergarten/free-quality-kg-edu/KGP_2025_en.csv",
     "edition_label": "Profile of Kindergartens and Kindergarten-cum-Child Care Centres 2025/26 (English)"},
    {"source_id": "edb-kg-profiles", "tag": "csv-tc-2024-25-previous", "kind": "csv", "language": "tc",
     "resource_id": "4a1885d1-2b64-46da-be4f-5dc4e8b78526", "declared_size": 2748644,
     "catalog_url": "https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile",
     "declared_url": "http://www.edb.gov.hk/attachment/tc/edu-system/preprimary-kindergarten/free-quality-kg-edu/KGP_2024_tc.csv",
     "edition_label": "幼稚園及幼稚園暨幼兒中心概覽2024/25（繁體中文）"},
    {"source_id": "edb-kg-profiles", "tag": "dataspec-pdf-tc", "kind": "pdf", "language": "tc",
     "resource_id": None, "declared_size": None,
     "catalog_url": "https://data.gov.hk/tc-data/dataset/hk-edb-kgjoinkes-kg-profile",
     "declared_url": "https://www.edb.gov.hk/attachment/datagovhk/DataSpec_KGs_and_KG-cum-CCCs_Profiles_tc.pdf",
     "edition_label": None},
    # S03 -------------------------------------------------------------------
    {"source_id": "chsc-primary-profiles", "tag": "csv-tc-2025", "kind": "csv", "language": "tc",
     "resource_id": "b329534e-ef92-4a2a-be44-46cb4fbbe2f1", "declared_size": 3649751,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/psp_2025_tc.csv",
     "edition_label": "小學概覽2025(繁體中文)"},
    {"source_id": "chsc-primary-profiles", "tag": "csv-en-2025", "kind": "csv", "language": "en",
     "resource_id": "e455f9e0-f2fc-45e7-82cf-1313792a4566", "declared_size": 4867213,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/psp_2025_en.csv",
     "edition_label": "Primary School Profiles 2025 (English)"},
    {"source_id": "chsc-primary-profiles", "tag": "csv-tc-2024-previous", "kind": "csv", "language": "tc",
     "resource_id": "be7940f2-1c41-4bfa-bd93-26141c59dfdd", "declared_size": 3534815,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/psp_2024_tc.csv",
     "edition_label": "小學概覽2024(繁體中文)"},
    {"source_id": "chsc-primary-profiles", "tag": "csv-en-2024-previous", "kind": "csv", "language": "en",
     "resource_id": "05592b2d-57e4-4fbc-9b80-1a1cd3da5654", "declared_size": 4687695,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/psp_2024_en.csv",
     "edition_label": "Primary School Profiles 2024 (English)"},
    {"source_id": "chsc-primary-profiles", "tag": "dataspec-pdf-en", "kind": "pdf", "language": "en",
     "resource_id": None, "declared_size": None,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-primary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/DataSpec_Information_of_Primary_School_Profiles_EN.pdf",
     "edition_label": None},
    # S04 -------------------------------------------------------------------
    {"source_id": "chsc-secondary-profiles", "tag": "csv-tc-2025-2026", "kind": "csv", "language": "tc",
     "resource_id": "c6e32705-7c70-4203-b77f-5a28c813e57a", "declared_size": 5808977,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/ssp_2025_2026_tc.csv",
     "edition_label": "中學概覽2025/2026(繁體中文)"},
    {"source_id": "chsc-secondary-profiles", "tag": "csv-en-2025-2026", "kind": "csv", "language": "en",
     "resource_id": "905e42f8-527a-4333-808d-c61eae82ceff", "declared_size": 7561630,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/ssp_2025_2026_en.csv",
     "edition_label": "Secondary School Profiles 2025/2026 (English)"},
    {"source_id": "chsc-secondary-profiles", "tag": "csv-tc-2024-2025-previous", "kind": "csv", "language": "tc",
     "resource_id": "c8193d71-12da-42c0-a689-27793b3207a3", "declared_size": 5751017,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/ssp_2024_2025_tc.csv",
     "edition_label": "中學概覽2024/2025(繁體中文)"},
    {"source_id": "chsc-secondary-profiles", "tag": "csv-en-2024-2025-previous", "kind": "csv", "language": "en",
     "resource_id": "6cc7369b-cad0-4f32-8cbf-ff15931eb3b1", "declared_size": 7400884,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/ssp_2024_2025_en.csv",
     "edition_label": "Secondary School Profiles 2024/2025 (English)"},
    {"source_id": "chsc-secondary-profiles", "tag": "dataspec-pdf-en", "kind": "pdf", "language": "en",
     "resource_id": None, "declared_size": None,
     "catalog_url": "https://data.gov.hk/en-data/dataset/chsc-chsc-secondary-school-profiles",
     "declared_url": "https://www.chsc.hk/datagovhk/DataSpec_Information_of_Secondary_School_Profiles_EN.pdf",
     "edition_label": None},
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class _NoCrossHostRedirect(urllib.request.HTTPRedirectHandler):
    """Allow only same-host http->https upgrades and cap redirect count."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        from urllib.parse import urlparse
        old, new = urlparse(req.full_url), urlparse(newurl)
        if new.hostname != old.hostname or new.hostname not in ALLOWED_HOSTS:
            raise urllib.error.HTTPError(newurl, code, f"cross-host redirect refused: {old.hostname} -> {new.hostname}", headers, fp)
        if new.scheme not in ("http", "https"):
            raise urllib.error.HTTPError(newurl, code, "non-http redirect refused", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url: str) -> dict:
    """GET url with bounded size, returning metadata + bytes (or error)."""
    from urllib.parse import urlparse
    host = urlparse(url).hostname
    if host not in ALLOWED_HOSTS:
        return {"ok": False, "error": f"host not allowlisted: {host}"}
    opener = urllib.request.build_opener(_NoCrossHostRedirect())
    attempts: list[dict] = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = utc_now(); t0 = time.monotonic()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
        try:
            with opener.open(req, timeout=CONNECT_TIMEOUT_S) as resp:
                hdrs = {k.lower(): v for k, v in resp.headers.items()}
                declared_len = int(hdrs["content-length"]) if hdrs.get("content-length", "").isdigit() else None
                if declared_len is not None and declared_len > MAX_RESPONSE_BYTES:
                    return {"ok": False, "error": f"content-length {declared_len} exceeds cap {MAX_RESPONSE_BYTES}", "attempts": attempts,
                            "http_status": resp.status, "headers": hdrs, "final_url": resp.geturl()}
                buf = io.BytesIO(); total = 0
                while True:
                    if time.monotonic() - t0 > REQUEST_TIMEOUT_S:
                        raise TimeoutError(f"request exceeded {REQUEST_TIMEOUT_S}s")
                    chunk = resp.read(CHUNK)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > MAX_RESPONSE_BYTES:
                        return {"ok": False, "error": f"body exceeded cap {MAX_RESPONSE_BYTES} (aborted, not truncated)", "attempts": attempts,
                                "http_status": resp.status, "headers": hdrs, "final_url": resp.geturl()}
                    buf.write(chunk)
                data = buf.getvalue()
                return {"ok": True, "http_status": resp.status, "headers": hdrs, "final_url": resp.geturl(),
                        "bytes": data, "duration_s": round(time.monotonic() - t0, 3), "fetched_at": started,
                        "attempt": attempt, "attempts": attempts}
        except urllib.error.HTTPError as e:
            body = b""
            try:
                body = e.read(4096)
            except Exception:  # noqa: BLE001
                pass
            attempts.append({"attempt": attempt, "started": started, "error": f"HTTP {e.code} {e.reason}", "body_head": body[:300].decode("utf-8", "replace")})
            if e.code < 500:
                break
        except Exception as e:  # noqa: BLE001
            attempts.append({"attempt": attempt, "started": started, "error": f"{type(e).__name__}: {e}"})
        time.sleep(2 * attempt)
    return {"ok": False, "error": "all attempts failed", "attempts": attempts}


def sniff_encoding(data: bytes) -> dict:
    """Detect encoding from BOM first, then by trial decode. Never guess silently."""
    head = data[:4]
    info = {"crlf": b"\r\n" in data[:200000], "nul_bytes": b"\x00" in data[:200000]}
    if head.startswith(b"\xef\xbb\xbf"):
        info.update(bom="utf-8", decodes_as="utf-8-sig")
    elif head.startswith(b"\xff\xfe") and not head.startswith(b"\xff\xfe\x00\x00"):
        info.update(bom="utf-16-le", decodes_as="utf-16")   # python 'utf-16' honours the BOM
    elif head.startswith(b"\xfe\xff"):
        info.update(bom="utf-16-be", decodes_as="utf-16")
    else:
        info["bom"] = None
        try:
            data.decode("utf-8")
            info["decodes_as"] = "utf-8"
        except UnicodeDecodeError as e:
            info["decodes_as"] = None
            info["utf8_error"] = str(e)[:200]
    if info.get("decodes_as"):
        try:
            data.decode(info["decodes_as"])
        except UnicodeDecodeError as e:
            info["decodes_as"] = None
            info["decode_error"] = str(e)[:200]
    return info


def choose_delimiter(text: str) -> dict:
    """Pick the delimiter whose header count matches the first data lines.

    csv.Sniffer mis-detects the caret-delimited EDB KG profile, so we test
    candidates explicitly and record the evidence instead of trusting a heuristic.
    """
    lines = text.splitlines()
    header = lines[0] if lines else ""
    probe_lines = [l for l in lines[1:41] if l.strip()]
    results = {}
    for d in [",", "^", "\t", ";", "|"]:
        hc = header.count(d)
        if hc == 0:
            continue
        # count using the csv module so quoted delimiters are not counted
        try:
            widths = [len(next(csv.reader([l], delimiter=d))) for l in probe_lines]
        except csv.Error:
            widths = []
        consistent = sum(1 for w in widths if w == hc + 1)
        results[d] = {"header_fields": hc + 1, "consistent_probe_lines": consistent, "probe_lines": len(widths)}
    if not results:
        return {"delimiter": ",", "evidence": results, "confidence": "none"}
    best = max(results.items(), key=lambda kv: (kv[1]["consistent_probe_lines"], kv[1]["header_fields"]))
    conf = "high" if best[1]["probe_lines"] and best[1]["consistent_probe_lines"] == best[1]["probe_lines"] else "low"
    return {"delimiter": best[0], "evidence": results, "confidence": conf}


def analyse_csv(data: bytes) -> dict:
    enc = sniff_encoding(data)
    if not enc.get("decodes_as"):
        return {"encoding": enc, "parse": "NOT_RUN (undecodable)"}
    text = data.decode(enc["decodes_as"])
    if text.startswith("﻿"):
        text = text[1:]
    delim_info = choose_delimiter(text)
    delimiter = delim_info["delimiter"]
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    rows = list(reader)
    if not rows:
        return {"encoding": enc, "parse": "empty"}
    header = rows[0]
    body = rows[1:]
    widths = {}
    for r in body:
        widths[len(r)] = widths.get(len(r), 0) + 1
    embedded_newline_rows = sum(1 for r in body if any("\n" in c or "\r" in c for c in r))
    dup_headers = sorted({h for h in header if header.count(h) > 1})
    empty_headers = sum(1 for h in header if h.strip() == "")
    # column fill ratios + identifier candidates
    ncol = len(header)
    filled = [0] * ncol
    for r in body:
        for i in range(min(ncol, len(r))):
            if r[i].strip() != "":
                filled[i] += 1
    n = len(body) or 1
    columns = []
    for i, h in enumerate(header):
        vals = [r[i] for r in body if i < len(r)]
        nonempty = [v for v in vals if v.strip() != ""]
        distinct = len(set(nonempty))
        col = {"index": i, "name": h, "fill_ratio": round(filled[i] / n, 4), "distinct_nonempty": distinct}
        if nonempty:
            col["unique_among_nonempty"] = distinct == len(nonempty)
            col["max_len"] = max(len(v) for v in nonempty)
            col["all_numeric"] = all(v.strip().lstrip("-").replace(".", "", 1).isdigit() for v in nonempty)
            col["leading_zero_values"] = sum(1 for v in nonempty if len(v.strip()) > 1 and v.strip()[0] == "0" and v.strip().isdigit())
            col["example"] = nonempty[0][:80]
        columns.append(col)
    return {"encoding": enc, "delimiter": delimiter, "delimiter_detection": delim_info, "header_count": ncol, "data_rows": len(body),
            "row_width_histogram": {str(k): v for k, v in sorted(widths.items())},
            "rows_with_embedded_newlines": embedded_newline_rows, "duplicate_header_names": dup_headers,
            "empty_header_names": empty_headers, "header": header, "columns": columns}


def analyse_json(data: bytes) -> dict:
    enc = sniff_encoding(data)
    try:
        obj = json.loads(data.decode("utf-8-sig"))
    except Exception as e:  # noqa: BLE001
        return {"encoding": enc, "parse_error": str(e)[:200]}
    out = {"encoding": enc, "top_level_type": type(obj).__name__}
    if isinstance(obj, list):
        out["length"] = len(obj)
        keys = {}
        for item in obj:
            if isinstance(item, dict):
                for k in item:
                    keys[k] = keys.get(k, 0) + 1
        out["keys_with_counts"] = keys
        out["first_item_preview"] = {k: (str(v)[:60]) for k, v in (obj[0].items() if obj and isinstance(obj[0], dict) else [])}
    elif isinstance(obj, dict):
        out["keys"] = list(obj.keys())[:50]
    return out


def analyse_bytes(kind: str, data: bytes) -> dict:
    if kind == "csv":
        return analyse_csv(data)
    if kind == "json":
        return analyse_json(data)
    if kind == "pdf":
        return {"is_pdf_magic": data[:5] == b"%PDF-", "text_extraction": "NOT_RUN (no PDF parser in Phase 0 probe)"}
    return {}


def reanalyse(report_path: Path) -> int:
    """Offline mode: re-run analysis over already archived raw bytes (no network)."""
    report = json.loads(report_path.read_text(encoding="utf-8"))
    for t in report["targets"]:
        if not t.get("archive_path"):
            continue
        raw = (ROOT / t["archive_path"] / "raw.bin").read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        if sha != t["sha256"]:
            t["status"] = "BLOCKED"
            t["error"] = f"archive hash mismatch: {sha} != {t['sha256']}"
            continue
        t["analysis"] = analyse_bytes(t["kind"], raw)
        t["reanalysed_at"] = utc_now()
        print(f"[{t['source_id']}] {t['tag']} reanalysed (sha ok)", flush=True)
    report.setdefault("reanalysis_runs", []).append({"at": utc_now(), "tool_version": "probe_sources.py offline reanalyse"})
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"report updated: {report_path.relative_to(ROOT)}")
    return 0


def probe_target(t: dict, run_id: str) -> dict:
    """Fetch one target, archive raw bytes on success, return the report entry."""
    print(f"[{t['source_id']}] {t['tag']} ...", flush=True)
    res = fetch(t["declared_url"])
    entry = {k: v for k, v in t.items()}
    entry["run_id"] = run_id
    entry["fetched_at"] = res.get("fetched_at") or utc_now()
    entry["http_status"] = res.get("http_status")
    entry["final_url"] = res.get("final_url")
    entry["attempts_log"] = res.get("attempts", [])
    if not res.get("ok"):
        entry["status"] = "BLOCKED"
        entry["error"] = res.get("error")
        print(f"   BLOCKED: {entry['error']}", flush=True)
        return entry
    data: bytes = res["bytes"]
    hdrs = res["headers"]
    sha = hashlib.sha256(data).hexdigest()
    ct = hdrs.get("content-type", "")
    entry.update({"content_type": ct, "content_length_header": hdrs.get("content-length"), "last_modified": hdrs.get("last-modified"),
                  "etag": hdrs.get("etag"), "cache_control": hdrs.get("cache-control"), "bytes": len(data), "sha256": sha,
                  "duration_s": res["duration_s"], "attempt": res["attempt"],
                  "size_matches_catalog": (t["declared_size"] is None) or (t["declared_size"] == len(data))})
    looks_html = data[:512].lstrip().lower().startswith((b"<!doctype html", b"<html"))
    entry["body_looks_like_html"] = looks_html
    if looks_html and t["kind"] != "html":
        entry["status"] = "BLOCKED"
        entry["error"] = "HTTP 200 but body is HTML (error page?)"
        return entry
    adir = ARCHIVE_DIR / t["source_id"] / sha
    adir.mkdir(parents=True, exist_ok=True)
    (adir / "raw.bin").write_bytes(data)
    meta = {"source_id": t["source_id"], "tag": t["tag"], "resource_id": t["resource_id"], "declared_url": t["declared_url"],
            "final_url": res["final_url"], "fetched_at": entry["fetched_at"], "http_status": res["http_status"], "headers": hdrs,
            "sha256": sha, "bytes": len(data), "run_id": run_id, "user_agent": USER_AGENT}
    (adir / "metadata.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    entry["archive_path"] = str(adir.relative_to(ROOT)).replace("\\", "/")
    entry["analysis"] = analyse_bytes(t["kind"], data)
    entry["status"] = "FETCHED"
    print(f"   {res['http_status']} {ct} {len(data)} bytes sha256={sha[:12]}... in {res['duration_s']}s", flush=True)
    return entry


def main() -> int:
    args = sys.argv[1:]
    if len(args) >= 2 and args[0] == "--reanalyse":
        return reanalyse(Path(args[1]).resolve())
    PROBE_DIR.mkdir(parents=True, exist_ok=True)
    if len(args) >= 4 and args[0] == "--append" and args[2] == "--tags":
        # Fetch only the named tags and append them to an existing report (used for follow-up evidence).
        report_path = Path(args[1]).resolve()
        report = json.loads(report_path.read_text(encoding="utf-8"))
        wanted = set(args[3].split(","))
        run_id = datetime.now(timezone.utc).strftime("phase0-%Y%m%dT%H%M%SZ")
        existing = {(t["source_id"], t["tag"]) for t in report["targets"]}
        for t in TARGETS:
            if t["tag"] in wanted and (t["source_id"], t["tag"]) not in existing:
                report["targets"].append(probe_target(t, run_id))
        report.setdefault("append_runs", []).append({"run_id": run_id, "tags": sorted(wanted), "at": utc_now()})
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"report updated: {report_path.relative_to(ROOT)}")
        return 0
    run_id = datetime.now(timezone.utc).strftime("phase0-%Y%m%dT%H%M%SZ")
    report = {"run_id": run_id, "started_at": utc_now(), "tool": "scripts/phase0/probe_sources.py", "mode": "read-only",
              "limits": {"connect_timeout_s": CONNECT_TIMEOUT_S, "request_timeout_s": REQUEST_TIMEOUT_S, "max_response_bytes": MAX_RESPONSE_BYTES,
                         "max_attempts": MAX_ATTEMPTS, "per_host_concurrency": 1, "allowlisted_hosts": sorted(ALLOWED_HOSTS)},
              "targets": [probe_target(t, run_id) for t in TARGETS]}
    report["finished_at"] = utc_now()
    out = PROBE_DIR / f"{run_id}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"report: {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
