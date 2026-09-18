-- Keep event releases cohort-bound and fully reviewed; empty reviewed releases can retire old events.
CREATE TRIGGER event_publication_guard BEFORE INSERT ON publication_commands
WHEN NEW.channel LIKE 'events:%' OR NEW.channel LIKE 'test:events:%'
BEGIN
  SELECT CASE WHEN (SELECT item_count FROM release_manifests WHERE release_id=NEW.release_id)
    !=(SELECT COUNT(*) FROM event_release_items WHERE release_id=NEW.release_id)
    THEN RAISE(ABORT,'EVENT_COUNT_MISMATCH') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM event_release_items i JOIN event_versions e ON e.event_version_id=i.event_version_id
    JOIN release_manifests m ON m.release_id=i.release_id
    WHERE i.release_id=NEW.release_id AND (e.verified!=1 OR e.entry_year_start!=m.entry_year_start
      OR (NEW.channel LIKE 'events:%' AND e.is_test!=0))
  ) THEN RAISE(ABORT,'EVENT_VERIFICATION_MISMATCH') END;
END;
