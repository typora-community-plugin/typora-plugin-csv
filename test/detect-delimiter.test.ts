import { describe, test, expect } from 'vitest'
import { CSVUtils } from '../src/utils/csv-utils'

describe('delimiter detection', () => {
  test('detects comma for simple CSV', () => {
    expect(CSVUtils.detectDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',')
  })

  test('detects semicolon for semicolon CSV', () => {
    expect(CSVUtils.detectDelimiter('a;b;c\n1;2;3\n4;5;6')).toBe(';')
  })

  test('detects tab for TSV', () => {
    expect(CSVUtils.detectDelimiter('a\tb\tc\n1\t2\t3\n4\t5\t6')).toBe('\t')
  })

  test('detects pipe', () => {
    expect(CSVUtils.detectDelimiter('a|b|c\n1|2|3\n4|5|6')).toBe('|')
  })

  test('ignores delimiters inside quotes', () => {
    expect(CSVUtils.detectDelimiter('name,desc\n"Quote, inside",value\n"Another, one",other')).toBe(',')
  })

  test('handles multiline quoted fields and selects the best delimiter', () => {
    expect(
      CSVUtils.detectDelimiter('name;notes\n"Multi\nLine; still inside";ok\n"Another\nEntry";good'),
    ).toBe(';')
  })

  test('falls back to comma for empty input', () => {
    expect(CSVUtils.detectDelimiter('')).toBe(',')
  })
})
