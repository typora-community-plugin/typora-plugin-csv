import { createEl, setCssStyles } from '../utils/dom'

export interface CellEditorHost {
  /** Find the `<td>` / `<th>` for a logical cell (handles header-row mode). */
  getCellTd(row: number, col: number): HTMLElement | null
  /** Hide the display layer before editing. */
  hideCellDisplay(td: HTMLElement, row: number): void
  /** Restore / refresh the display layer after editing. */
  refreshDisplay(row: number, col: number): void
  /** Current value from `tableData`. */
  getValue(row: number, col: number): string
  /** Live write while typing (also syncs the edit bar + requests save). */
  onInput(row: number, col: number, value: string): void
  /** Finalize an edit. */
  onCommit(row: number, col: number, value: string): void
  /** Restore the original value when the edit is cancelled. */
  onCancel(row: number, col: number, value: string): void
  /** Move the editor to a neighbouring cell after Enter / Tab. */
  move(dRow: number, dCol: number): void
  /** Highlight the active cell and update the edit bar. */
  setActiveCell(row: number, col: number, td: HTMLElement | null): void
  requestSave(): void
}

/**
 * A single shared `<input>` used for every cell (issue #51).
 * It is parked in a holder while idle and moved into the target `<td>` on edit,
 * so a 1000x27 table no longer creates 27,000 inputs and 54,000 listeners.
 */
export class CellEditor {

  readonly input: HTMLInputElement

  private editingRow = -1
  private editingCol = -1
  private originalValue = ''
  /** The `<td>` / `<th>` currently hosting the shared input. */
  private activeTd: HTMLElement | null = null

  constructor(private holder: HTMLElement, private host: CellEditorHost) {
    this.input = createEl('input', { cls: 'typ-csv-cell-input typ-csv-cell-input-shared' })
    this.holder.appendChild(this.input)
    this.setupEvents()
  }

  get row(): number {
    return this.editingRow
  }

  get col(): number {
    return this.editingCol
  }

  get isEditing(): boolean {
    return this.editingRow >= 0 && this.editingCol >= 0
  }

  private setupEvents(): void {
    this.input.addEventListener('input', () => {
      if (!this.isEditing) return
      this.host.onInput(this.editingRow, this.editingCol, this.input.value)
    })

    this.input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.commit()
        this.host.move(1, 0)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.cancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const dCol = e.shiftKey ? -1 : 1
        this.commit()
        this.host.move(0, dCol)
      }
    })

    this.input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (document.activeElement !== this.input) this.commit()
      }, 0)
    })
  }

  /** Move the shared input into `td` and focus it. */
  begin(row: number, col: number): void {
    if (row < 0 || col < 0) return
    if (this.isEditing && (this.editingRow !== row || this.editingCol !== col)) {
      this.commit()
    }

    const td = this.host.getCellTd(row, col)
    if (!td) return

    this.editingRow = row
    this.editingCol = col
    this.originalValue = this.host.getValue(row, col)

    this.host.hideCellDisplay(td, row)
    td.appendChild(this.input)
    this.activeTd = td
    td.classList.add('typ-csv-editing')
    setCssStyles(this.input, { display: 'block' })
    this.input.value = this.originalValue
    this.host.setActiveCell(row, col, td)
    this.input.focus()
    const len = this.input.value.length
    this.input.setSelectionRange(len, len)
  }

  commit(): void {
    if (!this.isEditing) return
    const row = this.editingRow
    const col = this.editingCol
    const value = this.input.value
    this.reset()
    this.detach()
    this.host.onCommit(row, col, value)
  }

  cancel(): void {
    if (!this.isEditing) return
    const row = this.editingRow
    const col = this.editingCol
    const value = this.originalValue
    this.reset()
    this.detach()
    this.host.onCancel(row, col, value)
  }

  /** Keep the shared input in sync when the edit bar changes the value. */
  syncFromExternal(value: string): void {
    if (this.isEditing) this.input.value = value
  }

  getOriginalValue(): string {
    return this.originalValue
  }

  private reset(): void {
    this.editingRow = -1
    this.editingCol = -1
  }

  private detach(): void {
    this.activeTd?.classList.remove('typ-csv-editing')
    this.activeTd = null
    setCssStyles(this.input, { display: 'none' })
    this.holder.appendChild(this.input)
  }

  /** Move the input out of the DOM before a full re-render. */
  park(): void {
    this.detach()
  }
}
