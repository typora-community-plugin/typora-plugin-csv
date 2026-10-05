import { describe, test, expect } from 'vitest'
import { CSVUtils } from '../src/utils/csv-utils'

describe('CSV parser core', () => {
  describe('basic parsing', () => {
    test('parses simple comma-separated values', () => {
      const csv = 'name,age,email\nJohn,25,john@example.com\nJane,30,jane@example.com'
      expect(CSVUtils.parseCSV(csv)).toEqual([
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com'],
        ['Jane', '30', 'jane@example.com'],
      ])
    })

    test('handles quoted fields with commas', () => {
      const csv = 'name,description\n"John Doe","A person, with comma"\n"Jane","Normal description"'
      expect(CSVUtils.parseCSV(csv)).toEqual([
        ['name', 'description'],
        ['John Doe', 'A person, with comma'],
        ['Jane', 'Normal description'],
      ])
    })

    test('handles escaped quotes inside quoted fields', () => {
      const csv = 'name,description\n"Alice ""Wonder"" Land","Contains ""quotes"" inside"'
      expect(CSVUtils.parseCSV(csv)).toEqual([
        ['name', 'description'],
        ['Alice "Wonder" Land', 'Contains "quotes" inside'],
      ])
    })
  })

  describe('delimiter support', () => {
    test('handles semicolon delimiter', () => {
      const csv = 'name;age;email\nJohn;25;john@example.com'
      expect(CSVUtils.parseCSV(csv, { delimiter: ';' })).toEqual([
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com'],
      ])
    })

    test('handles tab delimiter (TSV)', () => {
      const csv = 'name\tage\temail\nJohn\t25\tjohn@example.com'
      expect(CSVUtils.parseCSV(csv, { delimiter: '\t' })).toEqual([
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com'],
      ])
    })
  })

  describe('edge cases', () => {
    test('handles multiline content within quotes', () => {
      const csv = 'name,description\n"Charlie\nMulti-line","This description\nspans multiple lines"'
      expect(CSVUtils.parseCSV(csv)).toEqual([
        ['name', 'description'],
        ['Charlie\nMulti-line', 'This description\nspans multiple lines'],
      ])
    })

    test('handles empty fields', () => {
      const csv = 'name,age,email\nBob,,bob@mail.com\n,40,empty@name.com'
      expect(CSVUtils.parseCSV(csv)).toEqual([
        ['name', 'age', 'email'],
        ['Bob', '', 'bob@mail.com'],
        ['', '40', 'empty@name.com'],
      ])
    })
  })

  describe('normalization', () => {
    test('normalizes irregular table data', () => {
      const data = [
        ['name', 'age', 'email'],
        ['John', '25'],
        ['Jane', '30', 'jane@example.com', 'extra'],
      ]
      expect(CSVUtils.normalizeTableData(data)).toEqual([
        ['name', 'age', 'email', ''],
        ['John', '25', '', ''],
        ['Jane', '30', 'jane@example.com', 'extra'],
      ])
    })

    test('handles empty input gracefully', () => {
      expect(CSVUtils.normalizeTableData([])).toEqual([['']])
      expect(CSVUtils.normalizeTableData(null as unknown as string[][])).toEqual([['']])
    })
  })

  describe('serialization', () => {
    test('converts a 2D array back to a CSV string', () => {
      const data = [
        ['name', 'age', 'email'],
        ['John', '25', 'john@example.com'],
        ['Jane', '30', 'jane@example.com'],
      ]
      expect(CSVUtils.unparseCSV(data)).toBe(
        'name,age,email\nJohn,25,john@example.com\nJane,30,jane@example.com',
      )
    })
  })
})
