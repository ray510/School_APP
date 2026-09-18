/** S01 baseline normalizer. It does not infer school level, sessions, campus or admission dates. */
import { parseEDBDirectory, type SourceEncoding } from '../parsers/csv-parser.ts';
import { generateSchoolId, generateItemKey, createMapping, type IdentityMapping, type SchoolLevel } from '@hk-school/contracts/identity';
export interface NormalizationContext {
  sourceId: string;
  snapshotId: string;
  sourceReferencePeriod: string | null;
  retrievedAt: string;
  parserVersion: string;
  categoryMappingVersion: string;
  /** Exact ENGLISH CATEGORY values, independently reviewed against the source contract. No fuzzy match. */
  categoryLevels: Readonly<Record<string, SchoolLevel>>;
  encoding?: SourceEncoding;
}
export interface NormalizedSchool {
  school_id: string;
  school_no: string;
  english_name: string;
  chinese_name: string;
  english_address: string;
  chinese_address: string;
  longitude: number | null;
  latitude: number | null;
  category: string;
  level: SchoolLevel;
  session_code: 'UNKNOWN';
  campus_id: null;
  source_id: string;
  source_record_key: string;
  provenance: Omit<NormalizationContext, 'categoryLevels' | 'encoding'>;
}
export interface NormalizationResult {
  schools: NormalizedSchool[];
  mappings: Array<Omit<IdentityMapping, 'mappingId' | 'createdAt'>>;
  errors: Array<{ row: number; message: string }>;
  publishable: boolean;
  stats: { total: number; success: number; failed: number; by_level: Record<SchoolLevel, number> };
}
function coordinate(value: string | undefined, bound: number): number | null {
  if (!value?.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > bound) throw new Error('Invalid coordinates');
  return number;
}
export function normalizeEDBDirectory(content: string | Buffer, context: NormalizationContext): NormalizationResult {
  if (!context?.sourceId?.trim() || !context.snapshotId?.trim() || !context.parserVersion?.trim() ||
      !context.categoryMappingVersion?.trim() || !context.categoryLevels ||
      !context.retrievedAt || !Number.isFinite(Date.parse(context.retrievedAt)) ||
      !(context.sourceReferencePeriod === null || typeof context.sourceReferencePeriod === 'string')) {
    throw new Error('Verified source context is required; do not invent dates or snapshot IDs');
  }
  const parsed = parseEDBDirectory(content, { encoding: context.encoding });
  const result: NormalizationResult = {
    schools: [], mappings: [], errors: [], publishable: false,
    stats: { total: parsed.rowCount, success: 0, failed: 0, by_level: { KG: 0, PRIMARY: 0, SECONDARY: 0 } }
  };
  if (parsed.missingFields.length || parsed.issues.warnings.length || !parsed.headers.includes('ENGLISH CATEGORY')) {
    result.errors.push({ row: 0, message: 'Source contract or CSV shape failed validation' });
    result.stats.failed = parsed.rowCount;
    return result;
  }
  const counts = new Map<string, number>();
  for (const row of parsed.rows) {
    const key = row['SCHOOL NO.'].trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const { categoryLevels: _levels, encoding: _encoding, ...provenance } = context;
  for (const [index, row] of parsed.rows.entries()) {
    try {
      const key = row['SCHOOL NO.'].trim();
      if (!key || !row['ENGLISH NAME'].trim() || !row['中文名稱'].trim()) throw new Error('Required school identity fields missing');
      if (counts.get(key) !== 1) throw new Error('Repeated source key requires reviewed campus/session mapping; all repeated rows quarantined');
      const category = row['ENGLISH CATEGORY'];
      const level = Object.hasOwn(context.categoryLevels, category) ? context.categoryLevels[category] : undefined;
      if (!level || !['KG', 'PRIMARY', 'SECONDARY'].includes(level)) throw new Error('Unmapped category; school name is not classification evidence');
      const schoolId = generateSchoolId(context.sourceId, key);
      result.schools.push({
        school_id: schoolId, school_no: key,
        english_name: row['ENGLISH NAME'], chinese_name: row['中文名稱'],
        english_address: row['ENGLISH ADDRESS'], chinese_address: row['中文地址'],
        longitude: coordinate(row.LONGITUDE, 180), latitude: coordinate(row.LATITUDE, 90),
        category, level, session_code: 'UNKNOWN', campus_id: null,
        source_id: context.sourceId, source_record_key: key, provenance: { ...provenance }
      });
      result.mappings.push(createMapping(context.sourceId, key, schoolId, 'UNKNOWN', null));
      result.stats.success++;
      result.stats.by_level[level]++;
    } catch (error) {
      result.stats.failed++;
      result.errors.push({ row: index + 2, message: error instanceof Error ? error.message : 'Unknown normalization error' });
    }
  }
  // Validated baseline output is still NOT approved for publication. Review/import remains separate.
  return result;
}
export function createProfileVersion(school: NormalizedSchool) {
  return {
    school_id: school.school_id,
    level: school.level,
    session_code: school.session_code,
    campus_id: school.campus_id,
    item_key: generateItemKey(school.school_id, school.session_code, school.campus_id),
    source_snapshot_ids: [school.provenance.snapshotId],
    content: {
      basic: { english_name: school.english_name, chinese_name: school.chinese_name, school_no: school.school_no, category: school.category },
      location: { english_address: school.english_address, chinese_address: school.chinese_address, longitude: school.longitude, latitude: school.latitude },
      session: { value: null, state: 'not_provided' },
      campus: { value: null, state: 'not_verified' },
      source_reference_period: school.provenance.sourceReferencePeriod,
      source_snapshot_ids: [school.provenance.snapshotId],
      parser_version: school.provenance.parserVersion,
      category_mapping_version: school.provenance.categoryMappingVersion,
      verified: false
    },
    created_at: school.provenance.retrievedAt
  };
}
