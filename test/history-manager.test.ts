import { describe, test, expect } from 'vitest'
import { TableHistoryManager } from '../src/utils/history-manager'

describe('TableHistoryManager', () => {
  test('undo returns null when there is nothing to undo', () => {
    const hm = new TableHistoryManager([['a']], 10)
    expect(hm.undo()).toBeNull()
  })

  test('undo restores the previous state', () => {
    const hm = new TableHistoryManager([['a']], 10)
    hm.push([['b']])
    expect(hm.undo()).toEqual([['a']])
  })

  test('redo returns null when there is nothing to redo', () => {
    const hm = new TableHistoryManager([['a']], 10)
    expect(hm.redo()).toBeNull()
  })

  test('redo restores the next state', () => {
    const hm = new TableHistoryManager([['a']], 10)
    hm.push([['b']])
    hm.undo()
    expect(hm.redo()).toEqual([['b']])
  })

  test('pushing after an undo truncates the redo stack', () => {
    const hm = new TableHistoryManager([['a']], 10)
    hm.push([['b']])
    hm.undo()
    expect(hm.canRedo()).toBe(true)
    hm.push([['c']])
    expect(hm.canRedo()).toBe(false)
    expect(hm.getCurrentState()).toEqual([['c']])
  })

  test('returned states are clones, not live references', () => {
    const initial = [['a']]
    const hm = new TableHistoryManager(initial, 10)
    initial[0][0] = 'mutated'
    expect(hm.getCurrentState()).toEqual([['a']])
  })

  test('respects the max history size', () => {
    const hm = new TableHistoryManager<string[]>([['0']], 3)
    for (let i = 1; i < 10; i++) hm.push([[String(i)]])
    let steps = 0
    while (hm.canUndo()) {
      hm.undo()
      steps++
    }
    expect(steps).toBe(2)
  })

  test('reset clears the stack', () => {
    const hm = new TableHistoryManager<string[]>([['a']], 10)
    hm.push([['b']])
    hm.reset([['c']])
    expect(hm.canUndo()).toBe(false)
    expect(hm.getCurrentState()).toEqual([['c']])
  })
})
