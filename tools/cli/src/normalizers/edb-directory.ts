/**
 * EDB School Directory Normalizer
 * S01 CSV → school_identities + profile_versions + identity_mappings
 */

import { parseEDBDirectory, type ParseResult } from '../parsers/csv-parser';
import {
  generateSchoolId,
  generateItemKey,
  createMapping,
  type SessionCode
} from '@hk-school/contracts/src/identity';

export interface NormalizedSchool {
  school_id: string;
  school_no: string;
  english_name: string;
  chinese_name: string;
  english_address: string;
  chinese_address: string;
  longitude?: string;
  latitude?: string;
  category: string;
  level: 'KG' | 'PRIMARY' | 'SECONDARY';
  source_id: string;
  source_record_key: string;
}

export interface NormalizationResult {
  schools: NormalizedSchool[];
  mappings: any[];
  errors: Array<{ row: number; message: string }>;
  stats: {
    total: number;
    success: number;
    failed: number;
    by_level: Record<string, number>;
  };
}

/**
 * 將 EDB School Directory CSV 正規化為資料庫模型
 */
export function normalizeEDBDirectory(
  content: string | Buffer
): NormalizationResult {
  const parsed = parseEDBDirectory(content);
  const schools: NormalizedSchool[] = [];
  const mappings: any[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const stats = {
    total: parsed.rowCount,
    success: 0,
    failed: 0,
    by_level: { KG: 0, PRIMARY: 0, SECONDARY: 0 } as Record<string, number>
  };

  if (parsed.missingFields.length > 0) {
    return {
      schools: [],
      mappings: [],
      errors: [{ row: 0, message: `缺失必要欄位: ${parsed.missingFields.join(', ')}` }],
      stats
    };
  }

  // 處理每一筆記錄
  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNum = i + 2; // Excel 列號（1-indexed + header）

    try {
      const schoolNo = row['SCHOOL NO.'] || '';
      const englishName = row['ENGLISH NAME'] || '';
      const chineseName = row['中文名稱'] || '';

      // 驗證必要欄位
      if (!schoolNo || !englishName || !chineseName) {
        errors.push({
          row: rowNum,
          message: '缺失必要欄位（校號、英文名、中文名）'
        });
        stats.failed++;
        continue;
      }

      // 推斷學校級別（簡單啟發式）
      let level: 'KG' | 'PRIMARY' | 'SECONDARY' = 'PRIMARY';
      const nameUpper = englishName.toUpperCase() + chineseName;

      if (nameUpper.includes('KINDERGARTEN') || nameUpper.includes('幼稚園') || nameUpper.includes('幼兒')) {
        level = 'KG';
      } else if (nameUpper.includes('SECONDARY') || nameUpper.includes('COLLEGE') || nameUpper.includes('中學')) {
        level = 'SECONDARY';
      }

      const schoolId = generateSchoolId('edb-school-directory', schoolNo);

      const school: NormalizedSchool = {
        school_id: schoolId,
        school_no: schoolNo,
        english_name: englishName,
        chinese_name: chineseName,
        english_address: row['ENGLISH ADDRESS'] || '',
        chinese_address: row['中文地址'] || '',
        longitude: row['LONGITUDE'] || undefined,
        latitude: row['LATITUDE'] || undefined,
        category: row['ENGLISH CATEGORY'] || row['中文類別'] || 'Unknown',
        level,
        source_id: 'edb-school-directory',
        source_record_key: schoolNo
      };

      // 建立 mapping
      const mapping = createMapping(
        'edb-school-directory',
        schoolNo,
        schoolId,
        'ALL_DAY',
        null
      );

      schools.push(school);
      mappings.push(mapping);

      stats.success++;
      stats.by_level[level]++;
    } catch (error) {
      errors.push({
        row: rowNum,
        message: error instanceof Error ? error.message : '未知錯誤'
      });
      stats.failed++;
    }
  }

  return {
    schools,
    mappings,
    errors,
    stats
  };
}

/**
 * 將正規化的學校轉換成 profile_version 內容
 */
export function createProfileVersion(school: NormalizedSchool) {
  return {
    school_id: school.school_id,
    level: school.level,
    item_key: generateItemKey(school.school_id, 'ALL_DAY', null),
    content: {
      basic: {
        english_name: school.english_name,
        chinese_name: school.chinese_name,
        school_no: school.school_no,
        category: school.category
      },
      location: {
        english_address: school.english_address,
        chinese_address: school.chinese_address,
        longitude: school.longitude || null,
        latitude: school.latitude || null
      },
      source_reference_period: '2026-08-31',
      source_snapshot_ids: ['s01_2026_08_31'],
      verified: false
    },
    created_at: new Date().toISOString()
  };
}
