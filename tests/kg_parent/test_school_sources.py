import unittest
import json
import http.client
import tempfile
import urllib.error
from pathlib import Path
from unittest.mock import patch

from scripts.kg_parent.build import reuse_profile_results
from scripts.kg_parent.school_sources import (
    content_sha256,
    capture_school,
    decode_html,
    document_key,
    discover_links,
    extract_facts,
    failure_reason,
    Fetcher,
    field_states,
    is_target_year,
    read_base_schools,
    require_public_host,
    run,
    safe_https_url,
    school_https_root,
    school_https_roots,
)


class SchoolSources(unittest.TestCase):
    def test_completed_selection_is_remapped_only_for_the_exact_profile(self):
        profile = {"fields": {"課程": "遊戲中學習"}, "record_sha256": "a" * 64}
        prepared = {"records": [{"id": "new-id", "profile": profile}]}
        result = {"id": "old-id", "profile_hash": "a" * 64, "selections": {"learning": {"evidence": {"field": "課程", "text": "遊戲中學習", "record_sha256": "a" * 64}}}}
        self.assertEqual(reuse_profile_results(prepared, [result])[0]["id"], "new-id")
        result["selections"]["learning"]["evidence"]["text"] = "已改內容"
        with self.assertRaisesRegex(ValueError, "Source quote mismatch"):
            reuse_profile_results(prepared, [result])

    def test_generic_guidance_is_removed_from_reused_selections(self):
        profile = {"fields": {"申請方法": "請瀏覽學校網頁"}, "record_sha256": "a" * 64}
        prepared = {"records": [{"id": "school", "profile": profile}]}
        result = {"id": "school", "profile_hash": "a" * 64, "selections": {"admission": {"state": "SUPPORTED", "evidence": {"field": "申請方法", "text": "請瀏覽學校網頁", "record_sha256": "a" * 64}}}}
        selection = reuse_profile_results(prepared, [result])[0]["selections"]["admission"]
        self.assertEqual(selection["state"], "NOT_ESTABLISHED")
        self.assertIsNone(selection["evidence"])

    def test_target_year_is_explicit(self):
        self.assertTrue(is_target_year("2027/28 K1 入學申請"))
        self.assertTrue(is_target_year("2027 至 2028 學年 K1 入學申請"))
        self.assertFalse(is_target_year("2026/27 K1 入學申請"))

    def test_private_literal_and_ports_are_rejected(self):
        self.assertIsNone(safe_https_url("https://127.0.0.1/admission", "127.0.0.1"))
        self.assertIsNone(safe_https_url("https://school.example:8443/admission", "school.example"))

    def test_registered_http_school_url_is_only_fetched_as_https(self):
        self.assertEqual(
            school_https_root("http://www.school.example/admission"),
            ("https://www.school.example/admission", "www.school.example"),
        )

    def test_registered_school_url_has_bounded_https_root_fallbacks(self):
        self.assertEqual(
            school_https_roots("http://school.example/admission?lang=zh"),
            ([
                "https://school.example/admission?lang=zh",
                "https://school.example/",
                "https://www.school.example/admission?lang=zh",
                "https://www.school.example/",
            ], "school.example"),
        )

    def test_capture_uses_safe_root_fallback_and_keeps_failed_attempt(self):
        class FakeFetcher:
            def __init__(self):
                self.calls = []

            def fetch(self, url, base_host):
                self.calls.append(url)
                if len(self.calls) == 1:
                    return {"url": url, "capture_status": "FETCH_FAILED", "reason_code": "HTTP_403", "checked_at": "2026-09-21T00:00:00+00:00"}
                return {"url": url, "capture_status": "CAPTURED", "facts": {}, "discovered_links": []}

        fetcher = FakeFetcher()
        result = capture_school({"school_id": "school", "name": "甲幼稚園", "address": "甲街", "website": "https://school.example/admission"}, fetcher)

        self.assertEqual(fetcher.calls, ["https://school.example/admission", "https://school.example/"])
        self.assertEqual(result["discovery_status"], "REVIEW")
        self.assertEqual(result["fetch_failures"][0]["reason_code"], "HTTP_403")

    def test_school_without_registered_website_has_explicit_reason(self):
        result = capture_school({"school_id": "school", "name": "甲幼稚園", "address": "甲街", "website": ""}, object())
        self.assertEqual(result["discovery_status"], "NOT_FOUND")
        self.assertEqual(result["reason_code"], "NO_REGISTERED_SCHOOL_WEBSITE")
        self.assertEqual(result["reason"], "年度校情資料未有登記學校網址")

    def test_private_dns_result_is_rejected_before_fetch(self):
        with patch("scripts.kg_parent.school_sources.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.1", 443))]):
            with self.assertRaisesRegex(ValueError, "NON_PUBLIC_HOST"):
                require_public_host("school.example")

    def test_declared_big5_page_is_decoded(self):
        text = "2027/28 幼兒班報名".encode("big5hkscs")
        self.assertEqual(decode_html(text, "text/html; charset=big5"), "2027/28 幼兒班報名")

    def test_discovery_is_same_host_and_bounded(self):
        raw = '''<a href="/admission">2027/28 K1 報名</a><a href="https://other.example/admission">2027/28 報名</a><a href="/noise">首頁</a>'''.encode()
        self.assertEqual(discover_links(raw, "https://school.example/", limit=5), ["https://school.example/admission"])

    def test_generic_guidance_is_not_evidence(self):
        facts = extract_facts("申請表格：請瀏覽學校網頁\n2027/28 K1 收表日期：2026年9月1日", "https://school.example/", target_year=2027)
        self.assertEqual(len(facts["application"]), 1)
        self.assertIn("2026年9月1日", facts["application"][0]["evidence_excerpt"])

    def test_form_link_year_is_local_and_unrelated_links_are_excluded(self):
        facts = extract_facts(
            "2027/28 K1 招生公告\n其他內容",
            "https://school.example/",
            links=[
                ("/gallery/71", "K1 校園活動"),
                ("/", "2027/28 申請表"),
                ("/?section=forms", "2027/28 申請表"),
                ("#tab-fee", "2027/28 申請表"),
                ("/forms/k1-application-form.pdf", "K1 申請表"),
                ("/forms/2027-2028-application-form.pdf", "K1 申請表"),
                ("/forms/2026-2027-application-form.pdf", "2026/27 申請表"),
            ],
        )

        self.assertEqual(
            [e["value"] for e in facts["form"]],
            [
                "https://school.example/forms/k1-application-form.pdf",
                "https://school.example/forms/2027-2028-application-form.pdf",
                "https://school.example/forms/2026-2027-application-form.pdf",
            ],
        )
        self.assertIsNone(facts["form"][0]["target_year"])
        self.assertEqual(facts["form"][1]["target_year"], 2027)
        self.assertIsNone(facts["form"][2]["target_year"])
        no_year_form = {"form": [facts["form"][0]]}
        self.assertEqual(field_states([{"facts": no_year_form}], 0)["form"]["status"], "REVIEW")

    def test_submission_and_office_times_are_application_evidence_not_class_hours(self):
        facts = extract_facts(
            "2027/28 K1 招生公告\n"
            "上課時間：全日班 09:00至16:30\n"
            "其他說明\n"
            "收表時間：星期六 09:00至13:00\n"
            "辦公時間：星期一 09:00至17:00",
            "https://school.example/admission",
        )

        self.assertEqual([e["value"] for e in facts["hours"]], ["上課時間：全日班 09:00至16:30"])
        self.assertEqual(
            {e["hour_kind"] for e in facts["application"] if e["field"] == "application_submission_hours"},
            {"submission", "office"},
        )

    def test_event_time_near_class_word_is_not_class_hours(self):
        facts = extract_facts(
            "2027/28 Admissions\nIn-Class Experiential Day\nThursday, 8th October 2026 | 5–6:30 pm | Island West Campus",
            "https://school.example/admission",
        )
        self.assertEqual(facts.get("hours", []), [])

    def test_fee_kind_keeps_non_tuition_amounts_out_of_fee_candidates(self):
        facts = extract_facts(
            "2027/28 K1 收生\n"
            "報名費 $40\n"
            "註冊費 $1,570\n"
            "回郵信封及 $2.4 郵票\n"
            "其他費用 $100\n"
            "學費 HK$10,000\n"
            "膳食 HK$800",
            "https://school.example/admission",
        )

        self.assertEqual({e["fee_kind"] for e in facts["fees"]}, {"tuition", "meal"})
        self.assertEqual(
            {e["fee_kind"] for e in facts["application"] if "fee_kind" in e},
            {"application", "registration", "postage"},
        )
        self.assertNotIn("其他費用 $100", [e["value"] for e in facts["fees"]])
        non_tuition = extract_facts("2027/28 K1 收生\n報名費 $40", "https://school.example/admission")
        self.assertEqual(field_states([{"facts": non_tuition}], 0)["fees"]["status"], "NOT_FOUND")

    def test_evidence_is_deduplicated_and_target_evidence_is_displayed_first(self):
        facts = extract_facts(
            "2026/27 K1 學費 HK$10,000\n其他\n其他\n2027/28 K1 學費 HK$11,000",
            "https://school.example/admission/",
        )
        duplicate = dict(facts["fees"][-1], url="https://school.example/admission/")
        states = field_states([{"facts": {"fees": facts["fees"] + [duplicate]}}], 0)

        self.assertEqual(states["fees"]["total_evidence_count"], 2)
        self.assertEqual(states["fees"]["target_evidence_count"], 1)
        self.assertEqual(states["fees"]["evidence_count"], 2)
        self.assertEqual(len(states["fees"]["evidence"]), 2)
        self.assertEqual(states["fees"]["evidence"][0]["target_year"], 2027)

    def test_capture_skips_duplicate_root_urls_after_canonicalization(self):
        class FakeFetcher:
            def __init__(self):
                self.calls = []

            def fetch(self, url, base_host):
                self.calls.append(url)
                if len(self.calls) == 1:
                    return {
                        "url": "https://school.example",
                        "capture_status": "CAPTURED",
                        "facts": {},
                        "discovered_links": ["https://school.example/", "https://school.example/admission/"],
                    }
                return {"url": url, "capture_status": "CAPTURED", "facts": {}, "discovered_links": []}

        fetcher = FakeFetcher()
        capture_school({"school_id": "school", "name": "甲幼稚園", "address": "甲街", "website": "https://school.example/"}, fetcher)
        self.assertEqual(fetcher.calls, ["https://school.example/", "https://school.example/admission"])

    def test_prior_year_is_review_not_target_candidate(self):
        facts = extract_facts("2026/27 K1 學費 HK$10,000；上課時間 09:00 至 13:00", "https://school.example/")
        states = field_states([{"facts": facts}], 0)
        self.assertEqual(states["fees"]["status"], "REVIEW")
        self.assertEqual(states["hours"]["status"], "REVIEW")
        self.assertIsNone(states["fees"]["reference_year"])

    def test_provenance_hash_is_exact(self):
        raw = "2027/28 K1".encode()
        self.assertEqual(content_sha256(raw), content_sha256(raw))
        self.assertNotEqual(content_sha256(raw), content_sha256(b"changed"))

    def test_document_path_changes_with_captured_bytes(self):
        self.assertNotEqual(document_key(b"first", False), document_key(b"changed", False))
        self.assertNotEqual(document_key(b"first", False), document_key(b"first", True))

    def test_root_fetch_failure_is_provenance_not_a_page_or_evidence(self):
        class FailedFetcher:
            def fetch(self, url, base_host):
                return {
                    "url": "https://school.example/admission?token=secret",
                    "capture_status": "FETCH_FAILED",
                    "reason_code": "HOST_RESOLUTION_FAILED",
                    "reason": "raw secret should not be retained",
                    "checked_at": "2026-09-21T00:00:00+00:00",
                }

        result = capture_school({"school_id": "school", "name": "甲幼稚園", "address": "甲街", "website": "https://school.example/"}, FailedFetcher())

        self.assertEqual(result["discovery_status"], "FETCH_FAILED")
        self.assertEqual(result["pages"], [])
        self.assertEqual(result["fields"]["application"]["evidence"], [])
        self.assertEqual(len(result["fetch_failures"]), 2)
        self.assertEqual(result["fetch_failures"][0], {
            "checked_url": "https://school.example/admission?token=%5BREDACTED%5D",
            "checked_at": "2026-09-21T00:00:00+00:00",
            "reason_code": "HOST_RESOLUTION_FAILED",
            "reason": "來源主機無法解析",
        })

    def test_fetch_failure_reason_is_stable_bounded_and_redacts_query_secret(self):
        with tempfile.TemporaryDirectory() as directory:
            fetcher = Fetcher(Path(directory))
            with patch("scripts.kg_parent.school_sources.require_public_host", side_effect=ValueError("NON_PUBLIC_HOST")), patch("scripts.kg_parent.school_sources.time.sleep"):
                result = fetcher.fetch("https://school.example/admission?api_key=secret", "school.example")

        self.assertEqual(result["capture_status"], "FETCH_FAILED")
        self.assertEqual(result["reason_code"], "NON_PUBLIC_HOST")
        self.assertEqual(result["reason"], "來源主機不是公開網絡位址")
        self.assertEqual(result["checked_url"], "https://school.example/admission?api_key=%5BREDACTED%5D")
        self.assertNotIn("secret", result["reason"])

    def test_http_failure_keeps_specific_status(self):
        self.assertEqual(failure_reason(urllib.error.HTTPError("https://school.example", 403, "Forbidden", {}, None)), ("HTTP_403", "來源拒絕自動擷取（HTTP 403）"))
        self.assertEqual(failure_reason(http.client.IncompleteRead(b"", 1)), ("HTTP_PROTOCOL_ERROR", "來源 HTTP 傳輸中斷"))

    def test_manifest_aggregates_failure_reason_counts(self):
        schools = [{"school_id": f"school-{index}"} for index in range(1025)]

        def fake_capture(school, fetcher, target_year):
            code = "HOST_RESOLUTION_FAILED" if school["school_id"] == "school-0" else "TIMEOUT"
            return {"school_id": school["school_id"], "pages": [], "discovery_status": "FETCH_FAILED", "fetch_failures": [{"reason_code": code}]}

        with tempfile.TemporaryDirectory() as directory:
            with patch("scripts.kg_parent.school_sources.read_base_schools", return_value=schools), patch("scripts.kg_parent.school_sources.capture_school", side_effect=fake_capture):
                result = run(Path(directory) / "base", Path(directory) / "out")
            persisted = json.loads((Path(directory) / "out" / "manifest.json").read_text(encoding="utf8"))

        self.assertEqual(result["fetch_failure_count"], 1025)
        self.assertEqual(result["fetch_failure_reason_counts"], {"HOST_RESOLUTION_FAILED": 1, "TIMEOUT": 1024})
        self.assertEqual(persisted["fetch_failure_count"], 1025)

    def test_parent_card_scope_is_used_instead_of_raw_source_groups(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base = root / "base"
            base.mkdir()
            (base / "catalog-manifest.json").write_text(json.dumps({"data_id": "a" * 64}), encoding="utf8")
            inputs = root / "inputs.json"
            inputs.write_text(json.dumps({
                "schema": 1,
                "data_id": "a" * 64,
                "records": [{"id": "school_parent", "name": "甲幼稚園", "address": "甲街", "annual": [{"fields": {"學校網址": "https://school.example/"}}]}],
            }, ensure_ascii=False), encoding="utf8")
            self.assertEqual(read_base_schools(base, inputs), [{
                "school_id": "school_parent", "name": "甲幼稚園", "address": "甲街", "website": "https://school.example/",
            }])


if __name__ == "__main__":
    unittest.main()
