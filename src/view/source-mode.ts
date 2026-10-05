import { createDiv, createEl } from '../utils/dom'

export interface SourceModeOptions {
  onChange: () => void
}

/**
 * Raw-text editing mode using a plain `<textarea>` (replaces CodeMirror).
 * Line endings are restored to the file's original style on `getText()`.
 */
export class SourceMode {

  readonly containerEl: HTMLElement

  private textarea: HTMLTextAreaElement
  private dirty = false
  private originalNewline = '\n'

  constructor(parent: HTMLElement, private options: SourceModeOptions) {
    this.containerEl = createDiv({ cls: 'typ-csv-source-container' })
    this.containerEl.style.display = 'none'
    this.textarea = createEl('textarea', { cls: 'typ-csv-source-textarea', parent: this.containerEl })
    this.textarea.spellcheck = false
    this.textarea.addEventListener('input', () => {
      this.dirty = true
      this.options.onChange()
    })
    parent.appendChild(this.containerEl)
  }

  /** Replace the textarea content programmatically (does not count as an edit). */
  setText(text: string, originalNewline: string): void {
    this.originalNewline = originalNewline
    this.textarea.value = text
    this.dirty = false
  }

  getText(): string {
    const value = this.textarea.value
    return this.originalNewline === '\r\n' ? value.replace(/\r?\n/g, '\r\n') : value
  }

  isDirty(): boolean {
    return this.dirty
  }

  markClean(): void {
    this.dirty = false
  }

  show(): void {
    this.containerEl.style.display = ''
  }

  hide(): void {
    this.containerEl.style.display = 'none'
  }

  focus(): void {
    this.textarea.focus()
  }
}
