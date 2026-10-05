import { TableUtils } from '../utils/table-utils'
import { containsUrl, createUrlDisplay } from '../utils/url-utils'
import { createEl, empty } from '../utils/dom'

export interface TableRenderOptions {
  tableData: string[][]
  columnWidths: number[]
  tableEl: HTMLElement
  getColumnLabel: (index: number) => string
  setupColumnResize: (handle: HTMLElement, columnIndex: number) => void
  /** Called when the ✎ edit button of a URL cell is clicked. */
  onEditCell?: (row: number, col: number, td: HTMLElement) => void
  /** Called on double-click of a header cell in header-row mode. */
  onEditHeader?: (colIndex: number) => void
  /** When set, only [start, end) rows are rendered; spacers preserve height. */
  virtualWindow?: { start: number; end: number; topPad: number; bottomPad: number }
  /** Render row 0 into `<thead>` and start tbody at row 1. */
  firstRowAsHeader?: boolean
  stickyRows?: Set<number>
  stickyColumns?: Set<number>
  toggleRowSticky?: (rowIndex: number) => void
  toggleColumnSticky?: (colIndex: number) => void
}

/** Render a read-only display layer for a cell (links remain clickable). */
export function renderCellDisplay(td: HTMLElement, cell: string, onEditClick?: () => void): void {
  const old = td.querySelector('.typ-csv-cell-display')
  if (old) old.remove()
  if (containsUrl(cell)) {
    createUrlDisplay(td, cell, onEditClick)
  } else {
    const display = createEl('div', { cls: 'typ-csv-cell-display', text: cell })
    if (cell) display.title = cell
    td.appendChild(display)
  }
}

export function renderTable(options: TableRenderOptions): void {
  const {
    tableData,
    columnWidths,
    tableEl,
    getColumnLabel,
    setupColumnResize,
    onEditCell,
    onEditHeader,
    virtualWindow,
    firstRowAsHeader,
    stickyRows,
    stickyColumns,
    toggleRowSticky,
    toggleColumnSticky,
  } = options

  if (columnWidths.length === 0 && tableData[0]) {
    columnWidths.push(...TableUtils.calculateColumnWidths(tableData))
  }

  empty(tableEl)
  tableEl.classList.toggle('typ-csv-header-row-mode', !!firstRowAsHeader)

  const headerRow = createEl('tr', { parent: createEl('thead', { parent: tableEl }) })
  headerRow.appendChild(createEl('th', { cls: 'typ-csv-corner-cell' }))

  if (tableData[0]) {
    tableData[0].forEach((headerCell, index) => {
      const th = createEl('th', {
        cls: 'typ-csv-col-number',
        attr: { style: `width: ${columnWidths[index] || 100}px` },
        parent: headerRow,
      })
      if (firstRowAsHeader) {
        th.classList.add('typ-csv-header-cell')
        const inner = createEl('div', { cls: 'typ-csv-header-inner', parent: th })
        inner.appendChild(createEl('span', { cls: 'typ-csv-col-letter', text: getColumnLabel(index) }))
        if (headerCell) {
          const textEl = createEl('span', { cls: 'typ-csv-header-text', text: headerCell })
          textEl.title = headerCell
          inner.appendChild(textEl)
        }
        th.title = headerCell ? `${getColumnLabel(index)}: ${headerCell}` : getColumnLabel(index)
      } else {
        th.textContent = getColumnLabel(index)
      }

      if (firstRowAsHeader && onEditHeader) {
        th.ondblclick = e => {
          e.stopPropagation()
          onEditHeader(index)
        }
      }

      if (toggleColumnSticky) {
        const isSticky = stickyColumns?.has(index) || false
        const pinBtn = createEl('button', {
          cls: `typ-csv-pin-btn typ-csv-pin-col ${isSticky ? 'pinned' : ''}`,
          text: isSticky ? '▣' : '▢',
          title: isSticky ? 'Unpin column' : 'Pin column',
        })
        pinBtn.onclick = e => {
          e.stopPropagation()
          toggleColumnSticky(index)
        }
        th.appendChild(pinBtn)
      }

      const resizeHandle = createEl('div', { cls: 'typ-csv-resize-handle' })
      th.appendChild(resizeHandle)
      setupColumnResize(resizeHandle, index)
    })
  }

  const tableBody = createEl('tbody', { parent: tableEl })

  const bodyStart = firstRowAsHeader ? 1 : 0
  const firstRowIndex = virtualWindow ? Math.max(bodyStart, virtualWindow.start) : bodyStart
  const lastRowIndex = virtualWindow ? Math.min(tableData.length, virtualWindow.end) : tableData.length
  const totalColumns = (tableData[0]?.length || 0) + 1

  const createSpacerRow = (height: number) => {
    if (!(height > 0)) return
    const spacer = createEl('tr', { cls: 'typ-csv-virtual-spacer', parent: tableBody })
    createEl('td', {
      attr: {
        colspan: String(Math.max(1, totalColumns)),
        style: `height:${height}px;padding:0;border:0;`,
      },
      parent: spacer,
    })
  }

  if (virtualWindow) createSpacerRow(virtualWindow.topPad)

  for (let i = firstRowIndex; i < lastRowIndex; i++) {
    const row = tableData[i]
    if (!row) continue
    const tableRow = createEl('tr', {
      cls: 'typ-csv-data-row',
      attr: { 'data-row': String(i) },
      parent: tableBody,
    })
    const rowNumberCell = createEl('td', {
      cls: 'typ-csv-row-number',
      text: i.toString(),
      parent: tableRow,
    })

    if (toggleRowSticky) {
      const isSticky = stickyRows?.has(i) || false
      const pinBtn = createEl('button', {
        cls: `typ-csv-pin-btn typ-csv-pin-row ${isSticky ? 'pinned' : ''}`,
        text: isSticky ? '▣' : '▢',
        title: isSticky ? 'Unpin row' : 'Pin row',
      })
      pinBtn.onclick = e => {
        e.stopPropagation()
        toggleRowSticky(i)
      }
      rowNumberCell.appendChild(pinBtn)
    }

    row.forEach((cell, j) => {
      const td = createEl('td', {
        cls: 'typ-csv-cell',
        attr: {
          style: `width: ${columnWidths[j] || 100}px`,
          'data-row': String(i),
          'data-col': String(j),
        },
        parent: tableRow,
      })
      renderCellDisplay(td, cell, () => onEditCell?.(i, j, td))
    })
  }

  if (virtualWindow) createSpacerRow(virtualWindow.bottomPad)
}
