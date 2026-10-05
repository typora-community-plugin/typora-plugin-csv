/** Keyboard shortcut predicates (pure, no DOM KeyboardEvent dependency). */

export interface KeyEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/**
 * Ctrl+F / Cmd+F: focus the in-table search box.
 * Shift / Alt are intentionally excluded so we do not steal the host's
 * global search shortcut (e.g. Ctrl+Shift+F).
 */
export function isSearchShortcut(e: KeyEventLike): boolean {
  if (!e.ctrlKey && !e.metaKey) return false
  if (e.shiftKey || e.altKey) return false
  return e.key === 'f' || e.key === 'F'
}

/** Ctrl+Z / Cmd+Z, and Ctrl+Shift+Z / Cmd+Shift+Z for redo. */
export function getHistoryAction(e: KeyEventLike): 'undo' | 'redo' | null {
  if (!e.ctrlKey && !e.metaKey) return null
  if (e.key !== 'z' && e.key !== 'Z') return null
  if (e.altKey) return null
  return e.shiftKey ? 'redo' : 'undo'
}
