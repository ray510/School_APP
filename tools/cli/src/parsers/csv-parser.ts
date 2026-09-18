/**
 * CSV 解析器，支援 UTF-8 BOM、引號內換行、多編碼
 * 針對香港官方資料來源（教育局 S01）最佳化
 */

export interface ParseOptions {
  hasHeader?: boolean;
  encoding?: BufferEncoding;
  delimiter?: string;
  quote?: string;
  escape?: string;
}

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  encoding: string;
  issues: {
    emptyLines: number;
    quoteMismatch: number;
    warnings: string[];
  };
}

/**
 * 偵測並移除 UTF-8 BOM
 */
export function removeBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 偵測檔案編碼（簡單檢測 UTF-8 vs BIG5）
 * 返回編碼名稱和轉換後的文字
 */
export function detectEncoding(buffer: Buffer): { encoding: string; text: string } {
  // 嘗試 UTF-8（支援 BOM）
  try {
    const text = buffer.toString('utf8');
    // 檢查是否為有效 UTF-8
    if (/[�]/.test(text)) {
      // 無效 UTF-8，嘗試 BIG5
      return {
        encoding: 'BIG5',
        text: buffer.toString('binary')
      };
    }
    return {
      encoding: 'UTF-8',
      text
    };
  } catch {
    // 使用 BIG5
    return {
      encoding: 'BIG5',
      text: buffer.toString('binary')
    };
  }
}

/**
 * 主 CSV 解析函式
 * 正確處理引號、換行、空值
 */
export function parseCSV(
  content: string | Buffer,
  options: ParseOptions = {}
): ParseResult {
  const {
    hasHeader = true,
    delimiter = ',',
    quote = '"',
    escape = '"'
  } = options;

  // 轉換為文字
  let text: string;
  let encoding: string;

  if (Buffer.isBuffer(content)) {
    const detected = detectEncoding(content);
    text = detected.text;
    encoding = detected.encoding;
  } else {
    text = content;
    encoding = 'UTF-8';
  }

  // 移除 BOM
  text = removeBOM(text);

  const issues = {
    emptyLines: 0,
    quoteMismatch: 0,
    warnings: [] as string[]
  };

  // 逐行解析，考慮引號內的換行
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;
  let consecutiveQuotes = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === quote) {
      consecutiveQuotes++;
      currentLine += char;

      // 檢查逃逸引號（引號內的引號用雙引號表示）
      if (inQuotes && nextChar === quote) {
        // 這是逃逸引號，跳過下一個
        i++;
        currentLine += nextChar;
        consecutiveQuotes = 0;
      } else if (consecutiveQuotes % 2 === 1) {
        // 奇數個引號，切換狀態
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // 行尾且不在引號內
      if (currentLine.trim()) {
        lines.push(currentLine);
      } else {
        issues.emptyLines++;
      }
      currentLine = '';
      consecutiveQuotes = 0;

      // 處理 \r\n
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentLine += char;
      consecutiveQuotes = 0;
    }
  }

  // 最後一行
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  // 檢查未關閉的引號
  if (inQuotes) {
    issues.quoteMismatch++;
    issues.warnings.push('檔案尾部有未關閉的引號');
  }

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      rowCount: 0,
      encoding,
      issues
    };
  }

  // 解析欄位
  const parseFields = (line: string): string[] => {
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === quote) {
        if (inQuotes && nextChar === quote) {
          // 逃逸引號
          currentField += quote;
          i += 2;
        } else {
          // 引號開關
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === delimiter && !inQuotes) {
        // 欄位分隔符
        fields.push(currentField.trim());
        currentField = '';
        i++;
      } else {
        currentField += char;
        i++;
      }
    }

    fields.push(currentField.trim());
    return fields;
  };

  // 提取表頭
  let headers: string[] = [];
  let dataStartIndex = 0;

  if (hasHeader && lines.length > 0) {
    headers = parseFields(lines[0]);
    dataStartIndex = 1;
  } else {
    // 推斷欄位數
    const columnCount = parseFields(lines[0]).length;
    headers = Array.from({ length: columnCount }, (_, i) => `Column${i + 1}`);
  }

  // 解析資料行
  const rows: Record<string, string>[] = [];
  for (let i = dataStartIndex; i < lines.length; i++) {
    const fields = parseFields(lines[i]);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j] || '';
    }

    rows.push(row);
  }

  return {
    headers,
    rows,
    rowCount: rows.length,
    encoding,
    issues
  };
}

/**
 * 針對香港教育局 S01（School Location）的特化解析
 */
export function parseEDBDirectory(
  content: string | Buffer
): ParseResult & { missingFields: string[] } {
  const result = parseCSV(content, { hasHeader: true });

  // 驗證必要欄位
  const requiredFields = [
    'SCHOOL NO.',
    'ENGLISH NAME',
    '中文名稱',
    'ENGLISH ADDRESS',
    '中文地址'
  ];

  const missingFields = requiredFields.filter(f => !result.headers.includes(f));

  if (missingFields.length > 0) {
    result.issues.warnings.push(
      `缺失必要欄位: ${missingFields.join(', ')}`
    );
  }

  return {
    ...result,
    missingFields
  };
}
