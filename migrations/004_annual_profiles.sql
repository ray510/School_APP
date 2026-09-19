-- Annual profiles are independent of directory releases and admission cohorts.
-- The primary key hashes the complete immutable profile, including reviewed identity evidence.
-- A renewed review of the same source row can therefore create a distinct immutable version.
CREATE TABLE annual_profile_versions (
  annual_profile_id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES school_identities(school_id),
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  source_record_key TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('KG','PRIMARY','SECONDARY')),
  profile_edition TEXT NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1)),
  identity_verified INTEGER NOT NULL CHECK(identity_verified IN (0,1)),
  content_json TEXT NOT NULL CHECK(json_valid(content_json))
);
CREATE INDEX idx_annual_school ON annual_profile_versions(school_id,level,profile_edition);
CREATE TABLE annual_release_items (
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  annual_profile_id TEXT NOT NULL REFERENCES annual_profile_versions(annual_profile_id),
  PRIMARY KEY(release_id,annual_profile_id)
);
-- Conditional aborts use SELECT RAISE(...) WHERE <condition> so the D1 remote statement splitter sees one compound block per trigger.
CREATE TRIGGER annual_publication_guard BEFORE INSERT ON publication_commands
WHEN NEW.channel LIKE 'annual:%' OR NEW.channel LIKE 'test:annual:%'
BEGIN
  SELECT RAISE(ABORT,'ANNUAL_COUNT_MISMATCH') WHERE (SELECT item_count FROM release_manifests WHERE release_id=NEW.release_id)
    !=(SELECT COUNT(*) FROM annual_release_items WHERE release_id=NEW.release_id);
  SELECT RAISE(ABORT,'ANNUAL_IDENTITY_NOT_VERIFIED') WHERE EXISTS(
    SELECT 1 FROM annual_release_items i JOIN annual_profile_versions p ON p.annual_profile_id=i.annual_profile_id
    WHERE i.release_id=NEW.release_id AND (p.identity_verified!=1 OR (NEW.channel LIKE 'annual:%' AND p.is_test!=0))
  );
END;
