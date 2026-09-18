/**
 * 穩定識別系統
 *
 * school_id: 穩定的學校識別（UUID v5 based on source record）
 * campus_id: 校址識別（同校多址時區分）
 * session_code: 班級時間段（AM/PM/ALL_DAY）
 * item_key: 完整比較單位識別
 */

import { createHash } from 'node:crypto';

export type SessionCode = 'AM' | 'PM' | 'ALL_DAY';
export type SchoolLevel = 'KG' | 'PRIMARY' | 'SECONDARY';

/**
 * 用來源記錄生成穩定的 school_id
 * 規則：UUID v5(namespace='schools', name=`${source_id}::${source_record_key}`)
 */
export function generateSchoolId(sourceId: string, sourceRecordKey: string): string {
  // 簡化版：使用 SHA-256 的前 16 進制作為 ID
  // 實際應用可升級為標準 UUID v5
  const hash = createHash('sha256')
    .update(`${sourceId}::${sourceRecordKey}`)
    .digest('hex')
    .slice(0, 16);

  return `sch_${hash}`;
}

/**
 * 生成 campus_id
 * 用於同校多址區分（例：分校、分班地點）
 * 如無特殊區分，返回 null（視為主校址）
 */
export function generateCampusId(
  schoolId: string,
  campusName?: string,
  address?: string
): string | null {
  if (!campusName && !address) {
    return null; // 主校址，無需 campus_id
  }

  const identifier = campusName || address || '';
  const hash = createHash('sha256')
    .update(`${schoolId}::${identifier}`)
    .digest('hex')
    .slice(0, 12);

  return `camp_${hash}`;
}

/**
 * 生成完整 item_key（比較單位識別）
 * 格式：schoolId + (campusId?) + sessionCode
 * 用於 profile_versions 的 item_key 唯一約束
 */
export function generateItemKey(
  schoolId: string,
  sessionCode: SessionCode,
  campusId?: string | null
): string {
  const parts = [schoolId];
  if (campusId) {
    parts.push(campusId);
  }
  parts.push(sessionCode);

  return parts.join('::');
}

/**
 * 解析 item_key 還原成元件
 */
export function parseItemKey(itemKey: string): {
  schoolId: string;
  campusId: string | null;
  sessionCode: SessionCode;
} {
  const parts = itemKey.split('::');

  if (parts.length === 2) {
    // schoolId::sessionCode
    return {
      schoolId: parts[0],
      campusId: null,
      sessionCode: parts[1] as SessionCode
    };
  } else if (parts.length === 3) {
    // schoolId::campusId::sessionCode
    return {
      schoolId: parts[0],
      campusId: parts[1],
      sessionCode: parts[2] as SessionCode
    };
  }

  throw new Error(`Invalid item key format: ${itemKey}`);
}

/**
 * 身份驗證類
 * 確保同輸入永遠同輸出（冪等性）
 */
export class IdentityManager {
  private cache: Map<string, string> = new Map();

  /**
   * 取得或生成學校 ID
   * 確保同一來源記錄總是返回相同 ID
   */
  getSchoolId(sourceId: string, sourceRecordKey: string): string {
    const cacheKey = `${sourceId}::${sourceRecordKey}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const schoolId = generateSchoolId(sourceId, sourceRecordKey);
    this.cache.set(cacheKey, schoolId);

    return schoolId;
  }

  /**
   * 驗證 school_id 一致性
   * 用於測試 mapping 正確性
   */
  verifyConsistency(sourceId: string, sourceRecordKey: string, expectedId: string): boolean {
    const computed = generateSchoolId(sourceId, sourceRecordKey);
    return computed === expectedId;
  }

  /**
   * 清除快取（測試用）
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * 跨源 mapping 記錄型別
 * 用於 identity_mappings 表
 */
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

/**
 * 建立 mapping 記錄
 */
export function createMapping(
  sourceId: string,
  sourceRecordKey: string,
  schoolId: string,
  sessionCode: SessionCode = 'ALL_DAY',
  campusId?: string | null
): Omit<IdentityMapping, 'mappingId' | 'createdAt'> {
  return {
    sourceId,
    sourceRecordKey,
    schoolId,
    campusId: campusId || null,
    sessionCode,
    mappingVersion: '1.0',
    verified: false
  };
}

/**
 * 驗證 session code
 */
export function isValidSessionCode(code: unknown): code is SessionCode {
  return ['AM', 'PM', 'ALL_DAY'].includes(String(code));
}

/**
 * 驗證 school_id 格式
 */
export function isValidSchoolId(id: unknown): boolean {
  return typeof id === 'string' && /^sch_[0-9a-f]{16}$/.test(id);
}

/**
 * 驗證 campus_id 格式
 */
export function isValidCampusId(id: unknown): boolean {
  if (id === null) return true;
  return typeof id === 'string' && /^camp_[0-9a-f]{12}$/.test(id);
}
