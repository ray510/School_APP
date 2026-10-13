"""Offline URL fidelity regressions: no source network is contacted."""
import http.client
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import Mock, patch

from scripts.kg_parent.school_sources import (
    Fetcher, SafeRedirectHandler, canonical_url, discover_links,
    safe_https_url, school_https_roots,
)


class SchoolSourceURLs(unittest.TestCase):
    def test_unicode_and_spaces_become_valid_ascii_request_targets(self):
        url = safe_https_url("https://school.example/文件/2027-28 申請表.pdf?語言=中文&name=A B", "school.example")
        self.assertEqual(url, "https://school.example/%E6%96%87%E4%BB%B6/2027-28%20%E7%94%B3%E8%AB%8B%E8%A1%A8.pdf?%E8%AA%9E%E8%A8%80=%E4%B8%AD%E6%96%87&name=A%20B")
        parsed = urllib.parse.urlsplit(url)
        connection = http.client.HTTPConnection("example.invalid")
        # putrequest only validates/buffers the request; no socket connection.
        connection.putrequest("GET", parsed.path + "?" + parsed.query)

    def test_existing_escapes_query_delimiters_and_fragment_are_preserved(self):
        original = "https://school.example/admission%2Fforms/;v=1?q=a%2Bb+c&next=%2Fapply%3Fx%3D1&empty=#section"
        expected = original.split("#")[0]
        self.assertEqual(canonical_url(original), expected)
        self.assertEqual(canonical_url(expected), expected)
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(expected).query)["q"], ["a+b c"])

    def test_directory_slashes_and_relative_link_base_are_preserved(self):
        self.assertEqual(canonical_url("https://school.example/en/"), "https://school.example/en/")
        self.assertEqual(canonical_url("https://school.example/en"), "https://school.example/en")
        self.assertEqual(canonical_url("https://school.example"), "https://school.example/")
        roots, _ = school_https_roots("https://school.example/en/")
        self.assertEqual(roots[0], "https://school.example/en/")
        self.assertEqual(discover_links(b'<a href="admission/">2027/28 K1</a>', roots[0]), ["https://school.example/en/admission/"])

    def test_discovery_scores_chinese_paths_after_transport_encoding(self):
        for href in ("/入學申請/", "/%E5%85%A5%E5%AD%B8%E7%94%B3%E8%AB%8B/"):
            with self.subTest(href=href):
                raw = f'<a href="{href}"><img src="button.png"></a>'.encode()
                self.assertEqual(discover_links(raw, "https://school.example/"), ["https://school.example/%E5%85%A5%E5%AD%B8%E7%94%B3%E8%AB%8B/"])

    def test_fetch_uses_validated_final_url_for_provenance_and_relative_links(self):
        raw = '<p>2027/28 K1 入學申請</p><a href="forms/2027-2028-application-form.pdf">K1 申請表</a>'.encode()
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.geturl.return_value = "https://www.school.example/en/"
        response.read.return_value = raw
        response.headers = {"content-type": "text/html; charset=utf-8"}
        opener = Mock()
        opener.open.return_value = response
        with tempfile.TemporaryDirectory() as directory, patch("scripts.kg_parent.school_sources.require_public_host"), patch("scripts.kg_parent.school_sources.urllib.request.build_opener", return_value=opener):
            result = Fetcher(Path(directory)).fetch("https://school.example/", "school.example")
        self.assertEqual(result["capture_status"], "CAPTURED")
        self.assertEqual(result["requested_url"], "https://school.example/")
        self.assertEqual(result["url"], "https://www.school.example/en/")
        expected = "https://www.school.example/en/forms/2027-2028-application-form.pdf"
        self.assertIn(expected, result["discovered_links"])
        self.assertEqual(result["facts"]["form"][0]["value"], expected)
        self.assertEqual(result["facts"]["form"][0]["url"], result["url"])
        self.assertEqual(result["review_status"], "REVIEW_REQUIRED")
        self.assertEqual(result["publication_status"], "UNPUBLISHED")

    def test_final_response_url_cannot_escape_allowlist(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.geturl.return_value = "https://unapproved.example/admission/"
        opener = Mock()
        opener.open.return_value = response
        with tempfile.TemporaryDirectory() as directory, patch("scripts.kg_parent.school_sources.require_public_host"), patch("scripts.kg_parent.school_sources.urllib.request.build_opener", return_value=opener):
            result = Fetcher(Path(directory)).fetch("https://school.example/", "school.example")
        self.assertEqual(result["reason_code"], "UNAPPROVED_REDIRECT")
        response.read.assert_not_called()

    def test_sensitive_redirect_is_rejected_before_capture_or_provenance(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.geturl.return_value = "https://school.example/en/?token=private-value"
        opener = Mock()
        opener.open.return_value = response
        with tempfile.TemporaryDirectory() as directory, patch("scripts.kg_parent.school_sources.require_public_host"), patch("scripts.kg_parent.school_sources.urllib.request.build_opener", return_value=opener):
            result = Fetcher(Path(directory)).fetch("https://school.example/", "school.example")
            self.assertEqual(list(Path(directory).iterdir()), [])
        self.assertEqual(result["reason_code"], "UNAPPROVED_REDIRECT")
        self.assertNotIn("private-value", str(result))
        response.read.assert_not_called()

    def test_unsupported_and_control_character_urls_still_fail_closed(self):
        for url in ("http://school.example/", "file:///tmp/admission", "ftp://school.example/a", "javascript:alert(1)", "https://other.example/", "https://user:password@school.example/", "https://school.example:8443/", "https://school.example/\r\nheader", "https://school.example/\x00"):
            with self.subTest(url=url):
                self.assertIsNone(safe_https_url(url, "school.example"))
        self.assertIsNone(safe_https_url("https://127.0.0.1/", "127.0.0.1"))
        self.assertIsNone(safe_https_url("https://10.0.0.1/", "10.0.0.1"))

    def test_redirect_handler_preserves_safe_directory_target_and_blocks_other_hosts(self):
        handler = SafeRedirectHandler("school.example")
        request = urllib.request.Request("https://school.example/")
        with patch("scripts.kg_parent.school_sources.require_public_host") as public:
            redirected = handler.redirect_request(request, None, 302, "Found", {}, "/en/")
        self.assertEqual(redirected.full_url, "https://school.example/en/")
        public.assert_called_once_with("school.example")
        with self.assertRaisesRegex(ValueError, "UNAPPROVED_REDIRECT"):
            handler.redirect_request(request, None, 302, "Found", {}, "https://unapproved.example/")


if __name__ == "__main__":
    unittest.main()
