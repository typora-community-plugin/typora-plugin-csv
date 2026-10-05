import { createDiv, createEl, createSpan, empty } from '../utils/dom'
import { fmt, type CsvI18n } from '../i18n'

export interface SearchBarOptions {
  i18n: CsvI18n
  getTableData: () => string[][]
  getColumnLabel: (index: number) => string
  getCellAddress: (row: number, col: number) => string
  jumpToCell: (row: number, col: number) => void
  clearSearchHighlights: () => void
  /** First searched row (header-row mode skips row 0). */
  getStartRow?: () => number
}

interface SearchMatch {
  row: number
  col: number
  value: string
}

/** In-table search box with debounced full-table scan. */
export class SearchBar {

  private searchContainer: HTMLElement
  private searchInput: HTMLInputElement
  private searchResults: HTMLElement

  private searchMatches: SearchMatch[] = []
  private currentSearchIndex = -1
  private searchTimeout = 0
  private outsideHandler: (e: MouseEvent) => void

  constructor(parentContainer: HTMLElement, private options: SearchBarOptions) {
    this.searchContainer = createDiv({ cls: 'typ-csv-search-container', parent: parentContainer })
    this.searchInput = createEl('input', {
      cls: 'typ-csv-search-input',
      attr: { type: 'text', placeholder: options.i18n.t.search.placeholder },
      parent: this.searchContainer,
    })
    this.searchResults = createDiv({ cls: 'typ-csv-search-results', parent: this.searchContainer })

    this.outsideHandler = (e: MouseEvent) => {
      if (!this.searchContainer.contains(e.target as Node)) this.hideSearchResults()
    }
    this.setupSearchEvents()
  }

  focus(): void {
    this.searchInput.focus()
    this.searchInput.select()
    if (this.searchMatches.length > 0) this.searchResults.classList.add('show')
  }

  destroy(): void {
    window.clearTimeout(this.searchTimeout)
    document.removeEventListener('click', this.outsideHandler)
  }

  private setupSearchEvents(): void {
    this.searchInput.addEventListener('input', () => {
      window.clearTimeout(this.searchTimeout)
      this.searchTimeout = window.setTimeout(() => this.performSearch(this.searchInput.value), 300)
    })
    this.searchInput.addEventListener('focus', () => {
      if (this.searchMatches.length > 0) this.searchResults.classList.add('show')
    })
    this.searchInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        this.navigateSearchResults(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        this.navigateSearchResults(-1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        this.selectCurrentSearchResult()
      } else if (e.key === 'Escape') {
        this.searchInput.value = ''
        this.performSearch('')
        this.hideSearchResults()
      }
    })
    document.addEventListener('click', this.outsideHandler)
  }

  private performSearch(query: string): void {
    this.searchMatches = []
    this.currentSearchIndex = -1
    if (!query.trim()) {
      this.hideSearchResults()
      this.options.clearSearchHighlights()
      return
    }
    const searchTerm = query.toLowerCase().trim()
    const tableData = this.options.getTableData()
    const startRow = Math.max(0, this.options.getStartRow?.() ?? 0)
    for (let i = startRow; i < tableData.length; i++) {
      const row = tableData[i]
      if (!row) continue
      for (let j = 0; j < row.length; j++) {
        const cellValue = row[j]
        if (cellValue.toLowerCase().includes(searchTerm)) {
          this.searchMatches.push({ row: i, col: j, value: cellValue })
        }
      }
    }
    this.displaySearchResults(query)
  }

  private displaySearchResults(query: string): void {
    empty(this.searchResults)
    if (this.searchMatches.length === 0) {
      createDiv({
        cls: 'typ-csv-search-result-item typ-csv-search-result-empty',
        text: this.options.i18n.t.search.noResults,
        parent: this.searchResults,
      })
      this.searchResults.classList.add('show')
      return
    }

    this.searchMatches.slice(0, 10).forEach((match, index) => {
      const resultItem = createDiv({ cls: 'typ-csv-search-result-item', parent: this.searchResults })
      const cellInfo = createDiv({ parent: resultItem })
      createSpan({ cls: 'typ-csv-search-result-cell', text: this.options.getCellAddress(match.row, match.col), parent: cellInfo })
      createSpan({
        cls: 'typ-csv-search-result-address',
        text: fmt(this.options.i18n.t.search.rowColumn, {
          row: match.row + 1,
          col: match.col + 1,
        }),
        parent: cellInfo,
      })
      const preview = createDiv({ cls: 'typ-csv-search-result-preview', parent: resultItem })
      this.renderHighlightedPreview(preview, match.value, query)
      resultItem.addEventListener('click', () => {
        this.options.jumpToCell(match.row, match.col)
        this.hideSearchResults()
      })
      resultItem.setAttribute('data-index', index.toString())
    })

    if (this.searchMatches.length > 10) {
      createDiv({
        cls: 'typ-csv-search-result-item typ-csv-search-result-more',
        text: fmt(this.options.i18n.t.search.moreResults, { count: this.searchMatches.length - 10 }),
        parent: this.searchResults,
      })
    }
    this.searchResults.classList.add('show')
  }

  /** Render the preview and highlight the matched slice via DOM nodes. */
  private renderHighlightedPreview(preview: HTMLElement, text: string, searchTerm: string): void {
    empty(preview)
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) {
      preview.append(document.createTextNode(text))
      return
    }
    const haystack = text.toLowerCase()
    let cursor = 0
    let found = haystack.indexOf(needle, cursor)
    while (found >= 0) {
      if (found > cursor) preview.append(document.createTextNode(text.slice(cursor, found)))
      createSpan({
        cls: 'typ-csv-search-highlight',
        text: text.slice(found, found + needle.length),
        parent: preview,
      })
      cursor = found + needle.length
      found = haystack.indexOf(needle, cursor)
    }
    if (cursor < text.length) preview.append(document.createTextNode(text.slice(cursor)))
  }

  private navigateSearchResults(direction: number): void {
    const items = Array.from(this.searchResults.querySelectorAll('.typ-csv-search-result-item[data-index]'))
    if (items.length === 0) return
    items.forEach(item => item.classList.remove('typ-csv-search-result-hover'))
    this.currentSearchIndex = Math.max(0, Math.min(items.length - 1, this.currentSearchIndex + direction))
    const currentItem = items[this.currentSearchIndex] as HTMLElement
    if (currentItem) {
      currentItem.classList.add('typ-csv-search-result-hover')
      currentItem.scrollIntoView({ block: 'nearest' })
    }
  }

  private selectCurrentSearchResult(): void {
    if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchMatches.length) {
      const match = this.searchMatches[this.currentSearchIndex]
      this.options.jumpToCell(match.row, match.col)
      this.hideSearchResults()
    }
  }

  private hideSearchResults(): void {
    this.searchResults.classList.remove('show')
    this.currentSearchIndex = -1
  }
}
