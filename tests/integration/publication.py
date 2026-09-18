"""Real SQLite trigger tests; workerd/D1 HTTP is tested separately."""
import json, sqlite3, pathlib, unittest
ROOT=pathlib.Path(__file__).resolve().parents[2]
F=json.loads((ROOT/'artifacts/publication-fixtures.json').read_text())
class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('PRAGMA foreign_keys=ON')
        for path in sorted((ROOT/'migrations').glob('*.sql')): self.db.executescript(path.read_text())
    def tearDown(self): self.db.close()
    def value(self,sql): return self.db.execute(sql).fetchone()[0]
    def test_staged_not_public(self):
        self.db.executescript(F['unapproved'])
        self.assertEqual(self.value('SELECT COUNT(*) FROM release_heads'),0)
        with self.assertRaisesRegex(sqlite3.IntegrityError,'RELEASE_NOT_APPROVED'): self.db.executescript(F['publish'])
    def test_idempotent_import(self):
        self.db.executescript(F['approved']); before=self.value('SELECT COUNT(*) FROM profile_versions')
        self.db.executescript(F['approved']); self.assertEqual(self.value('SELECT COUNT(*) FROM profile_versions'),before)
    def test_publish_and_retry_are_atomic(self):
        self.db.executescript(F['approved']); self.db.executescript(F['publish']); self.db.executescript(F['publish'])
        self.assertEqual(self.value('SELECT revision FROM release_heads'),1)
        self.assertEqual(self.value('SELECT COUNT(*) FROM audit_events'),1)
    def test_stale_writer_does_not_change_head_or_audit(self):
        self.db.executescript(F['approved']); self.db.executescript(F['publish'])
        # Make the same target eligible to isolate the CAS predicate.
        self.db.execute("UPDATE release_manifests SET status='APPROVED'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'RELEASE_CONFLICT'): self.db.executescript(F['conflict'])
        self.assertEqual(self.value('SELECT revision FROM release_heads'),1)
        self.assertEqual(self.value('SELECT COUNT(*) FROM audit_events'),1)
    def test_wrong_channel_rejected(self):
        self.db.executescript(F['approved'])
        with self.assertRaisesRegex(sqlite3.IntegrityError,'RELEASE_NOT_APPROVED'): self.db.executescript(F['badChannel'])
    def test_count_mismatch_rejected(self):
        self.db.executescript(F['approved']); self.db.execute('DELETE FROM school_search')
        with self.assertRaisesRegex(sqlite3.IntegrityError,'RELEASE_COUNT_MISMATCH'): self.db.executescript(F['publish'])
    def test_review_hash_mismatch_rejected(self):
        self.db.executescript(F['approved']); self.db.execute("UPDATE review_decisions SET subject_hash='tampered'")
        with self.assertRaisesRegex(sqlite3.IntegrityError,'RELEASE_NOT_APPROVED'): self.db.executescript(F['publish'])
    def test_rollback_preserves_versions_and_audits(self):
        self.db.executescript(F['approved']); self.db.executescript(F['publish']); before=self.value('SELECT COUNT(*) FROM profile_versions')
        self.db.executescript(F['rollback']); self.assertEqual(self.value('SELECT revision FROM release_heads'),2)
        self.assertEqual(self.value('SELECT COUNT(*) FROM audit_events'),2)
        self.assertEqual(self.value('SELECT COUNT(*) FROM profile_versions'),before)
if __name__=='__main__': unittest.main(verbosity=2)
