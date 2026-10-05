/** Table structure helpers. Pure functions (no DOM at import time). */
export class TableUtils {

  /** Auto column width only samples the first N rows for large tables. */
  static readonly COLUMN_WIDTH_SAMPLE_ROWS = 200

  static calculateColumnWidths(tableData: string[][]): number[] {
    if (!tableData || tableData.length === 0 || !tableData[0]) return []

    const columnWidths = tableData[0].map(() => 100)
    const sampleRows = Math.min(tableData.length, TableUtils.COLUMN_WIDTH_SAMPLE_ROWS)

    for (let r = 0; r < sampleRows; r++) {
      const row = tableData[r]
      if (!row) continue
      for (let c = 0; c < row.length; c++) {
        const cell = row[c] ?? ''
        const estimatedWidth = Math.max(50, Math.min(300, cell.length * 10))
        columnWidths[c] = Math.max(columnWidths[c] ?? 100, estimatedWidth)
      }
    }
    return columnWidths
  }

  static addRow(tableData: string[][]): string[][] {
    const colCount = tableData.length > 0 ? tableData[0].length : 1
    return [...tableData, Array(colCount).fill('')]
  }

  static deleteRow(tableData: string[][]): string[][] {
    if (tableData.length <= 1) return tableData
    return tableData.slice(0, -1)
  }

  static addColumn(tableData: string[][]): string[][] {
    return tableData.map(row => [...row, ''])
  }

  static deleteColumn(tableData: string[][]): string[][] {
    if (!tableData[0] || tableData[0].length <= 1) return tableData
    return tableData.map(row => row.slice(0, -1))
  }

  static addColumnToLeft(tableData: string[][], columnIndex: number): string[][] {
    if (!tableData || tableData.length === 0) return []
    return tableData.map(row => {
      const newRow = [...row]
      newRow.splice(columnIndex, 0, '')
      return newRow
    })
  }

  static addColumnToRight(tableData: string[][], columnIndex: number): string[][] {
    if (!tableData || tableData.length === 0) return []
    return tableData.map(row => {
      const newRow = [...row]
      newRow.splice(columnIndex + 1, 0, '')
      return newRow
    })
  }

  /** Excel-style column label: 0→A, 25→Z, 26→AA. */
  static getColumnLabel(index: number): string {
    let label = ''
    let n = index
    while (n >= 0) {
      label = String.fromCharCode(65 + (n % 26)) + label
      n = Math.floor(n / 26) - 1
    }
    return label
  }

  /** Cell address such as `A1`, `B2`. */
  static getCellAddress(rowIndex: number, colIndex: number): string {
    return `${this.getColumnLabel(colIndex)}${rowIndex + 1}`
  }

  /** Read the visible text of a rendered table element. */
  static getTableData(tableEl: HTMLElement): string[][] {
    const rows = Array.from(tableEl.querySelectorAll('tr'))
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td, th'))
      return cells.map(cell => cell.textContent || '')
    })
  }
}
