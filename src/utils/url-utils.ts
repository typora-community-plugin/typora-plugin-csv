import { createSpan, empty } from './dom'

/** URL detection & rendering, ported from csv-lite. */

const URL_PATTERN = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g

const URL_TEST_PATTERN = new RegExp(URL_PATTERN.source, 'i')
const MARKDOWN_LINK_TEST_PATTERN = new RegExp(MARKDOWN_LINK_PATTERN.source, 'i')

/** Cheap check: does this cell text contain a URL or Markdown link? */
export function containsUrl(text: string): boolean {
  if (!text.includes('http')) return false
  return URL_TEST_PATTERN.test(text) || MARKDOWN_LINK_TEST_PATTERN.test(text)
}

export interface TextSegment {
  text: string
  isUrl: boolean
  url?: string
  displayText?: string
}

/** Split text into plain / link segments (Markdown links take precedence). */
export function parseTextWithUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = []

  interface Match {
    index: number
    length: number
    displayText: string
    url: string
  }
  const matches: Match[] = []

  const markdownRegex = new RegExp(MARKDOWN_LINK_PATTERN)
  let mdMatch: RegExpExecArray | null
  while ((mdMatch = markdownRegex.exec(text)) !== null) {
    matches.push({
      index: mdMatch.index,
      length: mdMatch[0].length,
      displayText: mdMatch[1],
      url: mdMatch[2],
    })
  }

  const urlRegex = new RegExp(URL_PATTERN)
  let urlMatch: RegExpExecArray | null
  while ((urlMatch = urlRegex.exec(text)) !== null) {
    const isPartOfMarkdown = matches.some(
      m => urlMatch!.index >= m.index && urlMatch!.index < m.index + m.length,
    )
    if (!isPartOfMarkdown) {
      matches.push({
        index: urlMatch.index,
        length: urlMatch[0].length,
        displayText: urlMatch[0],
        url: urlMatch[0],
      })
    }
  }

  matches.sort((a, b) => a.index - b.index)

  let lastIndex = 0
  for (const match of matches) {
    if (match.index > lastIndex) {
      segments.push({ text: text.substring(lastIndex, match.index), isUrl: false })
    }
    segments.push({
      text: match.displayText,
      isUrl: true,
      url: match.url,
      displayText: match.displayText,
    })
    lastIndex = match.index + match.length
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), isUrl: false })
  }

  if (segments.length === 0) {
    segments.push({ text, isUrl: false })
  }
  return segments
}

/**
 * Build a read-only cell display layer with clickable links.
 * Uses DOM construction (never `innerHTML`) to avoid injection.
 */
export function createUrlDisplay(parent: HTMLElement, text: string, onEditClick?: () => void): HTMLElement {
  const display = document.createElement('div')
  display.className = 'typ-csv-cell-display typ-csv-cell-display-has-url'
  display.title = text
  parent.appendChild(display)

  const segments = parseTextWithUrls(text)
  for (const segment of segments) {
    if (segment.isUrl && segment.url) {
      const link = document.createElement('a')
      link.className = 'typ-csv-cell-link'
      link.textContent = segment.displayText || segment.text
      link.href = segment.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.onclick = e => e.stopPropagation()
      display.appendChild(link)
    } else {
      display.appendChild(document.createTextNode(segment.text))
    }
  }

  if (onEditClick) {
    const editBtn = createSpan({ cls: 'typ-csv-cell-edit-btn', text: '✎' })
    editBtn.title = 'Click to edit'
    editBtn.onclick = e => {
      e.stopPropagation()
      onEditClick()
    }
    display.appendChild(editBtn)
  }

  return display
}

/** Re-export for callers that need to clear a display layer. */
export { empty }
