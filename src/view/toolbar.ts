import { createDiv, createEl, createSpan } from '../utils/dom'
import type { CsvI18n } from '../i18n'
import type { Delimiter } from '../settings/settings'

export type ViewMode = 'table' | 'source'

export interface ToolbarOptions {
  i18n: CsvI18n
  currentDelimiter: Delimiter
  detectedDelimiter: string
  headerEnabled: boolean
  mode: ViewMode
  onUndo: () => void
  onRedo: () => void
  onResetColumnWidth: () => void
  onToggleHeader: () => void
  onToggleMode: () => void
  onDelimiterChange: (delimiter: Delimiter) => void
}

export interface ToolbarRefs {
  operationEl: HTMLElement
  buttonsGroup: HTMLElement
  searchContainer: HTMLElement
  editBarEl: HTMLElement
  editInput: HTMLInputElement
  headerToggleButton: HTMLButtonElement
  modeToggleButton: HTMLButtonElement
  delimiterSelect: HTMLSelectElement
  topScrollEl: HTMLElement
}

function iconButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = createEl('button', { attr: { type: 'button' }, parent })
  const i = createEl('i', { cls: `fa ${icon}` })
  btn.appendChild(i)
  btn.appendChild(createSpan({ text: label }))
  btn.onclick = onClick
  return btn
}

export function renderToolbar(parent: HTMLElement, options: ToolbarOptions): ToolbarRefs {
  const t = options.i18n.t

  const operationEl = createDiv({ cls: 'typ-csv-toolbar', parent })
  const buttonsRow = createDiv({ cls: 'typ-csv-operation-buttons', parent: operationEl })

  const buttonsGroup = createDiv({ cls: 'typ-csv-buttons-group', parent: buttonsRow })

  iconButton(buttonsGroup, 'fa-undo', t.buttons.undo, options.onUndo)
  iconButton(buttonsGroup, 'fa-repeat', t.buttons.redo, options.onRedo)
  iconButton(buttonsGroup, 'fa-arrows-h', t.buttons.resetColumnWidth, options.onResetColumnWidth)

  const modeToggleButton = iconButton(
    buttonsGroup,
    options.mode === 'table' ? 'fa-code' : 'fa-table',
    options.mode === 'table' ? t.buttons.sourceMode : t.buttons.tableMode,
    options.onToggleMode,
  )

  const headerToggleButton = iconButton(buttonsGroup, 'fa-header', t.buttons.toggleHeaderRow, options.onToggleHeader)
  headerToggleButton.classList.add('typ-csv-header-toggle')

  const delimiterContainer = createDiv({ cls: 'typ-csv-delimiter-compact', parent: buttonsGroup })
  const delimiterSelect = createEl('select', { parent: delimiterContainer })
  const delimiterOptions: Array<[Delimiter, string]> = [
    ['auto', `${t.settings.delimiterAuto} (${options.detectedDelimiter})`],
    [',', t.settings.delimiterComma],
    [';', t.settings.delimiterSemicolon],
    ['\t', t.settings.delimiterTab],
    ['|', t.settings.delimiterPipe],
  ]
  for (const [value, label] of delimiterOptions) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    delimiterSelect.appendChild(opt)
  }
  delimiterSelect.value = options.currentDelimiter
  delimiterSelect.onchange = () => options.onDelimiterChange(delimiterSelect.value as Delimiter)

  const searchContainer = createDiv({ cls: 'typ-csv-search-bar-container', parent: buttonsRow })

  const editBarEl = createDiv({ cls: 'typ-csv-edit-bar', parent: buttonsRow })
  const editInput = createEl('input', {
    cls: 'typ-csv-edit-input',
    attr: { placeholder: t.editBar.placeholder },
    parent: editBarEl,
  })

  const topScrollEl = createDiv({ cls: 'scroll-container typ-csv-top-scroll', parent: operationEl })

  return {
    operationEl,
    buttonsGroup,
    searchContainer,
    editBarEl,
    editInput,
    headerToggleButton,
    modeToggleButton,
    delimiterSelect,
    topScrollEl,
  }
}
