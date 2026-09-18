#!/usr/bin/env python3
"""Phase 0 offline identity / schema-drift analysis over archived raw files.

Reads ONLY archive/<source_id>/<sha256>/raw.bin referenced by a probe report.
No network. Output: artifacts/probes/identity-<run_id>.json plus a console summary.

Questions answered (DEVELOPMENT.md §4.2, §12 Phase 0):
  * What is the real unique key of each file? (never assume SCHOOL NO. is unique)
  * Can CHSC profiles (no official ID) be joined to the EDB directory, and by what?
  * Which columns changed between the latest and previous edition?
  * What do the admission-date / fee columns actually look like?
"""
from __future__ import annotations

import csv
import io
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_csv(archive_path: str, delimiter: str, encoding: str) -> tuple[list[str], list[list[str]]]:
    data = (ROOT / archive_path / "raw.bin").read_bytes()
    text = data.decode(encoding)
    if text.startswith("﻿"):
        text = text[1:]
    rows = list(csv.reader(io.StringIO(text, newline=""), delimiter=delimiter))
    return rows[0], rows[1:]


def norm_name(s: str) -> str:
    """Conservative name normalisation for *candidate* matching only."""
    s = unicodedata.normalize("NFKC", s).strip().lower()
    s = re.sub(r"[\s　]+", "", s)
    s = re.sub(r"[()（）\[\]【】「」『』'’‘\"“”,.．·・\-–—/／&＆]", "", s)
    return s


def norm_phone(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def norm_url(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"^https?://", "", s)
    s = re.sub(r"^www\.", "", s)
    return s.rstrip("/")


def main() -> int:
    report_path = Path(sys.argv[1]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    T = {(t["source_id"], t["tag"]): t for t in report["targets"]}

    def csv_of(source_id: str, tag: str):
        t = T[(source_id, tag)]
        a = t["analysis"]
        return load_csv(t["archive_path"], a["delimiter"], a["encoding"]["decodes_as"])

    out: dict = {"based_on_probe": report["run_id"]}

    # ---------------------------------------------------------------- S01
    h, rows = csv_of("edb-school-directory", "csv-en-current")
    col = {name: i for i, name in enumerate(h)}
    s01 = {"data_rows": len(rows)}
    sn = [r[col["SCHOOL NO."]] for r in rows]
    s01["school_no_distinct"] = len(set(sn))
    s01["school_no_lengths"] = dict(Counter(len(x) for x in sn))
    s01["school_no_leading_zero"] = sum(1 for x in sn if x.startswith("0"))
    s01["school_no_all_digits"] = all(x.isdigit() for x in sn)
    dup = [k for k, v in Counter(sn).items() if v > 1]
    s01["school_no_duplicated_values"] = len(dup)
    # what differs among rows sharing a SCHOOL NO.?
    diff_cols = Counter()
    groups = defaultdict(list)
    for r in rows:
        groups[r[col["SCHOOL NO."]]].append(r)
    for k in dup:
        g = groups[k]
        for name, i in col.items():
            if len({r[i] for r in g}) > 1:
                diff_cols[name] += 1
    s01["columns_varying_within_duplicate_school_no"] = dict(diff_cols.most_common())
    for key in [("SCHOOL NO.", "SESSION"), ("SCHOOL NO.", "ENGLISH CATEGORY"), ("SCHOOL NO.", "SCHOOL LEVEL"), ("SCHOOL NO.", "SESSION", "ENGLISH CATEGORY"), ("SCHOOL NO.", "ENGLISH NAME", "SESSION")]:
        tuples = [tuple(r[col[c]] for c in key) for r in rows]
        s01[f"unique_by::{'+'.join(key)}"] = len(set(tuples)) == len(tuples)
        s01[f"distinct_by::{'+'.join(key)}"] = len(set(tuples))
    # candidate prefix structure of SCHOOL NO.
    s01["school_no_first6_distinct"] = len({x[:6] for x in sn})
    s01["school_no_first6_distinct_pairs_first6_session"] = len({(x[:6], r[col["SESSION"]]) for x, r in zip(sn, rows)})
    for c in ["ENGLISH CATEGORY", "SCHOOL LEVEL", "SESSION", "FINANCE TYPE", "STUDENTS GENDER", "DISTRICT"]:
        s01[f"values::{c}"] = dict(Counter(r[col[c]] for r in rows).most_common())
    s01["telephone_na_ratio"] = round(sum(1 for r in rows if r[col["TELEPHONE"]].strip().upper() in ("N.A.", "")) / len(rows), 4)
    s01["website_na_ratio"] = round(sum(1 for r in rows if r[col["WEBSITE"]].strip().upper() in ("N.A.", "")) / len(rows), 4)
    s01["distinct_placeholder_tokens"] = dict(Counter(v for r in rows for v in r if v.strip().upper() in ("N.A.", "NA", "N/A", "-", "--", "NIL", "NULL", "不適用")).most_common())
    out["S01_edb_school_directory"] = s01

    # ---------------------------------------------------------------- S02
    h2, rows2 = csv_of("edb-kg-profiles", "csv-tc-2025-26")
    h2e, rows2e = csv_of("edb-kg-profiles", "csv-en-2025-26")
    h2p, rows2p = csv_of("edb-kg-profiles", "csv-tc-2024-25-previous")
    c2 = {n: i for i, n in enumerate(h2)}
    s02 = {"data_rows_2025_26": len(rows2), "data_rows_2024_25": len(rows2p)}
    ids = [r[c2["學校編號"]] for r in rows2]
    locs = [r[c2["校址編號"]] for r in rows2]
    s02["school_no_distinct"] = len(set(ids))
    s02["school_no_lengths"] = dict(Counter(len(x) for x in ids))
    s02["school_no_leading_zero"] = sum(1 for x in ids if x.startswith("0"))
    s02["location_no_values"] = dict(Counter(locs).most_common())
    s02["unique_by::學校編號+校址編號"] = len({(a, b) for a, b in zip(ids, locs)}) == len(rows2)
    s02["header_identical_tc_2024_25_vs_2025_26"] = h2 == h2p
    s02["header_diff_added_in_2025_26"] = [x for x in h2 if x not in h2p]
    s02["header_diff_removed_in_2025_26"] = [x for x in h2p if x not in h2]
    s02["en_tc_column_count_equal"] = len(h2e) == len(h2)
    s02["en_header_sample"] = h2e[:12]
    s02["tc_en_zip_sample"] = list(zip(h2[:12], h2e[:12]))
    # rows: same (school_no, location_no) set between tc & en?
    c2e = {n: i for i, n in enumerate(h2e)}
    keys_tc = {(r[c2["學校編號"]], r[c2["校址編號"]]) for r in rows2}
    keys_en = {(r[c2e["school_no"]], r[c2e["location_no"]]) for r in rows2e}
    s02["tc_en_key_sets_equal"] = keys_tc == keys_en
    keys_prev = {(r[c2["學校編號"]], r[c2["校址編號"]]) for r in rows2p}
    s02["keys_only_in_2025_26"] = len(keys_tc - keys_prev)
    s02["keys_only_in_2024_25"] = len(keys_prev - keys_tc)
    # overlap with S01 SCHOOL NO. prefix?
    s01_first6 = {x[:6] for x in sn}
    s02["school_no_in_S01_first6"] = sum(1 for x in set(ids) if x in s01_first6)
    s02["school_no_in_S01_full12"] = sum(1 for x in set(ids) if x in set(sn))
    for c in ["開始申請日期", "結束申請日期", "申請表格類別", "申請時間類別", "學校類別", "學生類別", "參加幼稚園教育計劃", "收費水平_全年_半日", "收費水平_全年_全日", "其他核准收費_報名費", "註冊費_半日班", "註冊費_全日班", "地區"]:
        vals = [r[c2[c]] for r in rows2]
        cnt = Counter(vals)
        s02[f"values::{c}"] = {"distinct": len(cnt), "empty": cnt.get("", 0), "top": dict(cnt.most_common(8))}
    dates = [r[c2["開始申請日期"]] for r in rows2] + [r[c2["結束申請日期"]] for r in rows2]
    s02["date_format_patterns"] = dict(Counter(re.sub(r"\d", "9", d) for d in dates if d).most_common(10))
    out["S02_edb_kg_profiles"] = s02

    # ---------------------------------------------------------------- S03 / S04 helpers
    s01_by_level = defaultdict(list)
    for r in rows:
        s01_by_level[r[col["SCHOOL LEVEL"]]].append(r)

    def join_analysis(label: str, hdr: list[str], body: list[list[str]], name_col: str, tel_col: str, url_col: str, level: str) -> dict:
        ci = {n: i for i, n in enumerate(hdr)}
        s01_rows = s01_by_level.get(level, [])
        s01_names = defaultdict(list)
        for r in s01_rows:
            s01_names[norm_name(r[col["中文名稱"]])].append(r[col["SCHOOL NO."]])
        s01_tel = defaultdict(set)
        for r in s01_rows:
            p = norm_phone(r[col["TELEPHONE"]])
            if len(p) >= 8:
                s01_tel[p].add(r[col["SCHOOL NO."]][:6])
        s01_url = defaultdict(set)
        for r in s01_rows:
            u = norm_url(r[col["WEBSITE"]])
            if u and u != "n.a.":
                s01_url[u].add(r[col["SCHOOL NO."]][:6])
        res = {"rows": len(body), "s01_rows_same_level": len(s01_rows), "s01_level_value_used": level}
        exact = amb = miss = 0
        tel_hit = url_hit = 0
        both_agree = both_conflict = 0
        for r in body:
            n = norm_name(r[ci[name_col]])
            hits = s01_names.get(n, [])
            if len(hits) == 1:
                exact += 1
            elif len(hits) > 1:
                amb += 1
            else:
                miss += 1
            p = norm_phone(r[ci[tel_col]])
            th = s01_tel.get(p, set()) if len(p) >= 8 else set()
            if th:
                tel_hit += 1
            u = norm_url(r[ci[url_col]])
            uh = s01_url.get(u, set()) if u else set()
            if uh:
                url_hit += 1
            if hits and th:
                if {x[:6] for x in hits} & th:
                    both_agree += 1
                else:
                    both_conflict += 1
        res.update({"name_exact_unique_match": exact, "name_ambiguous_match": amb, "name_no_match": miss,
                    "telephone_match_to_s01": tel_hit, "website_match_to_s01": url_hit,
                    "name_and_phone_agree": both_agree, "name_and_phone_conflict": both_conflict})
        res["s01_names_duplicated_within_level"] = sum(1 for v in s01_names.values() if len(set(v)) > 1)
        return res

    # ---------------------------------------------------------------- S03
    h3, rows3 = csv_of("chsc-primary-profiles", "csv-tc-2025")
    h3e, rows3e = csv_of("chsc-primary-profiles", "csv-en-2025")
    h3p, rows3p = csv_of("chsc-primary-profiles", "csv-tc-2024-previous")
    c3 = {n: i for i, n in enumerate(h3)}
    s03 = {"data_rows_2025": len(rows3), "data_rows_2024": len(rows3p), "columns_2025": len(h3), "columns_2024": len(h3p)}
    s03["header_added_in_2025"] = [x for x in h3 if x not in h3p]
    s03["header_removed_in_2025"] = [x for x in h3p if x not in h3]
    s03["header_order_changed"] = [x for x in h3 if x in h3p] != [x for x in h3p if x in h3]
    s03["en_tc_column_count_equal"] = len(h3e) == len(h3)
    s03["tc_en_zip_sample"] = list(zip(h3[:14], h3e[:14]))
    s03["school_name_distinct"] = len({r[c3["學校名稱"]] for r in rows3})
    s03["school_name_unique"] = len({r[c3["學校名稱"]] for r in rows3}) == len(rows3)
    s03["names_only_in_2025"] = len({r[c3["學校名稱"]] for r in rows3} - {r[h3p.index("學校名稱")] for r in rows3p})
    s03["names_only_in_2024"] = len({r[h3p.index("學校名稱")] for r in rows3p} - {r[c3["學校名稱"]] for r in rows3})
    # tc<->en row alignment: same order? compare tel column
    c3e = {n: i for i, n in enumerate(h3e)}
    s03["tc_en_same_row_order_by_tel"] = [r[c3["學校電話"]] for r in rows3] == [r[c3e["school_tel"]] for r in rows3e]
    for c in ["區域", "小一學校網", "學校類別1", "學校類別2", "學生性別", "學費", "堂費", "家長教師會費", "非標準項目的核准收費", "教學語言", "一條龍中學", "直屬中學", "聯繫中學", "創校年份"]:
        if c in c3:
            cnt = Counter(r[c3[c]] for r in rows3)
            s03[f"values::{c}"] = {"distinct": len(cnt), "empty": cnt.get("", 0), "top": dict(cnt.most_common(6))}
    s03["join_to_S01"] = join_analysis("S03", h3, rows3, "學校名稱", "學校電話", "學校網址", "PRIMARY")
    s03["all_headers_2025"] = h3
    out["S03_chsc_primary_profiles"] = s03

    # ---------------------------------------------------------------- S04
    h4, rows4 = csv_of("chsc-secondary-profiles", "csv-tc-2025-2026")
    h4e, rows4e = csv_of("chsc-secondary-profiles", "csv-en-2025-2026")
    h4p, rows4p = csv_of("chsc-secondary-profiles", "csv-tc-2024-2025-previous")
    c4 = {n: i for i, n in enumerate(h4)}
    s04 = {"data_rows_2025_2026": len(rows4), "data_rows_2024_2025": len(rows4p), "columns_2025_2026": len(h4), "columns_2024_2025": len(h4p)}
    s04["header_added"] = [x for x in h4 if x not in h4p]
    s04["header_removed"] = [x for x in h4p if x not in h4]
    s04["en_tc_column_count_equal"] = len(h4e) == len(h4)
    s04["tc_en_zip_sample"] = list(zip(h4[:14], h4e[:14]))
    s04["school_name_unique"] = len({r[c4["學校名稱"]] for r in rows4}) == len(rows4)
    s04["names_only_in_2025_2026"] = sorted({r[c4["學校名稱"]] for r in rows4} - {r[h4p.index("學校名稱")] for r in rows4p})
    s04["names_only_in_2024_2025"] = sorted({r[h4p.index("學校名稱")] for r in rows4p} - {r[c4["學校名稱"]] for r in rows4})
    c4e = {n: i for i, n in enumerate(h4e)}
    s04["tc_en_same_row_order_by_tel"] = [r[c4["學校電話"]] for r in rows4] == [r[c4e["school_tel"]] for r in rows4e]
    for c in ["區域", "學校類別", "學生性別", "學費", "堂費", "家長教師會費", "非標準項目的核准收費", "教學語言政策", "創校年份", "宗教", "辦學團體", "一條龍小學", "直屬小學", "聯繫小學"]:
        if c in c4:
            cnt = Counter(r[c4[c]] for r in rows4)
            s04[f"values::{c}"] = {"distinct": len(cnt), "empty": cnt.get("", 0), "top": dict(cnt.most_common(6))}
    s04["join_to_S01"] = join_analysis("S04", h4, rows4, "學校名稱", "學校電話", "學校網址", "SECONDARY")
    s04["all_headers_2025_2026"] = h4
    out["S04_chsc_secondary_profiles"] = s04
    out["S02_all_headers_tc_2025_26"] = h2
    out["S02_all_headers_en_2025_26"] = h2e
    out["S01_all_headers"] = h

    dest = report_path.parent / f"identity-{report['run_id']}.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if not k.endswith("headers") and not k.endswith("headers_tc_2025_26") and not k.endswith("headers_en_2025_26")}, ensure_ascii=False, indent=1, default=str))
    print("written:", dest.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
