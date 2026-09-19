-- Restrict directory row counts to the directory namespace. Annual source IDs contain profiles.
-- Applied migrations 001-004 are unchanged; all approval/CAS/scope checks and annual/event guards remain.
DROP TRIGGER publication_guard;
CREATE TRIGGER publication_guard BEFORE INSERT ON publication_commands BEGIN
  SELECT RAISE(ABORT,'RELEASE_NOT_APPROVED') WHERE NOT EXISTS (
    SELECT 1 FROM release_manifests m WHERE m.release_id=NEW.release_id AND m.channel=NEW.channel
      AND ((NEW.operation='publish' AND m.status='APPROVED') OR (NEW.operation='rollback' AND m.status='PUBLISHED'))
      AND EXISTS(SELECT 1 FROM review_decisions r WHERE r.release_id=m.release_id AND r.subject_hash=m.manifest_hash AND r.decision='APPROVED')
  );
  SELECT RAISE(ABORT,'RELEASE_CONFLICT') WHERE COALESCE((SELECT revision FROM release_heads WHERE channel=NEW.channel),0)!=NEW.expected_revision
    OR COALESCE((SELECT release_id FROM release_heads WHERE channel=NEW.channel),'')!=COALESCE(NEW.expected_previous_release_id,'');
  SELECT RAISE(ABORT,'SCOPE_SHRINK_BLOCKED') WHERE EXISTS (
    SELECT 1 FROM release_heads h JOIN release_manifests old ON old.release_id=h.release_id
    JOIN release_manifests next ON next.release_id=NEW.release_id
    WHERE h.channel=NEW.channel AND old.scope='full' AND next.scope!='full'
  );
  SELECT RAISE(ABORT,'RELEASE_COUNT_MISMATCH') WHERE (NEW.channel LIKE 'profiles:%' OR NEW.channel LIKE 'test:profiles:%') AND (
    (SELECT item_count FROM release_manifests WHERE release_id=NEW.release_id)<=0 OR
    (SELECT item_count FROM release_manifests WHERE release_id=NEW.release_id)!=(SELECT COUNT(*) FROM school_search WHERE release_id=NEW.release_id)
  );
END;
