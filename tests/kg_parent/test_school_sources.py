import unittest
from unittest.mock import patch

from scripts.kg_parent.school_sources import (
    content_sha256,
    decode_html,
    discover_links,
    extract_facts,
    field_states,
    is_target_year,
    require_public_host,
    safe_https_url,
)


class SchoolSources(unittest.TestCase):
    def test_target_year_is_explicit(self):
        self.assertTrue(is_target_year("2027/28 K1 入學申請"))
        self.assertTrue(is_target_year("2027 至 2028 學年 K1 入學申請"))
        self.assertFalse(is_target_year("2026/27 K1 入學申請"))

    def test_private_literal_and_ports_are_rejected(self):
        self.assertIsNone(safe_https_url("https://127.0.0.1/admission", "127.0.0.1"))
        self.assertIsNone(safe_https_url("https://school.example:8443/admission", "school.example"))

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


if __name__ == "__main__":
    unittest.main()
