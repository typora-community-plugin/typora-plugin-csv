import { createDiv } from '../utils/dom'
import type { CsvI18n } from '../i18n'

export interface HeaderContextMenuOptions {
  i18n: CsvI18n
  onInsertRowAbove: (rowIndex: number) => void
  onInsertRowBelow: (rowIndex: number) => void
  onDeleteRow: (rowIndex: number) => void
  onMoveRowUp: (rowIndex: number) => void
  onMoveRowDown: (rowIndex: number) => void
  onInsertColLeft: (colIndex: number) => void
  onInsertColRight: (colIndex: number) => void
  onDeleteCol: (colIndex: number) => void
  onMoveColLeft: (colIndex: number) => void
  onMoveColRight: (colIndex: number) => void
  selectRow?: (rowIndex: number) => void
  selectColumn?: (colIndex: number) => void
  clearSelection?: () => void
  onMenuClose?: () => void
}

interface MenuItem {
  label: string
  onClick: () => void
}

class MenuManager {
  private menuEl: HTMLDivElement | null = null
  private outsideHandler: ((e: MouseEvent) => void) | null = null
  private keyHandler: ((e: KeyboardEvent) => void) | null = null

  showMenu(items: MenuItem[], x: number, y: number, onClose?: () => void): void {
    this.closeMenu()
    const menuEl = createDiv({ cls: 'typ-csv-header-context-menu' })
    Object.assign(menuEl.style, {
      left: `${x}px`,
      top: `${y}px`,
    })
    for (const item of items) {
      const div = createDiv({ cls: 'typ-csv-context-menu-item', text: item.label })
      div.onclick = ev => {
        ev.stopPropagation()
        ev.preventDefault()
        this.closeMenu()
        item.onClick()
      }
      menuEl.appendChild(div)
    }
    document.body.appendChild(menuEl)
    this.menuEl = menuEl

    this.outsideHandler = e => {
      if (this.menuEl && !this.menuEl.contains(e.target as Node)) this.closeMenu(onClose)
    }
    this.keyHandler = e => {
      if (e.key === 'Escape') this.closeMenu(onClose)
    }
    window.setTimeout(() => {
      if (this.outsideHandler) document.addEventListener('mousedown', this.outsideHandler)
      if (this.keyHandler) document.addEventListener('keydown', this.keyHandler)
    }, 0)
  }

  closeMenu(onClose?: () => void): void {
    if (this.menuEl) {
      this.menuEl.remove()
      this.menuEl = null
    }
    if (this.outsideHandler) document.removeEventListener('mousedown', this.outsideHandler)
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler)
    this.outsideHandler = null
    this.keyHandler = null
    onClose?.()
  }
}

export function setupHeaderContextMenu(
  tableEl: HTMLElement,
  options: HeaderContextMenuOptions,
): () => void {
  const menuManager = new MenuManager()
  const t = options.i18n.t

  const handler = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    const rowNumberCell = target.closest('.typ-csv-row-number')
    const colNumberCell = target.closest('.typ-csv-col-number')
    if (rowNumberCell) {
      event.preventDefault()
      const tr = rowNumberCell.closest('tr') as HTMLElement | null
      if (!tr) return
      const rowIndex = Number(tr.dataset.row)
      if (Number.isNaN(rowIndex)) return
      options.selectRow?.(rowIndex)
      menuManager.showMenu(
        [
          { label: t.contextMenu.insertRowAbove, onClick: () => options.onInsertRowAbove(rowIndex) },
          { label: t.contextMenu.insertRowBelow, onClick: () => options.onInsertRowBelow(rowIndex) },
          { label: t.contextMenu.deleteRow, onClick: () => options.onDeleteRow(rowIndex) },
          { label: t.contextMenu.moveRowUp, onClick: () => options.onMoveRowUp(rowIndex) },
          { label: t.contextMenu.moveRowDown, onClick: () => options.onMoveRowDown(rowIndex) },
        ],
        event.clientX,
        event.clientY,
        () => {
          options.clearSelection?.()
          options.onMenuClose?.()
        },
      )
    } else if (colNumberCell) {
      event.preventDefault()
      const ths = Array.from(tableEl.querySelectorAll('.typ-csv-col-number'))
      const colIndex = ths.indexOf(colNumberCell)
      if (colIndex < 0) return
      options.selectColumn?.(colIndex)
      menuManager.showMenu(
        [
          { label: t.contextMenu.insertColLeft, onClick: () => options.onInsertColLeft(colIndex) },
          { label: t.contextMenu.insertColRight, onClick: () => options.onInsertColRight(colIndex) },
          { label: t.contextMenu.deleteCol, onClick: () => options.onDeleteCol(colIndex) },
          { label: t.contextMenu.moveColLeft, onClick: () => options.onMoveColLeft(colIndex) },
          { label: t.contextMenu.moveColRight, onClick: () => options.onMoveColRight(colIndex) },
        ],
        event.clientX,
        event.clientY,
        () => {
          options.clearSelection?.()
          options.onMenuClose?.()
        },
      )
    }
  }

  tableEl.addEventListener('contextmenu', handler)
  return () => {
    tableEl.removeEventListener('contextmenu', handler)
    menuManager.closeMenu()
  }
}
