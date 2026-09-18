-- Phase 1: Core data model schema
-- Tables: sources, source_snapshots, school_identities, identity_mappings, profile_versions,
--         admission_cycles, release_manifests, release_items, release_heads

-- Track external data sources and their health status
CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  catalog_url TEXT NOT NULL,
  publisher TEXT,
  preferred_language TEXT DEFAULT 'zh-HK',
  resource_selection TEXT DEFAULT 'explicit-reviewed-resource',
  resolved_resource_url TEXT,
  expected_update TEXT,
  parser_id TEXT,
  contract_status TEXT DEFAULT 'DISCOVERED',
  enabled BOOLEAN DEFAULT FALSE,
  max_response_bytes INTEGER DEFAULT 20971520,
  connect_timeout_ms INTEGER DEFAULT 10000,
  request_timeout_ms INTEGER DEFAULT 30000,
  max_attempts INTEGER DEFAULT 2,
  last_checked_at TEXT,
  last_successful_fetch_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Store immutable snapshots of raw downloaded data
CREATE TABLE IF NOT EXISTS source_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  raw_hash TEXT NOT NULL,
  parser_version TEXT,
  content_type TEXT,
  content_length_bytes INTEGER,
  http_status INTEGER,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, raw_hash, parser_version)
);

-- Stable school identity (never changes once created)
CREATE TABLE IF NOT EXISTS school_identities (
  school_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cross-source mapping (source record key → stable school_id)
CREATE TABLE IF NOT EXISTS identity_mappings (
  mapping_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  source_record_key TEXT NOT NULL,
  campus_id TEXT,
  session_code TEXT,
  school_id TEXT NOT NULL REFERENCES school_identities(school_id),
  mapping_version TEXT DEFAULT '1.0',
  verified BOOLEAN DEFAULT FALSE,
  verified_at TEXT,
  verified_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, source_record_key, mapping_version)
);

-- Immutable school/campus profile content snapshot
CREATE TABLE IF NOT EXISTS profile_versions (
  profile_version_id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES school_identities(school_id),
  campus_id TEXT,
  session_code TEXT,
  level TEXT NOT NULL,
  item_key TEXT NOT NULL,
  semantic_hash TEXT NOT NULL,
  content_json TEXT NOT NULL,
  source_snapshot_ids TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_key, semantic_hash)
);

-- Admission cycles (cohorts with specific entry year and grade)
CREATE TABLE IF NOT EXISTS admission_cycles (
  cycle_id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  entry_year_start INTEGER NOT NULL,
  grade_code TEXT NOT NULL,
  official_cycle_label TEXT,
  admission_route TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Release manifest: immutable publication record
CREATE TABLE IF NOT EXISTS release_manifests (
  release_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  scope TEXT,
  entry_year_start INTEGER,
  item_count INTEGER DEFAULT 0,
  chunk_count INTEGER DEFAULT 0,
  manifest_hash TEXT NOT NULL,
  chunk_hashes TEXT,
  source_snapshots TEXT,
  normalizer_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  published_at TEXT,
  published_by TEXT
);

-- Link release → immutable profile versions
CREATE TABLE IF NOT EXISTS release_items (
  release_item_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  item_key TEXT NOT NULL,
  profile_version_id TEXT NOT NULL REFERENCES profile_versions(profile_version_id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(release_id, item_key)
);

-- Current release head per channel
CREATE TABLE IF NOT EXISTS release_heads (
  channel TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES release_manifests(release_id),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail for imports, reviews, publishes
CREATE TABLE IF NOT EXISTS audit_events (
  audit_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  release_id TEXT REFERENCES release_manifests(release_id),
  actor_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indices for common queries
CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(contract_status);
CREATE INDEX IF NOT EXISTS idx_source_snapshots_source ON source_snapshots(source_id);
CREATE INDEX IF NOT EXISTS idx_identity_mappings_school ON identity_mappings(school_id);
CREATE INDEX IF NOT EXISTS idx_profile_versions_school ON profile_versions(school_id);
CREATE INDEX IF NOT EXISTS idx_profile_versions_level ON profile_versions(level);
CREATE INDEX IF NOT EXISTS idx_release_manifests_channel ON release_manifests(channel);
CREATE INDEX IF NOT EXISTS idx_release_items_release ON release_items(release_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
