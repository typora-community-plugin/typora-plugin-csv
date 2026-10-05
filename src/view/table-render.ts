import { TableUtils } from '../utils/table-utils'
import { containsUrl, createUrlDisplay } from '../utils/url-utils'
import { createEl, empty } from '../utils/dom'

export interface TableRenderOptions {
  tableData: string[][]
  columnWidths: number[]
  tableEl: HTMLElement
  requestSave: () => void
  selectRow: (rowIndex: number) => void
  selectColumn: (colIndex: number) => void
  getColumnLabel: (index: number) => string
  setupColumnResize: (handle: HTMLElement, columnIndex: number) => void
  insertRowAt: (rowIndex: number, after?: boolean) => void
  deleteRowAt: (rowIndex: number) => void
  insertColAt: (colIndex: number, after?: boolean) => void
  deleteColAt: (colIndex: number) => void
  /** Called when the ✎ edit button of a URL cell is clicked. */
  onEditCell?: (row: number, col: number, td: HTMLElement) => void
  /** Called on double-click of a header cell in header-row mode. */
  onEditHeader?: (colIndex: number) => void
  /** When set, only [start, end) rows are rendered; spacers preserve height. */
  virtualWindow?: { start: number; end: number; topPad: number; bottomPad: number }
  /** Render row 0 into `<thead>` and start tbody at row 1. */
  firstRowAsHeader?: boolean
  onColumnReorder?: (from: number, to: number) => void
  onRowReorder?: (from: number, to: number) => void
  stickyRows?: Set<number>
  stickyColumns?: Set<number>
  toggleRowSticky?: (rowIndex: number) => void
  toggleColumnSticky?: (colIndex: number) => void
}

/** Shared drag state, read by renderTable to preserve highlight after re-render. */
interface DragState {
  type: 'row' | 'col' | null
  index: number | null
}
const dragState: DragState = { type: null, index: null }

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
    requestSave,
    selectRow,
    selectColumn,
    getColumnLabel,
    setupColumnResize,
    onEditCell,
    onEditHeader,
    virtualWindow,
    firstRowAsHeader,
    onColumnReorder,
    onRowReorder,
    stickyRows,
    stickyColumns,
    toggleRowSticky,
    toggleColumnSticky,
  } = options

  const setDragState = (type: 'row' | 'col' | null, index: number | null) => {
    dragState.type = type
    dragState.index = index
    tableEl.classList.toggle('typ-csv-dragging-row', type === 'row')
    tableEl.classList.toggle('typ-csv-dragging-col', type === 'col')
  }

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
        attr: { style: `width: ${columnWidths[index] || 100}px`, draggable: 'true' },
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

      th.onclick = e => {
        e.stopPropagation()
        selectColumn(index)
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

      th.ondragstart = e => {
        e.dataTransfer?.setData('text/col-index', String(index))
        th.classList.add('dragging')
        setDragState('col', index)
      }
      th.ondragend = () => {
        th.classList.remove('dragging')
        setDragState(null, null)
        requestSave()
      }
      th.ondragover = e => {
        e.preventDefault()
        th.classList.add('drag-over')
      }
      th.ondragleave = () => th.classList.remove('drag-over')
      th.ondrop = e => {
        e.preventDefault()
        th.classList.remove('drag-over')
        setDragState(null, null)
        const from = Number(e.dataTransfer?.getData('text/col-index'))
        const to = index
        if (onColumnReorder && from !== to) onColumnReorder(from, to)
      }

      if (dragState.type === 'col' && dragState.index !== null) {
        const colStart = Math.max(0, dragState.index - 2)
        const colEnd = Math.min(tableData[0].length - 1, dragState.index + 2)
        if (index >= colStart && index <= colEnd) th.classList.add('typ-csv-dragging-highlight')
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
      attr: { draggable: 'true' },
      parent: tableRow,
    })
    rowNumberCell.onclick = e => {
      e.stopPropagation()
      selectRow(i)
    }

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

    rowNumberCell.ondragstart = e => {
      e.dataTransfer?.setData('text/row-index', String(i))
      rowNumberCell.classList.add('dragging')
      setDragState('row', i)
    }
    rowNumberCell.ondragend = () => {
      rowNumberCell.classList.remove('dragging')
      setDragState(null, null)
      requestSave()
    }
    rowNumberCell.ondragover = e => {
      e.preventDefault()
      rowNumberCell.classList.add('drag-over')
    }
    rowNumberCell.ondragleave = () => rowNumberCell.classList.remove('drag-over')
    rowNumberCell.ondrop = e => {
      e.preventDefault()
      rowNumberCell.classList.remove('drag-over')
      setDragState(null, null)
      const from = Number(e.dataTransfer?.getData('text/row-index'))
      const to = i
      if (onRowReorder && from !== to) onRowReorder(from, to)
    }

    if (dragState.type === 'row' && dragState.index !== null) {
      const rowStart = Math.max(0, dragState.index - 2)
      const rowEnd = Math.min(tableData.length - 1, dragState.index + 2)
      if (i >= rowStart && i <= rowEnd) {
        rowNumberCell.classList.add('typ-csv-dragging-highlight')
        Array.from(tableRow.children).forEach(td => td.classList.add('typ-csv-dragging-highlight'))
      }
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
