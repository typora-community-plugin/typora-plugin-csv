import { query, queryAll } from './dom'

/** Row / column selection highlighting. */
export class HighlightManager {

  private selectedRow = -1
  private selectedCol = -1

  constructor(private tableEl: HTMLElement) {}

  selectRow(rowIndex: number): void {
    if (this.selectedRow === rowIndex) {
      this.clearSelection()
      return
    }
    this.clearSelection()
    this.selectedRow = rowIndex
    const row = query(this.tableEl, `tbody tr[data-row="${rowIndex}"]`)
    row?.classList.add('typ-csv-row-selected')
  }

  selectColumn(colIndex: number): void {
    if (this.selectedCol === colIndex) {
      this.clearSelection()
      return
    }
    this.clearSelection()
    this.selectedCol = colIndex
    queryAll(this.tableEl, `th:nth-child(${colIndex + 2}), td:nth-child(${colIndex + 2})`).forEach(
      cell => cell.classList.add('typ-csv-col-selected'),
    )
  }

  clearSelection(): void {
    this.selectedRow = -1
    this.selectedCol = -1
    queryAll(this.tableEl, '.typ-csv-row-selected, .typ-csv-col-selected').forEach(el =>
      el.classList.remove('typ-csv-row-selected', 'typ-csv-col-selected'),
    )
  }

  getSelectedRow(): number {
    return this.selectedRow
  }

  getSelectedCol(): number {
    return this.selectedCol
  }

  setTableEl(tableEl: HTMLElement): void {
    this.tableEl = tableEl
  }
}
