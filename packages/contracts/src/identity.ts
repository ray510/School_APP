/** Deterministic source-scoped IDs. These are SHA-256 prefixes, NOT UUID v5. */
import { createHash } from 'node:crypto';
export type SessionCode = 'AM' | 'PM' | 'ALL_DAY' | 'UNKNOWN';
export type SchoolLevel = 'KG' | 'PRIMARY' | 'SECONDARY';
export function generateSchoolId(sourceId: string, sourceRecordKey: string): string {
  const hash = createHash('sha256').update(`${sourceId}::${sourceRecordKey}`).digest('hex').slice(0, 16);
  return `sch_${hash}`;
}
export function generateCampusId(schoolId: string, campusName?: string, address?: string): string | null {
  if (!campusName && !address) return null;
  const hash = createHash('sha256').update(`${schoolId}::${campusName || address || ''}`).digest('hex').slice(0, 12);
  return `camp_${hash}`;
}
export function generateItemKey(schoolId: string, sessionCode: SessionCode, campusId?: string | null): string {
  if (!isValidSessionCode(sessionCode)) throw new Error('Invalid session code');
  return [schoolId, ...(campusId ? [campusId] : []), sessionCode].join('::');
}
export function parseItemKey(itemKey: string): { schoolId: string; campusId: string | null; sessionCode: SessionCode } {
  const parts = itemKey.split('::');
  const sessionCode = parts[parts.length - 1];
  if ((parts.length !== 2 && parts.length !== 3) || parts.some(part => !part) || !isValidSessionCode(sessionCode)) {
    throw new Error(`Invalid item key format: ${itemKey}`);
  }
  return { schoolId: parts[0], campusId: parts.length === 3 ? parts[1] : null, sessionCode };
}
export class IdentityManager {
  private cache: Map<string, string> = new Map();
  getSchoolId(sourceId: string, sourceRecordKey: string): string {
    const key = `${sourceId}::${sourceRecordKey}`;
    const id = this.cache.get(key) ?? generateSchoolId(sourceId, sourceRecordKey);
    this.cache.set(key, id);
    return id;
  }
  verifyConsistency(sourceId: string, sourceRecordKey: string, expectedId: string): boolean {
    return generateSchoolId(sourceId, sourceRecordKey) === expectedId;
  }
  clearCache(): void { this.cache.clear(); }
}
export interface IdentityMapping {
  mappingId: string;
  sourceId: string;
  sourceRecordKey: string;
  campusId: string | null;
  sessionCode: SessionCode;
  schoolId: string;
  mappingVersion: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
}
/** Legacy default retained for API compatibility. Ingestion MUST pass an evidence-based session or UNKNOWN. */
export function createMapping(
  sourceId: string, sourceRecordKey: string, schoolId: string,
  sessionCode: SessionCode = 'ALL_DAY', campusId?: string | null
): Omit<IdentityMapping, 'mappingId' | 'createdAt'> {
  if (!isValidSessionCode(sessionCode)) throw new Error('Invalid session code');
  return { sourceId, sourceRecordKey, schoolId, campusId: campusId || null, sessionCode, mappingVersion: '1.0', verified: false };
}
export function isValidSessionCode(code: unknown): code is SessionCode {
  return typeof code === 'string' && ['AM', 'PM', 'ALL_DAY', 'UNKNOWN'].includes(code);
}
export function isValidSchoolId(id: unknown): boolean {
  return typeof id === 'string' && /^sch_[0-9a-f]{16}$/.test(id);
}
export function isValidCampusId(id: unknown): boolean {
  return id === null || (typeof id === 'string' && /^camp_[0-9a-f]{12}$/.test(id));
}
