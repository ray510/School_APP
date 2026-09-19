import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, detectEncoding, parseEDBDirectory } from '../../tools/cli/src/parsers/csv-parser.ts';
import { normalizeEDBDirectory, createProfileVersion } from '../../tools/cli/src/normalizers/edb-directory.ts';
import { generateSchoolId, generateItemKey, parseItemKey, isValidSessionCode } from '../../packages/contracts/src/identity.ts';

const header = 'SCHOOL NO.,ENGLISH CATEGORY,ENGLISH NAME,中文名稱,ENGLISH ADDRESS,中文地址,LONGITUDE,LATITUDE';
const row = '000123,TEST_PRIMARY,Example College Kindergarten,測試幼稚園中學,Test address,測試地址,114.1,22.3';
const csv = `${header}\n${row}`;
// Synthetic data only; TEST_PRIMARY is NOT a claimed official category.
const context = {
  sourceId: 'test-source', snapshotId: 'test-snapshot-001', sourceReferencePeriod: null,
  retrievedAt: '2026-09-18T12:00:00Z', parserVersion: 'csv-2', categoryMappingVersion: 'synthetic-1',
  categoryLevels: { TEST_PRIMARY: 'PRIMARY' }
};

test('quoted empty cell cannot swallow the next row', () => {
  const result = parseCSV('Name,Note\nAlice,""\nBob,ok');
  assert.equal(result.rowCount, 2);
  assert.deepEqual(result.rows, [{ Name: 'Alice', Note: '' }, { Name: 'Bob', Note: 'ok' }]);
});
test('consecutive quoted empties and an entirely quoted-empty record survive', () => {
  assert.deepEqual(parseCSV('a,b\n"",""\nx,y').rows, [{a:'',b:''},{a:'x',b:'y'}]);
  assert.deepEqual(parseCSV('a\n""\nx').rows, [{a:''},{a:'x'}]);
});
test('escaped quotes, embedded comma and multiline text', () => {
  assert.deepEqual(parseCSV('a,b\n"Say ""hi""","x,y\r\nz"').rows, [{a:'Say "hi"',b:'x,y\r\nz'}]);
});
test('CRLF, blank lines, BOM and leading zeroes', () => {
  const result = parseCSV('\ufeffa,b\r\n\r\n00001,中文\r\n');
  assert.deepEqual(result.rows, [{a:'00001',b:'中文'}]);
  assert.equal(result.issues.emptyLines, 1);
});
test('quoted spaces retained; plain spaces trimmed', () => {
  assert.deepEqual(parseCSV('a,b\n"  x  ",  y  ').rows, [{a:'  x  ',b:'y'}]);
});
test('trailing empty fields preserved', () => assert.deepEqual(parseCSV('a,b\nx,').rows, [{a:'x',b:''}]));
test('empty document has no rows', () => assert.equal(parseCSV('').rowCount, 0));
test('alternate delimiter and no header', () => assert.deepEqual(parseCSV('x;y', {delimiter:';',hasHeader:false}).rows, [{Column1:'x',Column2:'y'}]));
test('unclosed quoted input rejected', () => assert.throws(() => parseCSV('a\n"x'), {code:'UNCLOSED_QUOTE'}));
test('quote in plain field rejected', () => assert.throws(() => parseCSV('a\nx"y'), {code:'UNEXPECTED_QUOTE'}));
test('characters after quote rejected', () => assert.throws(() => parseCSV('a\n"x"y'), {code:'AFTER_QUOTE'}));
test('duplicate and empty headers rejected', () => {
  assert.throws(() => parseCSV('a,a\nx,y'), {code:'INVALID_HEADER'});
  assert.throws(() => parseCSV('a,\nx,y'), {code:'INVALID_HEADER'});
});
test('extra fields never silently discarded', () => assert.throws(() => parseCSV('a\nx,y'), {code:'EXTRA_FIELDS'}));
test('short row is an explicit warning', () => {
  const result = parseCSV('a,b\nx');
  assert.equal(result.issues.warnings.length, 1);
  assert.deepEqual(result.rows, [{a:'x',b:''}]);
});
test('HTTP 200 HTML bodies rejected', () => assert.throws(() => parseCSV('<!DOCTYPE html><html>error</html>'), {code:'HTML_RESPONSE'}));
test('prototype-like column names remain own data properties', () => {
  const result = parseCSV('__proto__,constructor\nx,y');
  assert.equal(Object.hasOwn(result.rows[0], '__proto__'), true);
  assert.equal(result.rows[0].__proto__, 'x');
});
test('valid UTF-8 bytes including BOM decode correctly', () => {
  assert.equal(detectEncoding(Buffer.from('\ufeff中文')).text, '中文');
});
test('BIG5 decoding is explicit and correct, never Latin-1', () => {
  const bytes = Buffer.from([0xa4,0xa4,0xa4,0xe5]);
  assert.deepEqual(detectEncoding(bytes, 'big5'), {encoding:'BIG5',text:'中文'});
  assert.throws(() => detectEncoding(bytes), {code:'INVALID_ENCODING'});
});
test('broken UTF-8, NUL and replacement characters rejected', () => {
  assert.throws(() => detectEncoding(Buffer.from([0xff])), {code:'INVALID_ENCODING'});
  assert.throws(() => parseCSV('a\nx\0'), {code:'INVALID_TEXT'});
  assert.throws(() => parseCSV('a\n\ufffd'), {code:'INVALID_TEXT'});
});
test('oversized files rejected before parsing', () => {
  assert.throws(() => parseCSV(Buffer.alloc(20*1024*1024+1)), {code:'TOO_LARGE'});
});
test('EDB required headers checked', () => assert.ok(parseEDBDirectory('name\nx').missingFields.includes('SCHOOL NO.')));
test('source context mandatory, no invented dates', () => assert.throws(() => normalizeEDBDirectory(csv), /source context/));
test('reviewed category wins over misleading school name', () => {
  const result = normalizeEDBDirectory(csv, context);
  assert.equal(result.stats.success, 1);
  assert.equal(result.schools[0].level, 'PRIMARY');
  assert.equal(result.schools[0].school_no, '000123');
});
test('unmapped category is quarantined, never defaults to primary', () => {
  const result = normalizeEDBDirectory(csv, {...context, categoryLevels:{}});
  assert.equal(result.stats.failed, 1);
  assert.equal(result.schools.length, 0);
});
test('inherited dictionary properties cannot classify schools', () => {
  const result = normalizeEDBDirectory(csv, {...context, categoryLevels:Object.create({TEST_PRIMARY:'PRIMARY'})});
  assert.equal(result.stats.failed, 1);
});
test('missing session stays UNKNOWN and unverified campus stays null', () => {
  const result = normalizeEDBDirectory(csv, context);
  assert.equal(result.schools[0].session_code, 'UNKNOWN');
  assert.equal(result.mappings[0].sessionCode, 'UNKNOWN');
  assert.equal(result.mappings[0].campusId, null);
});
test('duplicate school keys quarantine every conflicting record', () => {
  const result = normalizeEDBDirectory(`${csv}\n${row}`, context);
  assert.equal(result.stats.failed, 2);
  assert.equal(result.schools.length, 0);
});
test('short rows block the entire batch', () => {
  const result = normalizeEDBDirectory(`${header}\n000123`, context);
  assert.equal(result.stats.failed, 1);
  assert.equal(result.schools.length, 0);
});
test('out-of-range coordinates rejected', () => {
  const result = normalizeEDBDirectory(csv.replace('114.1,22.3','114.1,91'), context);
  assert.equal(result.stats.failed, 1);
});
test('provenance comes from supplied snapshot; reference period may stay unknown', () => {
  const school = normalizeEDBDirectory(csv, context).schools[0];
  const profile = createProfileVersion(school);
  assert.deepEqual(profile.source_snapshot_ids, ['test-snapshot-001']);
  assert.equal(profile.content.source_reference_period, null);
  assert.equal(profile.created_at, context.retrievedAt);
  assert.equal(profile.content.verified, false);
  assert.deepEqual(profile.content.session, {value:null,state:'not_provided'});
  assert.equal(Object.hasOwn(profile.content, 'entry_year_start'), false);
});
test('replay keeps source IDs stable; no implicit publication approval', () => {
  const a = normalizeEDBDirectory(csv, context);
  const b = normalizeEDBDirectory(csv, {...context, snapshotId:'test-snapshot-002'});
  assert.equal(a.schools[0].school_id, b.schools[0].school_id);
  assert.equal(a.publishable, false);
});
test('original deterministic school ID algorithm retained', () => {
  assert.equal(generateSchoolId('edb-school-directory','000123'), generateSchoolId('edb-school-directory','000123'));
  assert.notEqual(generateSchoolId('edb-school-directory','000123'), generateSchoolId('edb-school-directory','123'));
});
test('UNKNOWN item key round-trips and invalid sessions are rejected', () => {
  const key = generateItemKey('sch_test', 'UNKNOWN');
  assert.deepEqual(parseItemKey(key), {schoolId:'sch_test',campusId:null,sessionCode:'UNKNOWN'});
  assert.throws(() => parseItemKey('sch_test::BAD'));
  assert.equal(isValidSessionCode(['AM']), false);
});
