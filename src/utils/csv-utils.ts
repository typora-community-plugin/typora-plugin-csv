import * as Papa from 'papaparse'

export interface CSVParseConfig {
  header: boolean
  dynamicTyping: boolean
  skipEmptyLines: boolean
  /** Use `'auto'` to enable auto-detection. */
  delimiter?: string
  quoteChar: string
  escapeChar: string
}

/**
 * CSV parsing / serialization helpers, ported from csv-lite.
 * Pure module: no DOM, no plugin dependencies, fully unit-testable.
 */
export class CSVUtils {

  static defaultConfig: CSVParseConfig = {
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    delimiter: 'auto',
    quoteChar: '"',
    escapeChar: '"',
  }

  /**
   * Delimiter detection: counts candidate delimiters (comma / semicolon / tab /
   * pipe) outside quotes in the first few records and picks the candidate whose
   * field count is the most consistent and greater than one.
   */
  static detectDelimiter(csvString: string, quoteChar = '"'): string {
    if (!csvString || csvString.length === 0) return ','
    const candidates = [',', ';', '\t', '|']

    // Build logical records honoring quoted multiline fields.
    const records: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < csvString.length; i++) {
      const ch = csvString[i]
      if (ch === quoteChar) {
        if (i + 1 < csvString.length && csvString[i + 1] === quoteChar) {
          cur += quoteChar
          i++
          continue
        }
        inQuote = !inQuote
        cur += ch
        continue
      }
      if (!inQuote && ch === '\n') {
        records.push(cur)
        cur = ''
        continue
      }
      if (!inQuote && ch === '\r') continue
      cur += ch
    }
    if (cur.length > 0) records.push(cur)

    const sample = records.filter(r => r.trim().length > 0).slice(0, 20)
    if (sample.length === 0) return ','

    const countFields = (record: string, delim: string): number => {
      let inQ = false
      let count = 0
      for (let i = 0; i < record.length; i++) {
        const ch = record[i]
        if (ch === quoteChar) {
          if (i + 1 < record.length && record[i + 1] === quoteChar) {
            i++
            continue
          }
          inQ = !inQ
          continue
        }
        if (!inQ && ch === delim) count++
      }
      return count + 1
    }

    let best: { delim: string; score: number; avgFields: number } | null = null
    for (const d of candidates) {
      const counts = sample.map(r => countFields(r, d))
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length
      const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length
      const score = (avg > 1 ? avg : 0) - variance * 0.1
      if (!best || score > best.score) {
        best = { delim: d, score, avgFields: avg }
      }
    }
    return best && best.avgFields >= 1.5 ? best.delim : ','
  }

  /** Parse a CSV string into a 2D array. */
  static parseCSV(csvString: string, config?: Partial<CSVParseConfig>): string[][] {
    try {
      const parseConfig: CSVParseConfig = { ...this.defaultConfig, ...config }
      if (!parseConfig.delimiter || parseConfig.delimiter === 'auto') {
        parseConfig.delimiter = this.detectDelimiter(csvString, parseConfig.quoteChar)
      }
      const parseResult = Papa.parse<string[]>(csvString, parseConfig as Papa.ParseConfig)
      if (parseResult.errors && parseResult.errors.length > 0) {
        console.warn('CSV parse warnings:', parseResult.errors)
      }
      return parseResult.data
    } catch (error) {
      console.error('CSV parse error:', error)
      return [['']]
    }
  }

  /** Serialize a 2D array back to a CSV string. */
  static unparseCSV(data: string[][], config?: Papa.UnparseConfig): string {
    const defaultUnparseConfig: Papa.UnparseConfig = { header: false, newline: '\n' }
    return Papa.unparse(data, { ...defaultUnparseConfig, ...config })
  }

  /**
   * Detect the dominant newline style (CRLF vs LF). Used to restore the
   * original newline on save so merely viewing a file never rewrites it.
   */
  static detectNewline(csvString: string): string {
    if (!csvString) return '\n'
    let crlf = 0
    let lf = 0
    for (let i = 0; i < csvString.length; i++) {
      if (csvString.charCodeAt(i) === 10) {
        if (i > 0 && csvString.charCodeAt(i - 1) === 13) crlf++
        else lf++
      }
    }
    if (crlf > 0 && lf === 0) return '\r\n'
    return crlf > lf ? '\r\n' : '\n'
  }

  /**
   * Extract the trailing newline sequence (e.g. `"\n"`, `"\n\n"`, `"\r\n"`)
   * and the number of "phantom" rows PapaParse will produce for it.
   * A `\r\n` counts as a single line terminator.
   */
  static getTrailingNewline(csvString: string): { newline: string; rowCount: number } {
    if (!csvString) return { newline: '', rowCount: 0 }
    let start = csvString.length
    while (start > 0 && (csvString[start - 1] === '\n' || csvString[start - 1] === '\r')) {
      start--
    }
    const newline = csvString.slice(start)
    let rowCount = 0
    for (let i = 0; i < newline.length; i++) {
      if (newline.charCodeAt(i) === 10) rowCount++
    }
    return { newline, rowCount }
  }

  /**
   * Remove the phantom empty rows the parser creates because of a trailing
   * newline. Always keeps at least one row; the caller re-appends the newline
   * on save.
   */
  static dropTrailingRows(tableData: string[][], rowCount: number): string[][] {
    if (!tableData || rowCount <= 0) return tableData
    const removable = Math.min(rowCount, Math.max(0, tableData.length - 1))
    if (removable <= 0) return tableData
    return tableData.slice(0, tableData.length - removable)
  }

  /** Ensure every row has the same number of columns. */
  static normalizeTableData(tableData: string[][]): string[][] {
    if (!tableData || tableData.length === 0) return [['']]
    let maxCols = 0
    for (const row of tableData) {
      if (row) maxCols = Math.max(maxCols, row.length)
    }
    return tableData.map(row => {
      const newRow = row ? [...row] : []
      while (newRow.length < maxCols) newRow.push('')
      return newRow
    })
  }
}
