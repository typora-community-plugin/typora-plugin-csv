import { describe, test, expect } from 'vitest'
import { isSearchShortcut, getHistoryAction } from '../src/utils/keyboard-utils'

describe('isSearchShortcut', () => {
  test('matches Ctrl+F on Windows/Linux', () => {
    expect(isSearchShortcut({ key: 'f', ctrlKey: true })).toBe(true)
  })
  test('matches Cmd+F on macOS', () => {
    expect(isSearchShortcut({ key: 'f', metaKey: true })).toBe(true)
  })
  test('matches uppercase F', () => {
    expect(isSearchShortcut({ key: 'F', ctrlKey: true })).toBe(true)
  })
  test('ignores plain f without a modifier', () => {
    expect(isSearchShortcut({ key: 'f' })).toBe(false)
  })
  test('ignores Ctrl+Shift+F', () => {
    expect(isSearchShortcut({ key: 'f', ctrlKey: true, shiftKey: true })).toBe(false)
  })
  test('ignores Ctrl+Alt+F', () => {
    expect(isSearchShortcut({ key: 'f', ctrlKey: true, altKey: true })).toBe(false)
  })
  test('ignores other combinations', () => {
    expect(isSearchShortcut({ key: 'z', ctrlKey: true })).toBe(false)
    expect(isSearchShortcut({ key: 's', metaKey: true })).toBe(false)
  })
})

describe('getHistoryAction', () => {
  test('maps Ctrl+Z to undo', () => {
    expect(getHistoryAction({ key: 'z', ctrlKey: true })).toBe('undo')
  })
  test('maps Cmd+Z to undo', () => {
    expect(getHistoryAction({ key: 'z', metaKey: true })).toBe('undo')
  })
  test('maps Ctrl+Shift+Z to redo', () => {
    expect(getHistoryAction({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo')
  })
  test('ignores non-z keys', () => {
    expect(getHistoryAction({ key: 'y', ctrlKey: true })).toBeNull()
  })
})
