"""Offline S01 URL seed tests; no source fetch or identity approval."""
import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.kg_parent.school_sources import capture_school, directory_website_seed, read_base_schools


def row(url="http://school.example/", other=None, level="KINDERGARTEN"):
    fields = {"SCHOOL NO.": "123456000111", "SCHOOL LEVEL": level, "WEBSITE": url, "網頁": url if other is None else other}
    digest = hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"fields": fields, "source_key": fields["SCHOOL NO."], "row": 1, "record_sha256": digest}


SOURCES = [{"id": "edb-school-directory", "url": "https://www.edb.gov.hk/schools.csv", "sha256": "a" * 64, "edition": "directory edition", "fetched_at": "2026-09-19T09:45:15Z"}]


class DirectoryWebsiteSeeds(unittest.TestCase):
    def test_single_url_retains_both_field_provenance_and_unknown_fact_status(self):
        original = {"directory": [row()]}
        before = copy.deepcopy(original)
        seed = directory_website_seed(original, SOURCES)
        self.assertEqual(seed["website"], "http://school.example/")
        self.assertEqual(seed["website_seed_status"], "DIRECTORY_SINGLE_REGISTERED_URL")
        self.assertEqual(len(seed["website_provenance"]), 2)
        self.assertEqual({e["field"] for e in seed["website_provenance"]}, {"WEBSITE", "網頁"})
        self.assertTrue(all(e["source_id"] == "edb-school-directory" and e["review_status"] == "REVIEW_REQUIRED" and e["publication_status"] == "UNPUBLISHED" for e in seed["website_provenance"]))
        self.assertEqual(original, before)

    def test_multiple_exact_urls_are_reviewed_not_selected(self):
        seed = directory_website_seed({"directory": [row(other="https://other.example/")]}, SOURCES)
        self.assertEqual(seed["website_seed_status"], "DIRECTORY_MULTIPLE_URLS_REVIEW")
        self.assertNotIn("website", seed)
        self.assertEqual(len(seed["website_candidates"]), 2)
        captured = capture_school({"school_id": "one", "website": "", **seed}, object())
        self.assertEqual(captured["reason_code"], "DIRECTORY_WEBSITE_REVIEW_REQUIRED")
        self.assertEqual(captured["pages"], [])

    def test_existing_kg_child_care_centre_scope_is_supported(self):
        seed = directory_website_seed({"directory": [row(level="KINDERGARTEN-CUM-CHILD CARE CENTRES")]}, SOURCES)
        self.assertEqual(seed["website"], "http://school.example/")

    def test_blank_na_and_missing_directory_leave_seed_empty(self):
        for detail in ({}, {"directory": [row("")]}, {"directory": [row("N.A.")]}, {"directory": [row("N/A")]}):
            seed = directory_website_seed(detail, SOURCES)
            self.assertEqual(seed["website_seed_status"], "DIRECTORY_NO_USABLE_URL")
            self.assertNotIn("website", seed)

    def test_bad_hash_source_key_or_level_rejects_entire_seed(self):
        for key, value in (("record_sha256", "b" * 64), ("source_key", "999999000111"), ("row", 0)):
            bad = row()
            bad[key] = value
            seed = directory_website_seed({"directory": [row(), bad]}, SOURCES)
            self.assertEqual(seed["website_seed_status"], "DIRECTORY_ROW_UNVERIFIED")
            self.assertNotIn("website", seed)
        bad = row()
        bad["fields"]["SCHOOL LEVEL"] = "PRIMARY"
        self.assertEqual(directory_website_seed({"directory": [bad]}, SOURCES)["website_seed_status"], "DIRECTORY_ROW_UNVERIFIED")

    def test_missing_or_ambiguous_source_metadata_rejects_seed(self):
        for sources in ([], SOURCES * 2, [{**SOURCES[0], "sha256": ""}], [{**SOURCES[0], "url": "https://other.example/schools.csv"}]):
            self.assertEqual(directory_website_seed({"directory": [row()]}, sources)["website_seed_status"], "DIRECTORY_SOURCE_UNVERIFIED")

    def test_unsafe_url_does_not_get_hidden_by_other_valid_url(self):
        for value in ("https://user:secret@school.example/", "https://school.example:8443/", "ftp://school.example/", "https://127.0.0.1/", "https://school.example/\r\nheader", "https://school.example/?token=private-value"):
            seed = directory_website_seed({"directory": [row(other=value)]}, SOURCES)
            self.assertEqual(seed["website_seed_status"], "DIRECTORY_UNAPPROVED_URL_REVIEW")
            self.assertNotIn("website", seed)

    def test_reader_preserves_annual_source_and_never_borrows_another_card_url(self):
        records = [
            {"id": "one", "annual": [], "directory": [row()]},
            {"id": "two", "annual": [], "directory": [row("N.A.")]},
            {"id": "three", "annual": [{"fields": {"學校網址": "https://annual.example/"}}], "directory": [row()]},
            {"id": "four", "annual": [{"fields": {}}, {"fields": {}}], "directory": [row()]},
        ]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "catalog-manifest.json").write_text(json.dumps({"data_id": "d" * 64, "sources": SOURCES}))
            inputs = root / "inputs.json"
            inputs.write_text(json.dumps({"schema": 1, "data_id": "d" * 64, "records": records}))
            schools = {s["school_id"]: s for s in read_base_schools(root, inputs)}
        self.assertEqual(schools["one"]["website"], "http://school.example/")
        self.assertEqual(schools["two"]["website"], "")
        self.assertEqual(schools["three"]["website"], "https://annual.example/")
        self.assertNotIn("website_provenance", schools["three"])
        self.assertEqual(schools["four"]["website"], "")
        self.assertNotIn("website_provenance", schools["four"])


if __name__ == "__main__":
    unittest.main()
