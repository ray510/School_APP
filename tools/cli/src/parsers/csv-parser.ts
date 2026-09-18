/** Strict CSV reader. Encoding must be supplied by the source contract, not guessed. */
export type SourceEncoding = 'utf8' | 'utf-8' | 'big5';
export interface ParseOptions {
  hasHeader?: boolean;
  encoding?: SourceEncoding;
  delimiter?: string;
  quote?: string;
  escape?: string;
}
export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  encoding: string;
  issues: { emptyLines: number; quoteMismatch: number; warnings: string[] };
}
export class CsvParseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CsvParseError';
    this.code = code;
  }
}
const MAX_BYTES = 20 * 1024 * 1024;
export function removeBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
/** Compatibility name: validates an explicitly selected encoding; does NOT auto-detect BIG5. */
export function detectEncoding(
  buffer: Buffer,
  encoding: SourceEncoding = 'utf8'
): { encoding: string; text: string } {
  if (buffer.byteLength > MAX_BYTES) throw new CsvParseError('TOO_LARGE', 'CSV exceeds 20 MiB');
  if (!['utf8', 'utf-8', 'big5'].includes(encoding)) {
    throw new CsvParseError('UNSUPPORTED_ENCODING', 'Use an encoding verified in the source contract');
  }
  try {
    return {
      encoding: encoding === 'big5' ? 'BIG5' : 'UTF-8',
      text: new TextDecoder(encoding === 'big5' ? 'big5' : 'utf-8', { fatal: true }).decode(buffer)
    };
  } catch {
    throw new CsvParseError('INVALID_ENCODING', `Invalid ${encoding} bytes; no automatic fallback`);
  }
}
export function parseCSV(content: string | Buffer, options: ParseOptions = {}): ParseResult {
  const { hasHeader = true, delimiter = ',', quote = '"', escape = quote } = options;
  if (delimiter.length !== 1 || quote.length !== 1 || delimiter === quote ||
      /[\r\n]/.test(delimiter + quote) || escape !== quote) {
    throw new CsvParseError('INVALID_OPTIONS', 'Only one-character delimiters and doubled-quote escaping are supported');
  }
  if (Buffer.byteLength(content) > MAX_BYTES) throw new CsvParseError('TOO_LARGE', 'CSV exceeds 20 MiB');
  const decoded = Buffer.isBuffer(content)
    ? detectEncoding(content, options.encoding)
    : { text: content, encoding: 'UTF-8' };
  const text = removeBOM(decoded.text);
  if (/^\s*(?:<!doctype\s+html|<html|<head|<body)\b/i.test(text)) {
    throw new CsvParseError('HTML_RESPONSE', 'Received HTML instead of CSV');
  }
  if (text.includes('\0') || text.includes('\uFFFD')) {
    throw new CsvParseError('INVALID_TEXT', 'NUL or replacement character in decoded CSV');
  }

  const records: string[][] = [];
  const issues = { emptyLines: 0, quoteMismatch: 0, warnings: [] as string[] };
  let record: string[] = [];
  let field = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let quotedField = false;
  let touched = false;
  const endField = () => {
    record.push(quotedField ? field : field.trim());
    field = '';
    quotedField = false;
    state = 'start';
  };
  const endRecord = () => {
    const blank = record.length === 0 && !quotedField && field.trim() === '';
    if (blank) {
      issues.emptyLines++;
      field = '';
      state = 'start';
    } else {
      endField();
      records.push(record);
      record = [];
    }
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    touched = true;
    if (state === 'quoted') {
      if (char === quote) {
        if (text[i + 1] === quote) { field += quote; i++; }
        else state = 'closed';
      } else field += char;
      continue;
    }
    if (char === delimiter) { endField(); continue; }
    if (char === '\r' || char === '\n') {
      endRecord();
      if (char === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    if (state === 'closed') {
      if (char === ' ' || char === '\t') continue;
      throw new CsvParseError('AFTER_QUOTE', 'Unexpected text after a closing quote');
    }
    if (char === quote) {
      if (state !== 'start') throw new CsvParseError('UNEXPECTED_QUOTE', 'Quote inside an unquoted field');
      quotedField = true;
      state = 'quoted';
    } else {
      state = 'plain';
      field += char;
    }
  }
  if (state === 'quoted') throw new CsvParseError('UNCLOSED_QUOTE', 'Unclosed quoted field');
  if (touched) endRecord();
  if (records.length === 0) return { headers: [], rows: [], rowCount: 0, encoding: decoded.encoding, issues };

  const headers = hasHeader
    ? records.shift()!.map(header => header.trim())
    : records[0].map((_, i) => `Column${i + 1}`);
  if (headers.some(header => !header) || new Set(headers).size !== headers.length) {
    throw new CsvParseError('INVALID_HEADER', 'Empty or duplicate column names');
  }
  const rows = records.map((fields, index) => {
    if (fields.length > headers.length) {
      throw new CsvParseError('EXTRA_FIELDS', `Record ${index + 1} has more fields than its header`);
    }
    // Short records are visible warnings, never silently accepted by the normalizer.
    if (fields.length < headers.length) issues.warnings.push(`Record ${index + 1} is missing trailing fields`);
    return Object.fromEntries(headers.map((header, i) => [header, fields[i] ?? '']));
  });
  return { headers, rows, rowCount: rows.length, encoding: decoded.encoding, issues };
}
export function parseEDBDirectory(content: string | Buffer, options: ParseOptions = {}): ParseResult & { missingFields: string[] } {
  const result = parseCSV(content, { ...options, hasHeader: true });
  const required = ['SCHOOL NO.', 'ENGLISH NAME', '中文名稱', 'ENGLISH ADDRESS', '中文地址'];
  const missingFields = required.filter(field => !result.headers.includes(field));
  if (missingFields.length) result.issues.warnings.push(`Missing required fields: ${missingFields.join(', ')}`);
  return { ...result, missingFields };
}
