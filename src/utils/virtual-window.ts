/**
 * Row virtualization window math, ported from csv-lite (pure functions).
 *
 * Only rows in [start, end) are rendered; equal-height spacer rows above and
 * below keep the scrollbar length and `scrollTop` stable.
 */
export interface VirtualWindow {
  /** First rendered row (0-based, inclusive). */
  start: number
  /** Last rendered row (0-based, exclusive). */
  end: number
  /** Height of the top spacer (px). */
  topPad: number
  /** Height of the bottom spacer (px). */
  bottomPad: number
}

export function computeVirtualWindow(
  totalRows: number,
  rowHeight: number,
  scrollTop: number,
  viewportHeight: number,
  overscan = 8,
): VirtualWindow {
  const rows = Math.max(0, Math.floor(totalRows))
  if (rows === 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 }

  const h = rowHeight > 0 && Number.isFinite(rowHeight) ? rowHeight : 24
  const visibleCount = Math.max(1, Math.ceil(Math.max(0, viewportHeight) / h) + 1)
  const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop) / h))
  const over = Math.max(0, Math.floor(overscan))

  const start = Math.max(0, Math.min(rows - 1, firstVisible - over))
  const end = Math.max(start + 1, Math.min(rows, firstVisible + visibleCount + over))

  return { start, end, topPad: start * h, bottomPad: Math.max(0, (rows - end) * h) }
}

/**
 * Shift a window computed in "tbody row space" onto real row indices.
 * Used by "first row as header" mode: row 0 lives in `<thead>` and the tbody
 * starts at row 1. Spacer heights stay in tbody space, unchanged.
 */
export function offsetVirtualWindow(window: VirtualWindow, offset: number): VirtualWindow {
  if (!offset) return window
  return { ...window, start: window.start + offset, end: window.end + offset }
}
