import { describe, it, expect } from 'vitest';
import { parseCSV, removeBOM, detectEncoding, parseEDBDirectory } from './csv-parser';

describe('CSV Parser', () => {
  describe('removeBOM', () => {
    it('should remove UTF-8 BOM', () => {
      const withBOM = '﻿Hello,World';
      const result = removeBOM(withBOM);
      expect(result).toBe('Hello,World');
    });

    it('should leave non-BOM text unchanged', () => {
      const text = 'Hello,World';
      const result = removeBOM(text);
      expect(result).toBe('Hello,World');
    });
  });

  describe('parseCSV', () => {
    it('should parse simple CSV', () => {
      const csv = 'Name,Age\nAlice,30\nBob,25';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.headers).toEqual(['Name', 'Age']);
      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({ Name: 'Alice', Age: '30' });
      expect(result.rows[1]).toEqual({ Name: 'Bob', Age: '25' });
    });

    it('should handle quoted fields', () => {
      const csv = 'Name,Address\n"Alice","123 Main St"\n"Bob","456 Oak Ave"';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rows[0]).toEqual({
        Name: 'Alice',
        Address: '123 Main St'
      });
    });

    it('should handle newlines inside quotes', () => {
      const csv = 'Name,Description\n"Alice","Line 1\nLine 2"\n"Bob","Single"';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rowCount).toBe(2);
      expect(result.rows[0]).toEqual({
        Name: 'Alice',
        Description: 'Line 1\nLine 2'
      });
    });

    it('should handle escaped quotes (double quote)', () => {
      const csv = 'Name,Quote\n"Alice","Say ""Hello"""\n"Bob","No quotes"';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rows[0]).toEqual({
        Name: 'Alice',
        Quote: 'Say "Hello"'
      });
    });

    it('should handle empty lines', () => {
      const csv = 'Name,Age\n\nAlice,30\n\nBob,25\n';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rowCount).toBe(2);
      expect(result.issues.emptyLines).toBe(2);
    });

    it('should handle trailing newline', () => {
      const csv = 'Name,Age\nAlice,30\n';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rowCount).toBe(1);
      expect(result.rows[0]).toEqual({ Name: 'Alice', Age: '30' });
    });

    it('should handle \\r\\n line endings', () => {
      const csv = 'Name,Age\r\nAlice,30\r\nBob,25';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rowCount).toBe(2);
      expect(result.headers).toEqual(['Name', 'Age']);
    });

    it('should handle UTF-8 BOM in content', () => {
      const csv = '﻿Name,Age\nAlice,30';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.headers).toEqual(['Name', 'Age']);
      expect(result.encoding).toBe('UTF-8');
    });

    it('should handle missing fields', () => {
      const csv = 'Name,Age\nAlice\nBob,25';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rows[0]).toEqual({ Name: 'Alice', Age: '' });
      expect(result.rows[1]).toEqual({ Name: 'Bob', Age: '25' });
    });

    it('should trim whitespace from field values', () => {
      const csv = 'Name,Age\n  Alice  ,  30  ';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rows[0]).toEqual({ Name: 'Alice', Age: '30' });
    });

    it('should handle HTML encoding in values', () => {
      const csv = 'Name,Note\n"Alice","Test &amp; verify"';
      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rows[0].Note).toBe('Test &amp; verify');
    });
  });

  describe('detectEncoding', () => {
    it('should detect UTF-8', () => {
      const buffer = Buffer.from('Hello,World', 'utf8');
      const result = detectEncoding(buffer);

      expect(result.encoding).toBe('UTF-8');
      expect(result.text).toBe('Hello,World');
    });

    it('should handle UTF-8 with BOM', () => {
      const buffer = Buffer.from('﻿Hello,World', 'utf8');
      const result = detectEncoding(buffer);

      expect(result.encoding).toBe('UTF-8');
    });

    it('should detect Chinese characters in UTF-8', () => {
      const buffer = Buffer.from('名字,年齡\n愛麗絲,30', 'utf8');
      const result = detectEncoding(buffer);

      expect(result.encoding).toBe('UTF-8');
      expect(result.text).toContain('名字');
    });
  });

  describe('parseEDBDirectory', () => {
    it('should validate required fields', () => {
      const csv = 'Name,Location\nTest,Place';
      const result = parseEDBDirectory(csv);

      expect(result.missingFields.length).toBeGreaterThan(0);
      expect(result.missingFields).toContain('SCHOOL NO.');
      expect(result.missingFields).toContain('ENGLISH NAME');
    });

    it('should parse valid EDB directory', () => {
      const csv = `SCHOOL NO.,ENGLISH CATEGORY,中文類別,ENGLISH NAME,中文名稱,ENGLISH ADDRESS,中文地址,LONGITUDE,LATITUDE
001,Government,官立,Test School,測試學校,123 Main St,主街123號,114.1234,22.5678`;

      const result = parseEDBDirectory(csv);

      expect(result.missingFields).toHaveLength(0);
      expect(result.rowCount).toBe(1);
      expect(result.rows[0]['SCHOOL NO.']).toBe('001');
      expect(result.rows[0]['中文名稱']).toBe('測試學校');
    });

    it('should preserve leading zeros in SCHOOL NO.', () => {
      const csv = `SCHOOL NO.,ENGLISH NAME,中文名稱,ENGLISH ADDRESS,中文地址
000123,School,學校,Address,地址`;

      const result = parseEDBDirectory(csv);

      expect(result.rows[0]['SCHOOL NO.']).toBe('000123');
    });
  });

  describe('Hong Kong specific cases', () => {
    it('should handle traditional Chinese characters', () => {
      const csv = `名字,備註
"香港教育學院附屬學校","全日制 & 半日制"`;

      const result = parseCSV(csv);

      expect(result.rows[0]['名字']).toContain('香港');
      expect(result.rows[0]['備註']).toContain('全日制');
    });

    it('should handle special district names', () => {
      const csv = `District
"深水埗區"
"油尖旺區"
"香港島東區"`;

      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rowCount).toBe(3);
      expect(result.rows[0].District).toBe('深水埗區');
    });

    it('should handle school types with special characters', () => {
      const csv = `Type
"官立/津貼"
"直資/私校"`;

      const result = parseCSV(csv, { hasHeader: true });

      expect(result.rows[0].Type).toContain('/');
    });
  });
});
