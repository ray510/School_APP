import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSchoolId,
  generateCampusId,
  generateItemKey,
  parseItemKey,
  IdentityManager,
  createMapping,
  isValidSchoolId,
  isValidCampusId,
  isValidSessionCode
} from './identity';

describe('Identity System', () => {
  describe('generateSchoolId', () => {
    it('should generate consistent school IDs', () => {
      const id1 = generateSchoolId('edb-school-directory', '000123');
      const id2 = generateSchoolId('edb-school-directory', '000123');

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different source keys', () => {
      const id1 = generateSchoolId('edb-school-directory', '000123');
      const id2 = generateSchoolId('edb-school-directory', '000124');

      expect(id1).not.toBe(id2);
    });

    it('should generate different IDs for different sources', () => {
      const id1 = generateSchoolId('edb-school-directory', '000123');
      const id2 = generateSchoolId('chsc-primary-profiles', '000123');

      expect(id1).not.toBe(id2);
    });

    it('should generate valid format IDs', () => {
      const id = generateSchoolId('edb-school-directory', '000123');

      expect(isValidSchoolId(id)).toBe(true);
      expect(id).toMatch(/^sch_[0-9a-f]{16}$/);
    });
  });

  describe('generateCampusId', () => {
    it('should return null for primary campus', () => {
      const id = generateCampusId('sch_abc123', undefined, undefined);

      expect(id).toBeNull();
    });

    it('should generate ID for named campus', () => {
      const id = generateCampusId('sch_abc123', 'Branch A', undefined);

      expect(id).not.toBeNull();
      expect(isValidCampusId(id)).toBe(true);
      expect(id).toMatch(/^camp_[0-9a-f]{12}$/);
    });

    it('should be consistent for same campus', () => {
      const id1 = generateCampusId('sch_abc123', 'Branch A', undefined);
      const id2 = generateCampusId('sch_abc123', 'Branch A', undefined);

      expect(id1).toBe(id2);
    });

    it('should be different for different campuses', () => {
      const id1 = generateCampusId('sch_abc123', 'Branch A', undefined);
      const id2 = generateCampusId('sch_abc123', 'Branch B', undefined);

      expect(id1).not.toBe(id2);
    });

    it('should handle address-based campus IDs', () => {
      const id = generateCampusId('sch_abc123', undefined, '123 Main St');

      expect(id).not.toBeNull();
      expect(isValidCampusId(id)).toBe(true);
    });
  });

  describe('generateItemKey', () => {
    it('should generate key without campus', () => {
      const key = generateItemKey('sch_abc123', 'ALL_DAY', null);

      expect(key).toBe('sch_abc123::ALL_DAY');
    });

    it('should generate key with campus', () => {
      const key = generateItemKey('sch_abc123', 'AM', 'camp_xyz789');

      expect(key).toBe('sch_abc123::camp_xyz789::AM');
    });

    it('should handle different session codes', () => {
      const key1 = generateItemKey('sch_abc123', 'AM', null);
      const key2 = generateItemKey('sch_abc123', 'PM', null);
      const key3 = generateItemKey('sch_abc123', 'ALL_DAY', null);

      expect(key1).toBe('sch_abc123::AM');
      expect(key2).toBe('sch_abc123::PM');
      expect(key3).toBe('sch_abc123::ALL_DAY');
    });
  });

  describe('parseItemKey', () => {
    it('should parse key without campus', () => {
      const parsed = parseItemKey('sch_abc123::ALL_DAY');

      expect(parsed.schoolId).toBe('sch_abc123');
      expect(parsed.campusId).toBeNull();
      expect(parsed.sessionCode).toBe('ALL_DAY');
    });

    it('should parse key with campus', () => {
      const parsed = parseItemKey('sch_abc123::camp_xyz789::AM');

      expect(parsed.schoolId).toBe('sch_abc123');
      expect(parsed.campusId).toBe('camp_xyz789');
      expect(parsed.sessionCode).toBe('AM');
    });

    it('should round-trip consistently', () => {
      const original = generateItemKey('sch_abc123', 'PM', 'camp_xyz789');
      const parsed = parseItemKey(original);
      const regenerated = generateItemKey(parsed.schoolId, parsed.sessionCode, parsed.campusId);

      expect(original).toBe(regenerated);
    });

    it('should throw on invalid format', () => {
      expect(() => parseItemKey('invalid::key::format::extra')).toThrow();
    });
  });

  describe('IdentityManager', () => {
    let manager: IdentityManager;

    beforeEach(() => {
      manager = new IdentityManager();
    });

    it('should cache and return consistent IDs', () => {
      const id1 = manager.getSchoolId('edb-school-directory', '000123');
      const id2 = manager.getSchoolId('edb-school-directory', '000123');

      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different keys', () => {
      const id1 = manager.getSchoolId('edb-school-directory', '000123');
      const id2 = manager.getSchoolId('edb-school-directory', '000124');

      expect(id1).not.toBe(id2);
    });

    it('should verify consistency', () => {
      const sourceId = 'edb-school-directory';
      const key = '000123';
      const id = manager.getSchoolId(sourceId, key);

      const isConsistent = manager.verifyConsistency(sourceId, key, id);

      expect(isConsistent).toBe(true);
    });

    it('should detect inconsistent IDs', () => {
      const isConsistent = manager.verifyConsistency(
        'edb-school-directory',
        '000123',
        'sch_wrongwrongwrong123'
      );

      expect(isConsistent).toBe(false);
    });

    it('should clear cache', () => {
      manager.getSchoolId('edb-school-directory', '000123');
      manager.clearCache();

      // After cache clear, new computation should still return same result
      // (because the function is deterministic)
      const id = manager.getSchoolId('edb-school-directory', '000123');
      expect(isValidSchoolId(id)).toBe(true);
    });
  });

  describe('createMapping', () => {
    it('should create mapping with defaults', () => {
      const mapping = createMapping(
        'edb-school-directory',
        '000123',
        'sch_abc123'
      );

      expect(mapping.sourceId).toBe('edb-school-directory');
      expect(mapping.sourceRecordKey).toBe('000123');
      expect(mapping.schoolId).toBe('sch_abc123');
      expect(mapping.sessionCode).toBe('ALL_DAY');
      expect(mapping.campusId).toBeNull();
      expect(mapping.verified).toBe(false);
      expect(mapping.mappingVersion).toBe('1.0');
    });

    it('should create mapping with all fields', () => {
      const mapping = createMapping(
        'edb-school-directory',
        '000123',
        'sch_abc123',
        'AM',
        'camp_xyz789'
      );

      expect(mapping.campusId).toBe('camp_xyz789');
      expect(mapping.sessionCode).toBe('AM');
    });
  });

  describe('Validation functions', () => {
    describe('isValidSchoolId', () => {
      it('should accept valid school IDs', () => {
        const id = generateSchoolId('source', 'key');

        expect(isValidSchoolId(id)).toBe(true);
      });

      it('should reject invalid formats', () => {
        expect(isValidSchoolId('invalid')).toBe(false);
        expect(isValidSchoolId('sch_tooshort')).toBe(false);
        expect(isValidSchoolId(null)).toBe(false);
        expect(isValidSchoolId(123)).toBe(false);
      });
    });

    describe('isValidCampusId', () => {
      it('should accept null', () => {
        expect(isValidCampusId(null)).toBe(true);
      });

      it('should accept valid campus IDs', () => {
        const id = generateCampusId('sch_abc123', 'Branch', undefined);

        expect(isValidCampusId(id)).toBe(true);
      });

      it('should reject invalid formats', () => {
        expect(isValidCampusId('invalid')).toBe(false);
        expect(isValidCampusId('camp_tooshort')).toBe(false);
        expect(isValidCampusId(123)).toBe(false);
      });
    });

    describe('isValidSessionCode', () => {
      it('should accept valid codes', () => {
        expect(isValidSessionCode('AM')).toBe(true);
        expect(isValidSessionCode('PM')).toBe(true);
        expect(isValidSessionCode('ALL_DAY')).toBe(true);
      });

      it('should reject invalid codes', () => {
        expect(isValidSessionCode('INVALID')).toBe(false);
        expect(isValidSessionCode('am')).toBe(false);
        expect(isValidSessionCode(null)).toBe(false);
        expect(isValidSessionCode(123)).toBe(false);
      });
    });
  });

  describe('Hong Kong specific cases', () => {
    it('should handle school numbers with leading zeros', () => {
      const id1 = generateSchoolId('edb-school-directory', '000001');
      const id2 = generateSchoolId('edb-school-directory', '00001');

      // Leading zeros matter in source record keys
      expect(id1).not.toBe(id2);
    });

    it('should handle campus names with Chinese characters', () => {
      const id = generateCampusId('sch_abc123', '分校A', undefined);

      expect(id).not.toBeNull();
      expect(isValidCampusId(id)).toBe(true);
    });

    it('should support multi-campus schools', () => {
      const id1 = generateItemKey('sch_abc123', 'AM', 'camp_北角校舍');
      const id2 = generateItemKey('sch_abc123', 'PM', 'camp_銅鑼灣校舍');

      expect(id1).not.toBe(id2);
    });
  });
});
