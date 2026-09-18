-- Additive migration. Never rewrite 001 after it has been applied.
CREATE TABLE school_search (
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  item_key TEXT NOT NULL,
  profile_version_id TEXT NOT NULL REFERENCES profile_versions(profile_version_id),
  school_id TEXT NOT NULL REFERENCES school_identities(school_id),
  level TEXT NOT NULL CHECK(level IN ('KG','PRIMARY','SECONDARY')),
  normalized_name TEXT NOT NULL,
  district TEXT,
  funding TEXT,
  is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1)),
  PRIMARY KEY(release_id,item_key)
);
CREATE INDEX idx_school_search_filters ON school_search(release_id,level,district,funding,item_key);
CREATE INDEX idx_school_search_identity ON school_search(release_id,school_id);
CREATE TABLE event_versions (
  event_version_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  semantic_hash TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('KG','PRIMARY','SECONDARY')),
  entry_year_start INTEGER NOT NULL,
  school_id TEXT,
  starts_sort TEXT NOT NULL,
  verified INTEGER NOT NULL CHECK(verified IN (0,1)),
  is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1)),
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  UNIQUE(event_id,semantic_hash)
);
CREATE TABLE event_release_items (
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  event_id TEXT NOT NULL,
  event_version_id TEXT NOT NULL REFERENCES event_versions(event_version_id),
  PRIMARY KEY(release_id,event_id)
);
CREATE INDEX idx_events_cohort ON event_versions(level,entry_year_start,starts_sort);
CREATE TABLE review_decisions (
  decision_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  subject_hash TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  actor_id TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK(json_valid(evidence_json)),
  created_at TEXT NOT NULL
);
CREATE TABLE publication_commands (
  command_id TEXT PRIMARY KEY,
  operation TEXT NOT NULL CHECK(operation IN ('publish','rollback')),
  channel TEXT NOT NULL,
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  expected_revision INTEGER NOT NULL CHECK(expected_revision>=0),
  expected_previous_release_id TEXT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- A single INSERT atomically checks CAS, moves head and records audit.
CREATE TRIGGER publication_guard BEFORE INSERT ON publication_commands BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM release_manifests m WHERE m.release_id=NEW.release_id AND m.channel=NEW.channel
      AND ((NEW.operation='publish' AND m.status='APPROVED') OR (NEW.operation='rollback' AND m.status='PUBLISHED'))
      AND EXISTS(SELECT 1 FROM review_decisions r WHERE r.release_id=m.release_id AND r.subject_hash=m.manifest_hash AND r.decision='APPROVED')
  ) THEN RAISE(ABORT,'RELEASE_NOT_APPROVED') END;
  SELECT CASE WHEN COALESCE((SELECT revision FROM release_heads WHERE channel=NEW.channel),0)!=NEW.expected_revision
    OR COALESCE((SELECT release_id FROM release_heads WHERE channel=NEW.channel),'')!=COALESCE(NEW.expected_previous_release_id,'')
    THEN RAISE(ABORT,'RELEASE_CONFLICT') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM release_heads h JOIN release_manifests old ON old.release_id=h.release_id
    JOIN release_manifests next ON next.release_id=NEW.release_id
    WHERE h.channel=NEW.channel AND old.scope='full' AND next.scope!='full'
  ) THEN RAISE(ABORT,'SCOPE_SHRINK_BLOCKED') END;
  SELECT CASE WHEN NEW.channel LIKE '%profiles:%' AND (
    (SELECT item_count FROM release_manifests WHERE release_id=NEW.release_id)<=0 OR
    (SELECT item_count FROM release_manifests WHERE release_id=NEW.release_id)!=(SELECT COUNT(*) FROM school_search WHERE release_id=NEW.release_id)
  ) THEN RAISE(ABORT,'RELEASE_COUNT_MISMATCH') END;
END;
CREATE TRIGGER publication_apply AFTER INSERT ON publication_commands BEGIN
  INSERT INTO release_heads(channel,release_id,revision,updated_at)
    VALUES(NEW.channel,NEW.release_id,NEW.expected_revision+1,NEW.created_at)
    ON CONFLICT(channel) DO UPDATE SET release_id=excluded.release_id,revision=excluded.revision,updated_at=excluded.updated_at;
  UPDATE release_manifests SET status='PUBLISHED',published_at=COALESCE(published_at,NEW.created_at),published_by=COALESCE(published_by,NEW.actor_id) WHERE release_id=NEW.release_id;
  INSERT INTO audit_events(audit_id,event_type,release_id,actor_id,details_json,created_at)
    VALUES(NEW.command_id,NEW.operation,NEW.release_id,NEW.actor_id,json_object('channel',NEW.channel,'revision',NEW.expected_revision+1),NEW.created_at);
END;
