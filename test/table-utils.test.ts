import { describe, test, expect } from 'vitest'
import { TableUtils } from '../src/utils/table-utils'

describe('TableUtils.calculateColumnWidths', () => {
  test('gives every column at least the default width', () => {
    expect(TableUtils.calculateColumnWidths([['a', 'b']])).toEqual([100, 100])
  })

  test('widens a column to fit its longest cell', () => {
    const widths = TableUtils.calculateColumnWidths([
      ['id', 'name'],
      ['1', 'a fairly long value'],
    ])
    expect(widths[0]).toBe(100)
    expect(widths[1]).toBe('a fairly long value'.length * 10)
  })

  test('caps the width at 300px', () => {
    expect(TableUtils.calculateColumnWidths([['x'.repeat(200)]])[0]).toBe(300)
  })

  test('never goes below 50px even for empty cells', () => {
    expect(TableUtils.calculateColumnWidths([['', '']])).toEqual([100, 100])
  })

  test('returns [] for empty input', () => {
    expect(TableUtils.calculateColumnWidths([])).toEqual([])
    expect(TableUtils.calculateColumnWidths(null as unknown as string[][])).toEqual([])
  })

  test('returns one width per column of the first row', () => {
    expect(TableUtils.calculateColumnWidths([['a', 'b', 'c']])).toHaveLength(3)
  })

  test('only samples the first N rows on large tables', () => {
    const n = TableUtils.COLUMN_WIDTH_SAMPLE_ROWS
    const rows: string[][] = []
    for (let i = 0; i < n; i++) rows.push(['short', 'short'])
    rows.push(['short', 'x'.repeat(200)])
    expect(TableUtils.calculateColumnWidths(rows)[1]).toBe(100)
  })

  test('does not crash on missing cells', () => {
    expect(TableUtils.calculateColumnWidths([['a', 'b', 'c'], ['x']])).toHaveLength(3)
  })
})

describe('TableUtils row/column operations', () => {
  test('addRow appends an empty row with the current column count', () => {
    expect(TableUtils.addRow([['a', 'b']])).toEqual([['a', 'b'], ['', '']])
  })

  test('deleteRow refuses to remove the last row', () => {
    expect(TableUtils.deleteRow([['a']])).toEqual([['a']])
  })

  test('addColumn appends an empty cell to every row', () => {
    expect(TableUtils.addColumn([['a'], ['b']])).toEqual([['a', ''], ['b', '']])
  })

  test('addColumnToLeft/Right insert at the correct index', () => {
    expect(TableUtils.addColumnToLeft([['a', 'b']], 1)).toEqual([['a', '', 'b']])
    expect(TableUtils.addColumnToRight([['a', 'b']], 0)).toEqual([['a', '', 'b']])
  })
})

describe('TableUtils labels and addresses', () => {
  test('getColumnLabel is Excel-style', () => {
    expect(TableUtils.getColumnLabel(0)).toBe('A')
    expect(TableUtils.getColumnLabel(25)).toBe('Z')
    expect(TableUtils.getColumnLabel(26)).toBe('AA')
    expect(TableUtils.getColumnLabel(27)).toBe('AB')
  })

  test('getCellAddress combines label and 1-based row', () => {
    expect(TableUtils.getCellAddress(0, 0)).toBe('A1')
    expect(TableUtils.getCellAddress(9, 1)).toBe('B10')
  })
})
