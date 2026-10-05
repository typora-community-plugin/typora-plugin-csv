import { WorkspaceView, fs, path, Notice, type App, type WorkspaceLeaf } from '@typora-community-plugin/core'
import type { UnparseConfig } from 'papaparse'
import { CSVUtils } from '../utils/csv-utils'
import { TableUtils } from '../utils/table-utils'
import { TableHistoryManager } from '../utils/history-manager'
import { FileUtils } from '../utils/file-utils'
import { HighlightManager } from '../utils/highlight-manager'
import { computeVirtualWindow, offsetVirtualWindow, type VirtualWindow } from '../utils/virtual-window'
import { isSearchShortcut, getHistoryAction } from '../utils/keyboard-utils'
import { createEl, createDiv, empty, query, queryAll, setCssStyles } from '../utils/dom'
import { renderTable, renderCellDisplay } from './table-render'
import { CellEditor } from './cell-editor'
import { SearchBar } from './search-bar'
import { setupHeaderContextMenu } from './header-context-menu'
import { applyStickyStyles } from './sticky'
import { renderToolbar, type ToolbarRefs, type ViewMode } from './toolbar'
import { SourceMode } from './source-mode'
import { fmt, type CsvI18n } from '../i18n'
import type { CsvSettings, Delimiter } from '../settings/settings'

/** Rows above this count enable virtualization (unless rows are pinned). */
const VIRTUAL_THRESHOLD = 150
/** Extra rows rendered above / below the viewport. */
const VIRTUAL_OVERSCAN = 8
/** Debounce window before writing to disk. */
const SAVE_DEBOUNCE_MS = 500

export interface CsvViewOptions {
  app: App
  i18n: CsvI18n
  getSettings: () => CsvSettings
  setPreferredDelimiter: (delimiter: Delimiter) => void
  isHeaderRowEnabled: (filePath: string) => boolean
  setHeaderRowEnabled: (filePath: string, enabled: boolean) => void
}

export class CsvView extends WorkspaceView {

  static type = 'typora-community-plugin.csv.view'
  static extensions = ['csv', 'tsv']

  icon = 'fa-table'

  containerEl: HTMLElement = document.createElement('div')

  private get i18n(): CsvI18n {
    return this.options.i18n
  }

  // --- data ----------------------------------------------------------------
  private tableData: string[][] = [['']]
  private columnWidths: number[] = []
  private delimiter: Delimiter = 'auto'
  private quoteChar = '"'
  private originalFileDelimiter: string | null = null
  private originalFileNewline = '\n'
  private originalTrailingNewline = ''
  private rawText = ''

  // --- history -------------------------------------------------------------
  private historyManager = new TableHistoryManager(undefined, 50)

  // --- DOM ----------------------------------------------------------------
  private toolbar!: ToolbarRefs
  private tableWrapperEl!: HTMLElement
  private tableContainerEl!: HTMLElement
  private tableEl!: HTMLElement
  private cellEditorHolder!: HTMLElement
  private sourceMode!: SourceMode
  private searchBar: SearchBar | null = null
  private highlightManager!: HighlightManager
  private cellEditor!: CellEditor

  // --- mode ----------------------------------------------------------------
  private mode: ViewMode = 'table'

  // --- editing -------------------------------------------------------------
  private activeRowIndex = -1
  private activeColIndex = -1
  private activeCellTd: HTMLElement | null = null
  /** Value of the active cell when the edit session started (for change detection). */
  private editOriginalValue = ''

  // --- header row ----------------------------------------------------------
  private firstRowAsHeader = false

  // --- sticky --------------------------------------------------------------
  private stickyRows = new Set<number>()
  private stickyColumns = new Set<number>()
  private stickyHeaders = true
  private stickyRowNumbers = true

  // --- virtualization ------------------------------------------------------
  private rowHeight = 24
  private virtualStart = 0
  private virtualEnd = 0
  private virtualRafId = 0
  private warnedVirtualDisabled = false

  // --- saving --------------------------------------------------------------
  private saveTimer = 0
  private dirty = false

  constructor(leaf: WorkspaceLeaf, private options: CsvViewOptions) {
    super(leaf)
    this.containerEl.classList.add('typ-csv-view')
  }

  get filePath(): string {
    return this.leaf.state.path
  }

  get app(): App {
    return this.options.app
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  onOpen(): void {
    this.loadHeaderRowPreference()
    this.delimiter = this.options.getSettings().preferredDelimiter
    this.quoteChar = this.options.getSettings().quoteChar

    try {
      this.rawText = fs.readTextSync(this.filePath)
    } catch (error) {
      this.rawText = ''
      Notice.error(fmt(this.i18n.t.notifications.loadFailed, { message: (error as Error).message }))
    }

    this.setViewData(this.rawText, true)
    this.buildUi()

    const savedMode = this.leaf.state.mode
    if (savedMode === 'source') {
      this.switchMode('source')
    } else {
      this.refresh()
      const scrollTop = this.leaf.state.scrollTop
      if (typeof scrollTop === 'number') this.tableContainerEl.scrollTop = scrollTop
    }
  }

  onClose(): void {
    // Persist transient state on the leaf.
    this.leaf.state.mode = this.mode
    this.leaf.state.scrollTop = this.tableContainerEl?.scrollTop ?? 0

    this.cellEditor?.commit()
    this.searchBar?.destroy()
    window.clearTimeout(this.saveTimer)
    this.saveTimer = 0
    void this.flushSave()
  }

  // =========================================================================
  // File I/O
  // =========================================================================

  private getCsvText(): string {
    if (this.mode === 'source') return this.sourceMode.getText()
    const delim = this.originalFileDelimiter || (this.delimiter === 'auto' ? undefined : this.delimiter)
    const config: UnparseConfig = { newline: this.originalFileNewline }
    if (delim) config.delimiter = delim
    return CSVUtils.unparseCSV(this.tableData, config) + this.originalTrailingNewline
  }

  private requestSave(): void {
    this.dirty = true
    if (this.saveTimer) return
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0
      void this.flushSave()
    }, SAVE_DEBOUNCE_MS)
  }

  private async flushSave(): Promise<void> {
    if (!this.dirty) return
    this.dirty = false
    try {
      await FileUtils.withRetry(() => fs.writeText(this.filePath, this.getCsvText()), {
        onRetry: () => Notice.info('File is busy, retrying...'),
      })
    } catch (error) {
      this.dirty = true
      Notice.error(fmt(this.i18n.t.notifications.saveFailed, { message: (error as Error).message }))
    }
  }

  // =========================================================================
  // Parsing
  // =========================================================================

  private setViewData(data: string, clear: boolean): void {
    try {
      this.originalFileNewline = CSVUtils.detectNewline(data)
      const trailing = CSVUtils.getTrailingNewline(data)
      this.originalTrailingNewline = trailing.newline

      let parsed = CSVUtils.parseCSV(data, { delimiter: this.delimiter, quoteChar: this.quoteChar })
      parsed = CSVUtils.dropTrailingRows(parsed, trailing.rowCount)
      if (!parsed || parsed.length === 0) parsed = [['']]
      this.tableData = CSVUtils.normalizeTableData(parsed)

      this.originalFileDelimiter = CSVUtils.detectDelimiter(data, this.quoteChar)

      const columnCount = this.tableData[0]?.length || 0
      if (clear || this.columnWidths.length !== columnCount) this.columnWidths = []
      if (clear) this.historyManager.reset(this.tableData)
    } catch (error) {
      console.error('CSV parse error:', error)
      this.tableData = [['']]
      if (clear) this.historyManager.reset(this.tableData)
      Notice.error(this.i18n.t.csv.parsingFailed)
    }
  }

  private reparseAndRefresh(): void {
    this.setViewData(this.rawText, false)
    this.refresh()
  }

  // =========================================================================
  // UI construction
  // =========================================================================

  private buildUi(): void {
    empty(this.containerEl)

    this.toolbar = renderToolbar(this.containerEl, {
      i18n: this.i18n,
      currentDelimiter: this.delimiter,
      detectedDelimiter: CSVUtils.detectDelimiter(this.rawText, this.quoteChar),
      headerEnabled: this.firstRowAsHeader,
      mode: this.mode,
      onUndo: () => {
        this.cellEditor?.commit()
        this.undo()
      },
      onRedo: () => {
        this.cellEditor?.commit()
        this.redo()
      },
      onResetColumnWidth: () => {
        this.columnWidths = TableUtils.calculateColumnWidths(this.tableData)
        this.refresh()
      },
      onToggleHeader: () => this.toggleFirstRowAsHeader(),
      onToggleMode: () => this.switchMode(this.mode === 'table' ? 'source' : 'table'),
      onDelimiterChange: delimiter => {
        this.delimiter = delimiter
        this.options.setPreferredDelimiter(delimiter)
        this.reparseAndRefresh()
      },
    })

    this.searchBar = new SearchBar(this.toolbar.searchContainer, {
      i18n: this.i18n,
      getTableData: () => (this.mode === 'source' ? [] : this.tableData),
      getColumnLabel: index => TableUtils.getColumnLabel(index),
      getCellAddress: (row, col) => TableUtils.getCellAddress(row, col),
      jumpToCell: (row, col) => this.jumpToCell(row, col),
      clearSearchHighlights: () => this.clearSearchHighlights(),
      getStartRow: () => this.getHeaderRowOffset(),
    })

    this.setupEditBar()

    this.tableWrapperEl = createDiv({ cls: 'typ-csv-table-wrapper', parent: this.containerEl })
    this.tableContainerEl = createDiv({ cls: 'typ-csv-table-container', parent: this.tableWrapperEl })
    this.tableEl = createEl('table', { cls: 'typ-csv-table', parent: this.tableContainerEl })
    this.highlightManager = new HighlightManager(this.tableEl)

    this.setupScrollSync(this.toolbar.topScrollEl, this.tableContainerEl)

    this.cellEditorHolder = createDiv({ cls: 'typ-csv-cell-editor-holder', parent: this.containerEl })
    this.cellEditor = new CellEditor(this.cellEditorHolder, this.createCellEditorHost())

    this.sourceMode = new SourceMode(this.containerEl, {
      onChange: () => {
        this.dirty = true
        this.requestSave()
      },
    })

    this.setupCellDelegation()
    this.setupHeaderContextMenu()
    this.setupGlobalListeners()
  }

  private setupEditBar(): void {
    const { editInput } = this.toolbar
    // The edit bar shares the active cell. Record its starting value on focus and
    // push a single history entry on blur when the value actually changed.
    editInput.onfocus = () => {
      this.editOriginalValue = this.tableData[this.activeRowIndex]?.[this.activeColIndex] ?? ''
    }
    editInput.oninput = () => {
      const row = this.activeRowIndex
      const col = this.activeColIndex
      if (row < 0 || col < 0 || !this.tableData[row]) return
      this.tableData[row][col] = editInput.value
      this.cellEditor.syncFromExternal(editInput.value)
      this.updateCellDisplay(row, col)
      this.requestSave()
    }
    editInput.onblur = () => {
      const row = this.activeRowIndex
      const col = this.activeColIndex
      if (row < 0 || col < 0 || !this.tableData[row]) return
      if (editInput.value !== this.editOriginalValue) {
        this.pushHistory()
        this.editOriginalValue = editInput.value
      }
    }
  }

  private renderEditBar(row: number, col: number): void {
    const { editBarEl, editInput } = this.toolbar
    const value = this.tableData[row]?.[col] ?? ''
    editInput.value = value
    editBarEl.setAttribute('data-cell-address', TableUtils.getCellAddress(row, col))
    editInput.placeholder = value ? '' : TableUtils.getCellAddress(row, col)
  }

  private createCellEditorHost() {
    return {
      getCellTd: (row: number, col: number) => this.getCellTd(row, col),
      hideCellDisplay: (td: HTMLElement, row: number) => {
        if (this.firstRowAsHeader && row === 0) {
          queryAll(td, '.typ-csv-col-letter, .typ-csv-header-text').forEach(el =>
            setCssStyles(el as HTMLElement, { display: 'none' }),
          )
        } else {
          const display = query<HTMLElement>(td, '.typ-csv-cell-display')
          if (display) setCssStyles(display, { display: 'none' })
        }
      },
      refreshDisplay: (row: number, col: number) => this.updateCellDisplay(row, col),
      getValue: (row: number, col: number) => this.tableData[row]?.[col] ?? '',
      onInput: (row: number, col: number, value: string) => {
        this.tableData[row][col] = value
        this.toolbar.editInput.value = value
        this.requestSave()
      },
      onCommit: (row: number, col: number, value: string) => {
        this.tableData[row][col] = value
        if (value !== this.editOriginalValue) this.pushHistory()
        this.updateCellDisplay(row, col)
        this.requestSave()
      },
      onCancel: (row: number, col: number, value: string) => {
        this.tableData[row][col] = value
        this.updateCellDisplay(row, col)
        this.renderEditBar(row, col)
        this.requestSave()
      },
      move: (dRow: number, dCol: number) => this.moveEdit(dRow, dCol),
      setActiveCell: (row: number, col: number, td: HTMLElement | null) => this.setActiveCell(row, col, td),
      requestSave: () => this.requestSave(),
    }
  }

  private setupCellDelegation(): void {
    this.registerDomEvent(this.tableEl, 'click', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('a')) return
      if (target?.closest('.typ-csv-cell-input-shared')) return
      const td = target?.closest('td.typ-csv-cell') as HTMLElement | null
      if (!td) return
      const row = Number(td.dataset.row)
      const col = Number(td.dataset.col)
      if (Number.isNaN(row) || Number.isNaN(col)) return
      this.cellEditor.begin(row, col)
    })
  }

  private setupHeaderContextMenu(): void {
    setupHeaderContextMenu(this.tableEl, {
      i18n: this.i18n,
      selectRow: index => this.highlightManager.selectRow(index),
      selectColumn: index => this.highlightManager.selectColumn(index),
      clearSelection: () => this.highlightManager.clearSelection(),
      onInsertRowAbove: index => this.insertRowAt(index, false),
      onInsertRowBelow: index => this.insertRowAt(index, true),
      onDeleteRow: index => this.deleteRowAt(index),
      onMoveRowUp: index => this.moveRow(index, index - 1),
      onMoveRowDown: index => this.moveRow(index, index + 1),
      onInsertColLeft: index => this.insertColAt(index, false),
      onInsertColRight: index => this.insertColAt(index, true),
      onDeleteCol: index => this.deleteColAt(index),
      onMoveColLeft: index => this.moveCol(index, index - 1),
      onMoveColRight: index => this.moveCol(index, index + 1),
    })
  }

  private setupGlobalListeners(): void {
    this.registerDomEvent(
      document,
      'scroll',
      () => this.onVirtualScroll(),
      { capture: true },
    )

    this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
      if (this.app.workspace.activeLeaf !== this.leaf) return
      if (this.mode !== 'table') return

      if (isSearchShortcut(event)) {
        event.preventDefault()
        this.searchBar?.focus()
        return
      }

      // While a text field has focus (shared cell editor, edit bar, search...),
      // let the browser handle Ctrl+Z / Ctrl+Shift+Z natively instead of running
      // table-level undo/redo.
      const active = document.activeElement as HTMLElement | null
      if (
        active &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
      ) {
        return
      }

      const action = getHistoryAction(event)
      if (action === 'undo') {
        event.preventDefault()
        this.undo()
      } else if (action === 'redo') {
        event.preventDefault()
        this.redo()
      }
    })

    this.registerDomEvent(document, 'click', (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.typ-csv-col-number, .typ-csv-row-number')) return
      this.highlightManager.clearSelection()
    })
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  refresh(): void {
    if (this.mode !== 'table' || !this.tableEl) return
    this.cellEditor?.park()

    if (!this.tableData || !Array.isArray(this.tableData) || this.tableData.length === 0) {
      this.tableData = [['']]
    }

    renderTable({
      tableData: this.tableData,
      columnWidths: this.columnWidths,
      tableEl: this.tableEl,
      requestSave: () => this.requestSave(),
      onEditCell: (row, col) => this.cellEditor.begin(row, col),
      onEditHeader: col => this.cellEditor.begin(0, col),
      virtualWindow: this.buildVirtualWindow(),
      firstRowAsHeader: this.firstRowAsHeader,
      selectRow: index => this.highlightManager.selectRow(index),
      selectColumn: index => this.highlightManager.selectColumn(index),
      getColumnLabel: index => TableUtils.getColumnLabel(index),
      setupColumnResize: (handle, col) => this.setupColumnResize(handle, col),
      insertRowAt: (index, after = false) => this.insertRowAt(index, after),
      deleteRowAt: index => this.deleteRowAt(index),
      insertColAt: (index, after = false) => this.insertColAt(index, after),
      deleteColAt: index => this.deleteColAt(index),
      onColumnReorder: (from, to) => this.reorderColumn(from, to),
      onRowReorder: (from, to) => this.reorderRow(from, to),
      stickyRows: this.stickyRows,
      stickyColumns: this.stickyColumns,
      toggleRowSticky: index => this.toggleRowSticky(index),
      toggleColumnSticky: index => this.toggleColumnSticky(index),
    })

    this.updateHeaderToggleButton()
    this.updateTopScrollWidth()

    window.requestAnimationFrame(() => {
      applyStickyStyles({
        tableEl: this.tableEl,
        columnWidths: this.columnWidths,
        stickyRows: this.stickyRows,
        stickyColumns: this.stickyColumns,
        stickyHeaders: this.stickyHeaders,
        stickyRowNumbers: this.stickyRowNumbers,
      })
      this.measureRowHeight()
    })
  }

  private updateTopScrollWidth(): void {
    const topScroll = this.toolbar?.topScrollEl
    if (!topScroll || !this.tableEl) return
    empty(topScroll)
    createDiv({
      attr: { style: `width:${this.tableEl.offsetWidth}px;height:1px;` },
      parent: topScroll,
    })
  }

  private setupScrollSync(topScroll: HTMLElement, mainScroll: HTMLElement): void {
    let rafId = 0
    let source: HTMLElement | null = null
    const flush = () => {
      rafId = 0
      const src = source
      source = null
      if (!src) return
      ;(src === mainScroll ? topScroll : mainScroll).scrollLeft = src.scrollLeft
    }
    const onScroll = (src: HTMLElement) => {
      source = src
      if (!rafId) rafId = window.requestAnimationFrame(flush)
    }
    this.registerDomEvent(mainScroll, 'scroll', () => onScroll(mainScroll))
    this.registerDomEvent(topScroll, 'scroll', () => onScroll(topScroll))
  }

  private setupColumnResize(handle: HTMLElement, columnIndex: number): void {
    let startX = 0
    let startWidth = 0
    let affectedCells: HTMLElement[] = []

    const onMouseDown = (e: MouseEvent) => {
      startX = e.clientX
      startWidth = this.columnWidths[columnIndex] || 100
      const selector = `thead tr th:nth-child(${columnIndex + 2}), tbody tr.typ-csv-data-row td:nth-child(${columnIndex + 2})`
      affectedCells = queryAll<HTMLElement>(this.tableEl, selector)
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      e.preventDefault()
    }
    const onMouseMove = (e: MouseEvent) => {
      const width = startWidth + (e.clientX - startX)
      if (width >= 50) {
        this.columnWidths[columnIndex] = width
        for (const cell of affectedCells) setCssStyles(cell, { width: `${width}px` })
      }
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      affectedCells = []
      applyStickyStyles({
        tableEl: this.tableEl,
        columnWidths: this.columnWidths,
        stickyRows: this.stickyRows,
        stickyColumns: this.stickyColumns,
        stickyHeaders: this.stickyHeaders,
        stickyRowNumbers: this.stickyRowNumbers,
      })
      this.updateTopScrollWidth()
    }
    handle.addEventListener('mousedown', onMouseDown)
  }

  // =========================================================================
  // Cell helpers
  // =========================================================================

  private getCellTd(row: number, col: number): HTMLElement | null {
    if (this.firstRowAsHeader && row === 0) {
      return query<HTMLElement>(this.tableEl, `thead tr th:nth-child(${col + 2})`)
    }
    const tr = query<HTMLElement>(this.tableEl, `tbody tr[data-row="${row}"]`)
    if (!tr) return null
    const cells = tr.querySelectorAll('td')
    return (cells[col + 1] as HTMLElement) || null
  }

  private setActiveCell(row: number, col: number, td: HTMLElement | null): void {
    if (this.activeCellTd) this.activeCellTd.classList.remove('typ-csv-active-cell')
    this.activeRowIndex = row
    this.activeColIndex = col
    this.activeCellTd = td
    this.editOriginalValue = this.tableData[row]?.[col] ?? ''
    if (td) td.classList.add('typ-csv-active-cell')
    this.renderEditBar(row, col)
  }

  private updateCellDisplay(row: number, col: number): void {
    if (this.cellEditor?.isEditing && this.cellEditor.row === row && this.cellEditor.col === col) return
    if (this.firstRowAsHeader && row === 0) {
      this.updateHeaderCellDisplay(col)
      return
    }
    const td = this.getCellTd(row, col)
    if (!td || !this.tableData[row]) return
    renderCellDisplay(td, this.tableData[row][col], () => this.cellEditor.begin(row, col))
  }

  private updateHeaderCellDisplay(col: number): void {
    const th = this.getCellTd(0, col)
    if (!th || !this.tableData[0]) return
    const text = this.tableData[0][col] ?? ''
    const inner = query<HTMLElement>(th, '.typ-csv-header-inner') ?? th
    const letter = query<HTMLElement>(th, '.typ-csv-col-letter')
    if (letter) setCssStyles(letter, { display: '' })
    let textEl = query<HTMLElement>(th, '.typ-csv-header-text')
    if (!text) {
      textEl?.remove()
    } else {
      if (!textEl) {
        textEl = createEl('span', { cls: 'typ-csv-header-text' })
        inner.appendChild(textEl)
      }
      setCssStyles(textEl, { display: '' })
      textEl.textContent = text
      textEl.title = text
    }
    th.title = text ? `${TableUtils.getColumnLabel(col)}: ${text}` : TableUtils.getColumnLabel(col)
  }

  private moveEdit(dRow: number, dCol: number): void {
    const row = this.activeRowIndex >= 0 ? this.activeRowIndex : 0
    const col = this.activeColIndex >= 0 ? this.activeColIndex : 0
    const minRow = this.firstRowAsHeader && row === 0 ? 0 : this.getHeaderRowOffset()
    const maxRow = Math.max(0, this.tableData.length - 1)
    const maxCol = Math.max(0, (this.tableData[0]?.length || 1) - 1)
    const nextRow = Math.min(Math.max(row + dRow, minRow), maxRow)
    const nextCol = Math.min(Math.max(col + dCol, 0), maxCol)
    this.cellEditor.begin(nextRow, nextCol)
  }

  // =========================================================================
  // Virtualization
  // =========================================================================

  private getScrollContainer(): HTMLElement | null {
    let el: HTMLElement | null = this.tableEl?.parentElement || null
    let fallback: HTMLElement | null = null
    while (el && el !== document.body) {
      const oy = window.getComputedStyle(el).overflowY
      if (oy === 'auto' || oy === 'scroll') {
        if (!fallback) fallback = el
        if (el.scrollHeight > el.clientHeight + 1) return el
      }
      el = el.parentElement
    }
    return fallback || this.tableContainerEl
  }

  private getScrolledOffset(scroller: HTMLElement): number {
    const tbody = query<HTMLElement>(this.tableEl, 'tbody')
    if (!tbody) return 0
    const rect = scroller.getBoundingClientRect()
    const tbodyTop = tbody.getBoundingClientRect().top
    return Math.max(0, rect.top - tbodyTop)
  }

  private getHeaderRowOffset(): number {
    return this.firstRowAsHeader ? 1 : 0
  }

  private getBodyRowCount(): number {
    return Math.max(0, this.tableData.length - this.getHeaderRowOffset())
  }

  private isVirtualizable(): boolean {
    return this.getBodyRowCount() > VIRTUAL_THRESHOLD && this.stickyRows.size === 0
  }

  private buildVirtualWindow(): VirtualWindow {
    const offset = this.getHeaderRowOffset()
    const rows = this.getBodyRowCount()
    if (!this.isVirtualizable()) {
      if (rows > VIRTUAL_THRESHOLD && this.stickyRows.size > 0 && !this.warnedVirtualDisabled) {
        this.warnedVirtualDisabled = true
        Notice.warning(this.i18n.t.notifications.virtualDisabledBySticky)
      }
      this.virtualStart = offset
      this.virtualEnd = this.tableData.length
      return { start: offset, end: this.tableData.length, topPad: 0, bottomPad: 0 }
    }
    const scroller = this.getScrollContainer()
    const w = offsetVirtualWindow(
      computeVirtualWindow(
        rows,
        this.rowHeight,
        scroller ? this.getScrolledOffset(scroller) : 0,
        scroller ? scroller.clientHeight : 800,
        VIRTUAL_OVERSCAN,
      ),
      offset,
    )
    this.virtualStart = w.start
    this.virtualEnd = w.end
    return w
  }

  private onVirtualScroll(): void {
    if (this.mode !== 'table' || !this.isVirtualizable()) return
    if (this.virtualRafId) return
    this.virtualRafId = window.requestAnimationFrame(() => {
      this.virtualRafId = 0
      const scroller = this.getScrollContainer()
      if (!scroller) return
      const offset = this.getHeaderRowOffset()
      const w = offsetVirtualWindow(
        computeVirtualWindow(
          this.getBodyRowCount(),
          this.rowHeight,
          this.getScrolledOffset(scroller),
          scroller.clientHeight,
          VIRTUAL_OVERSCAN,
        ),
        offset,
      )
      if (w.start === this.virtualStart && w.end === this.virtualEnd) return
      this.cellEditor.commit()
      this.virtualStart = w.start
      this.virtualEnd = w.end
      this.refresh()
    })
  }

  private ensureRowRendered(row: number): void {
    const offset = this.getHeaderRowOffset()
    if (row < offset) return
    if (!this.isVirtualizable()) return
    if (row >= this.virtualStart && row < this.virtualEnd) return
    const scroller = this.getScrollContainer()
    if (scroller) {
      const viewport = scroller.clientHeight || 600
      const target = Math.max(0, (row - offset) * this.rowHeight - Math.floor(viewport / 2))
      const delta = target - this.getScrolledOffset(scroller)
      scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)
    }
    this.virtualStart = -1
    this.virtualEnd = -1
    this.refresh()
  }

  private measureRowHeight(): void {
    if (!this.isVirtualizable()) return
    const firstRow = query<HTMLElement>(this.tableEl, 'tbody tr.typ-csv-data-row')
    if (firstRow && firstRow.offsetHeight > 0) this.rowHeight = firstRow.offsetHeight
  }

  // =========================================================================
  // Search
  // =========================================================================

  private jumpToCell(row: number, col: number): void {
    this.clearSearchHighlights()
    this.ensureRowRendered(row)
    const td = this.getCellTd(row, col)
    if (!td) return
    td.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    window.setTimeout(() => {
      this.cellEditor.begin(row, col)
      const tdNow = this.getCellTd(row, col)
      if (tdNow) {
        tdNow.classList.add('typ-csv-search-current')
        window.setTimeout(() => tdNow.classList.remove('typ-csv-search-current'), 3000)
      }
    }, 100)
  }

  private clearSearchHighlights(): void {
    queryAll<HTMLElement>(this.tableEl, '.typ-csv-search-current').forEach(el =>
      el.classList.remove('typ-csv-search-current'),
    )
  }

  // =========================================================================
  // History
  // =========================================================================

  /**
   * Record the *current* (already-mutated) table state as a history entry so
   * that undo returns to the previous state and redo can return to this one.
   */
  private pushHistory(): void {
    this.historyManager.push(this.tableData)
  }

  undo(): void {
    const prev = this.historyManager.undo()
    if (prev) {
      this.tableData = prev
      this.editOriginalValue = ''
      this.refresh()
      this.requestSave()
      Notice.info(this.i18n.t.notifications.undo)
    } else {
      Notice.info(this.i18n.t.notifications.noMoreUndo)
    }
  }

  redo(): void {
    const next = this.historyManager.redo()
    if (next) {
      this.tableData = next
      this.editOriginalValue = ''
      this.refresh()
      this.requestSave()
      Notice.info(this.i18n.t.notifications.redo)
    } else {
      Notice.info(this.i18n.t.notifications.noMoreRedo)
    }
  }

  // =========================================================================
  // Table operations
  // =========================================================================

  private isProtectedHeaderRow(rowIndex: number): boolean {
    return this.firstRowAsHeader && rowIndex < 1
  }

  private insertRowAt(rowIndex: number, after = false): void {
    const idx = Math.max(after ? rowIndex + 1 : rowIndex, this.getHeaderRowOffset())
    this.tableData.splice(idx, 0, Array(this.tableData[0]?.length || 1).fill(''))
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private deleteRowAt(rowIndex: number): void {
    if (this.tableData.length <= 1) return
    if (this.isProtectedHeaderRow(rowIndex)) {
      Notice.info(this.i18n.t.notifications.headerRowProtected)
      return
    }
    this.tableData.splice(rowIndex, 1)
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private insertColAt(colIndex: number, after = false): void {
    const idx = after ? colIndex + 1 : colIndex
    this.tableData.forEach(row => row.splice(idx, 0, ''))
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private deleteColAt(colIndex: number): void {
    if ((this.tableData[0]?.length || 0) <= 1) return
    this.tableData.forEach(row => row.splice(colIndex, 1))
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private moveRow(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= this.tableData.length || toIndex >= this.tableData.length) return
    if (this.isProtectedHeaderRow(fromIndex) || this.isProtectedHeaderRow(toIndex)) {
      Notice.info(this.i18n.t.notifications.headerRowProtected)
      return
    }
    const [row] = this.tableData.splice(fromIndex, 1)
    this.tableData.splice(toIndex, 0, row)
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private moveCol(fromIndex: number, toIndex: number): void {
    const colCount = this.tableData[0]?.length || 0
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= colCount || toIndex >= colCount) return
    this.tableData.forEach(row => {
      const [col] = row.splice(fromIndex, 1)
      row.splice(toIndex, 0, col)
    })
    if (this.columnWidths.length > 0) {
      const [w] = this.columnWidths.splice(fromIndex, 1)
      this.columnWidths.splice(toIndex, 0, w)
    }
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private reorderColumn(from: number, to: number): void {
    if (from === to || Number.isNaN(from) || Number.isNaN(to)) return
    this.moveCol(from, to)
  }

  private reorderRow(from: number, to: number): void {
    if (from === to || Number.isNaN(from) || Number.isNaN(to)) return
    if (this.isProtectedHeaderRow(from) || this.isProtectedHeaderRow(to)) {
      Notice.info(this.i18n.t.notifications.headerRowProtected)
      return
    }
    const [row] = this.tableData.splice(from, 1)
    this.tableData.splice(to, 0, row)
    this.pushHistory()
    this.refresh()
    this.requestSave()
  }

  private toggleRowSticky(rowIndex: number): void {
    if (this.stickyRows.has(rowIndex)) this.stickyRows.delete(rowIndex)
    else this.stickyRows.add(rowIndex)
    this.refresh()
  }

  private toggleColumnSticky(colIndex: number): void {
    if (this.stickyColumns.has(colIndex)) this.stickyColumns.delete(colIndex)
    else this.stickyColumns.add(colIndex)
    this.refresh()
  }

  // =========================================================================
  // Header row
  // =========================================================================

  private loadHeaderRowPreference(): void {
    const filePath = this.filePath
    this.firstRowAsHeader = !!filePath && this.options.isHeaderRowEnabled(filePath)
  }

  private toggleFirstRowAsHeader(): void {
    this.cellEditor?.commit()
    this.firstRowAsHeader = !this.firstRowAsHeader
    this.options.setHeaderRowEnabled(this.filePath, this.firstRowAsHeader)
    this.updateHeaderToggleButton()
    this.refresh()
  }

  private updateHeaderToggleButton(): void {
    const btn = this.toolbar?.headerToggleButton
    if (!btn) return
    btn.classList.toggle('is-active', this.firstRowAsHeader)
    btn.setAttribute('aria-pressed', String(this.firstRowAsHeader))
    btn.title = this.firstRowAsHeader
      ? this.i18n.t.buttons.toggleHeaderRowOff
      : this.i18n.t.buttons.toggleHeaderRowOn
  }

  // =========================================================================
  // Mode switching
  // =========================================================================

  private switchMode(mode: ViewMode): void {
    if (mode === this.mode) return

    if (mode === 'source') {
      this.cellEditor?.commit()
      this.sourceMode.setText(this.getCsvText(), this.originalFileNewline)
      this.mode = 'source'
    } else {
      const text = this.sourceMode.getText()
      this.setViewData(text, false)
      this.mode = 'table'
    }

    this.updateModeUi()
    if (this.mode === 'table') this.refresh()
    else this.sourceMode.focus()
  }

  private updateModeUi(): void {
    if (this.mode === 'source') {
      this.tableWrapperEl.style.display = 'none'
      this.toolbar.editBarEl.style.display = 'none'
      this.sourceMode.show()
    } else {
      this.tableWrapperEl.style.display = ''
      this.toolbar.editBarEl.style.display = ''
      this.sourceMode.hide()
    }
    const btn = this.toolbar.modeToggleButton
    const i = btn.querySelector('i')
    if (i) i.className = `fa ${this.mode === 'table' ? 'fa-code' : 'fa-table'}`
    const span = btn.querySelector('span')
    if (span) {
      span.textContent = this.mode === 'table' ? this.i18n.t.buttons.sourceMode : this.i18n.t.buttons.tableMode
    }
  }

  // Kept for API symmetry / debugging.
  get fileBaseName(): string {
    return path.basename(this.filePath)
  }
}
