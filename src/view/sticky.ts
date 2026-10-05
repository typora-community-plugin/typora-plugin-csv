import { query, queryAll, setCssStyles } from '../utils/dom'

export interface StickyContext {
  tableEl: HTMLElement
  columnWidths: number[]
  stickyRows: Set<number>
  stickyColumns: Set<number>
  /** Header row / column letters are pinned by default. */
  stickyHeaders: boolean
  /** Row-number column is pinned by default. */
  stickyRowNumbers: boolean
}

/**
 * Compute and apply sticky classes + offsets. Ported from csv-lite's
 * `applyStickyStyles()`. Must run after the table has been rendered (offset
 * widths/heights are measured from the live DOM).
 */
export function applyStickyStyles(ctx: StickyContext): void {
  const { tableEl, columnWidths, stickyRows, stickyColumns } = ctx
  if (!tableEl) return

  queryAll(
    tableEl,
    '.typ-csv-sticky-row, .typ-csv-sticky-col, .typ-csv-sticky-header, .typ-csv-sticky-row-number',
  ).forEach(el => {
    el.classList.remove(
      'typ-csv-sticky-row',
      'typ-csv-sticky-col',
      'typ-csv-sticky-header',
      'typ-csv-sticky-row-number',
    )
    setCssStyles(el as HTMLElement, { left: '', top: '' })
  })

  const getRowNumberWidth = (): number => {
    const firstRowNumber = query<HTMLElement>(tableEl, 'tbody tr.typ-csv-data-row td:first-child')
    return firstRowNumber ? firstRowNumber.offsetWidth : 40
  }

  const getHeaderHeight = (): number => {
    const headerRow = query<HTMLElement>(tableEl, 'thead tr')
    return headerRow ? headerRow.offsetHeight : 30
  }

  const calculateStickyColumnsWidth = (upToIndex: number): number => {
    let totalWidth = getRowNumberWidth()
    for (let i = 0; i < upToIndex; i++) {
      if (stickyColumns.has(i)) {
        const headerCell = query<HTMLElement>(tableEl, `thead tr th:nth-child(${i + 2})`)
        totalWidth += headerCell ? headerCell.offsetWidth : columnWidths[i] || 100
      }
    }
    return totalWidth
  }

  const calculateStickyRowsHeight = (upToIndex: number): number => {
    let totalHeight = getHeaderHeight()
    for (let i = 0; i < upToIndex; i++) {
      if (stickyRows.has(i)) {
        const row = query<HTMLElement>(tableEl, `tbody tr:nth-child(${i + 1})`)
        totalHeight += row ? row.offsetHeight : 32
      }
    }
    return totalHeight
  }

  if (ctx.stickyHeaders) {
    queryAll<HTMLElement>(tableEl, 'thead tr th').forEach(cell => {
      cell.classList.add('typ-csv-sticky-header')
      setCssStyles(cell, { top: '0px' })
    })
  }

  if (ctx.stickyRowNumbers) {
    const headerRowNumber = query<HTMLElement>(tableEl, 'thead tr th:first-child')
    if (headerRowNumber) {
      headerRowNumber.classList.add('typ-csv-sticky-row-number')
      setCssStyles(headerRowNumber, { left: '0px', top: '0px' })
    }
    queryAll<HTMLElement>(tableEl, 'tbody tr.typ-csv-data-row td:first-child').forEach(cell => {
      cell.classList.add('typ-csv-sticky-row-number')
      setCssStyles(cell, { left: '0px' })
    })
  }

  stickyRows.forEach(rowIndex => {
    const stickyTop = calculateStickyRowsHeight(rowIndex)
    queryAll<HTMLElement>(tableEl, `tbody tr[data-row="${rowIndex}"] td`).forEach(cell => {
      cell.classList.add('typ-csv-sticky-row')
      setCssStyles(cell, { top: `${stickyTop}px` })
    })
  })

  stickyColumns.forEach(colIndex => {
    const stickyLeft = calculateStickyColumnsWidth(colIndex)
    const headerCell = query<HTMLElement>(tableEl, `thead tr th:nth-child(${colIndex + 2})`)
    if (headerCell) {
      headerCell.classList.add('typ-csv-sticky-col')
      setCssStyles(headerCell, { left: `${stickyLeft}px`, top: '0px' })
    }
    queryAll<HTMLElement>(tableEl, `tbody tr.typ-csv-data-row td:nth-child(${colIndex + 2})`).forEach(cell => {
      cell.classList.add('typ-csv-sticky-col')
      setCssStyles(cell, { left: `${stickyLeft}px` })
    })
  })
}
