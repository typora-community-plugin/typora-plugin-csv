/**
 * Tiny DOM helpers used instead of Obsidian's prototype augmentations.
 * All plugin UI code builds DOM through these plain functions.
 */

export type CssStyles = Record<string, string>

export interface CreateElOptions {
  cls?: string | string[]
  text?: string
  title?: string
  attr?: Record<string, string | number | boolean>
  style?: string | CssStyles
  parent?: ParentNode
}

export function addClass(el: Element, cls?: string | string[]): void {
  if (!cls) return
  const list = Array.isArray(cls) ? cls : cls.split(/\s+/)
  for (const name of list) {
    if (name) el.classList.add(name)
  }
}

export function removeClass(el: Element, ...cls: string[]): void {
  el.classList.remove(...cls)
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: CreateElOptions = {},
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (options.cls) addClass(el, options.cls)
  if (options.text !== undefined) el.textContent = options.text
  if (options.title !== undefined) el.title = options.title
  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      el.setAttribute(key, String(value))
    }
  }
  if (options.style) setCssStyles(el, options.style)
  if (options.parent) options.parent.appendChild(el)
  return el
}

export function createDiv(options: CreateElOptions = {}): HTMLDivElement {
  return createEl('div', options)
}

export function createSpan(options: CreateElOptions = {}): HTMLSpanElement {
  return createEl('span', options)
}

/** Remove every child of `el`. */
export function empty(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

/** Append a plain text node (never parses HTML). */
export function appendText(parent: Node, text: string): void {
  parent.appendChild(document.createTextNode(text))
}

export function setCssStyles(el: HTMLElement | SVGElement, styles: string | CssStyles): void {
  if (typeof styles === 'string') {
    el.setAttribute('style', styles)
    return
  }
  for (const [key, value] of Object.entries(styles)) {
    ;(el.style as unknown as Record<string, string>)[key] = value
  }
}

/** `querySelector` shorthand returning the element or `null`. */
export function query<T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector)
}

/** `querySelectorAll` shorthand returning a real array. */
export function queryAll<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  return Array.from(root.querySelectorAll<T>(selector))
}

/** `el.closest` shorthand with a typed cast. */
export function closest<T extends Element = HTMLElement>(el: Element | null, selector: string): T | null {
  return (el?.closest(selector) as T | null) ?? null
}
