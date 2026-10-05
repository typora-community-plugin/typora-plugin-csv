/**
 * Generic undo/redo stack. Pure: no UI side effects, so it is fully testable.
 */
export class HistoryManager<T> {

  private history: T[] = []
  private currentIndex = -1

  constructor(initialState?: T, private maxSize = 50) {
    if (initialState !== undefined) this.push(initialState)
  }

  push(state: T): void {
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1)
    }
    this.history.push(this.cloneState(state))
    if (this.history.length > this.maxSize) {
      this.history.shift()
    } else {
      this.currentIndex++
    }
  }

  undo(): T | null {
    if (!this.canUndo()) return null
    this.currentIndex--
    return this.getCurrentState()
  }

  redo(): T | null {
    if (!this.canRedo()) return null
    this.currentIndex++
    return this.getCurrentState()
  }

  getCurrentState(): T | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
      return this.cloneState(this.history[this.currentIndex])
    }
    return null
  }

  canUndo(): boolean {
    return this.currentIndex > 0
  }

  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1
  }

  reset(initialState?: T): void {
    this.history = []
    this.currentIndex = -1
    if (initialState !== undefined) this.push(initialState)
  }

  protected cloneState(state: T): T {
    if (Array.isArray(state)) {
      if (state.length > 0 && Array.isArray(state[0])) {
        return (state as unknown as string[][]).map(row => [...row]) as unknown as T
      }
      return [...state] as unknown as T
    }
    if (typeof state === 'object' && state !== null) {
      return JSON.parse(JSON.stringify(state)) as T
    }
    return state
  }
}

/** Specialized for CSV table data (2D string arrays). */
export class TableHistoryManager extends HistoryManager<string[][]> {
  protected cloneState(state: string[][]): string[][] {
    return state.map(row => [...row])
  }
}
