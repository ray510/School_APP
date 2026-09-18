/** Read-only readiness checks. Node tests cover logic, not the workerd runtime. */
export type AppEnvironment = 'local' | 'staging' | 'production' | 'invalid';
export function readEnvironment(value: unknown): AppEnvironment {
  return value === 'local' || value === 'staging' || value === 'production' ? value : 'invalid';
}
export interface DatabaseReader {
  prepare(sql: string): {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    all<T = Record<string, unknown>>(): Promise<{ success: boolean; results: T[] }>;
  };
}
export interface PublishedChannel {
  channel: string;
  release_id: string;
  revision: number;
  scope: string | null;
  entry_year_start: number | null;
  item_count: number;
}
export interface ReadinessData {
  environment: AppEnvironment;
  liveness: 'ok';
  database: 'not_checked' | 'missing' | 'ok' | 'error';
  schema_version: string | null;
  readiness: 'ok' | 'empty' | 'degraded' | 'error';
  data_status: 'unavailable' | 'empty' | 'published';
  public_release_id: string | null;
  public_release_ids: string[];
  timestamp: string;
}
const PUBLISHED_CHANNELS_SQL = `
  SELECT h.channel, h.release_id, h.revision, m.scope, m.entry_year_start, m.item_count
  FROM release_heads AS h
  JOIN release_manifests AS m ON m.release_id = h.release_id AND m.channel = h.channel
  WHERE m.status = 'PUBLISHED'
  ORDER BY h.channel
  LIMIT 101`;
export async function publishedChannels(db: DatabaseReader): Promise<PublishedChannel[]> {
  const result = await db.prepare(PUBLISHED_CHANNELS_SQL).all<PublishedChannel>();
  if (!result.success || result.results.length > 100) throw new Error('Channel query failed or exceeded safe bound');
  return result.results;
}
export async function inspectReadiness(
  environmentValue: unknown,
  db: DatabaseReader | undefined,
  now = new Date().toISOString()
): Promise<{ status: 200 | 503; data: ReadinessData }> {
  const data: ReadinessData = {
    environment: readEnvironment(environmentValue), liveness: 'ok', database: 'not_checked',
    schema_version: null, readiness: 'error', data_status: 'unavailable',
    public_release_id: null, public_release_ids: [], timestamp: now
  };
  if (data.environment === 'invalid') return { status: 503, data };
  if (!db) { data.database = 'missing'; return { status: 503, data }; }
  try {
    const ping = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    if (ping?.ok !== 1) throw new Error('Database ping failed');
    data.database = 'ok';
  } catch {
    data.database = 'error';
    return { status: 503, data };
  }
  try {
    // A real Wrangler migration ledger entry, not a hard-coded success flag.
    const migration = await db.prepare(
      "SELECT name FROM d1_migrations WHERE name = '001_initial_schema.sql' LIMIT 1"
    ).first<{ name: string }>();
    if (!migration) throw new Error('Required migration not recorded');
    const channels = await publishedChannels(db);
    data.schema_version = migration.name;
    data.public_release_ids = [...new Set(channels.map(channel => channel.release_id))];
    data.public_release_id = data.public_release_ids.length === 1 ? data.public_release_ids[0] : null;
    data.data_status = channels.length ? 'published' : 'empty';
    data.readiness = channels.length ? 'ok' : 'empty';
    return { status: 200, data };
  } catch {
    data.readiness = 'degraded';
    return { status: 503, data };
  }
}
