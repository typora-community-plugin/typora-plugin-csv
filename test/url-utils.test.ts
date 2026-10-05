import { describe, test, expect } from 'vitest'
import { containsUrl, parseTextWithUrls } from '../src/utils/url-utils'

describe('containsUrl', () => {
  test('detects HTTP/HTTPS URLs', () => {
    expect(containsUrl('http://example.com')).toBe(true)
    expect(containsUrl('Check out https://github.com')).toBe(true)
  })
  test('detects URLs with paths, query and fragments', () => {
    expect(containsUrl('https://example.com/path/to/page')).toBe(true)
    expect(containsUrl('https://example.com?foo=bar&baz=qux')).toBe(true)
    expect(containsUrl('https://example.com#section')).toBe(true)
  })
  test('returns false for non-URLs', () => {
    expect(containsUrl('Just plain text')).toBe(false)
    expect(containsUrl('example.com')).toBe(false)
    expect(containsUrl('www.example.com')).toBe(false)
    expect(containsUrl('')).toBe(false)
  })
  test('detects Markdown-style links', () => {
    expect(containsUrl('[GitHub](https://github.com)')).toBe(true)
    expect(containsUrl('Check [this link](https://example.com) out')).toBe(true)
  })
})

describe('parseTextWithUrls', () => {
  test('parses text with no URLs', () => {
    expect(parseTextWithUrls('Just plain text')).toEqual([{ text: 'Just plain text', isUrl: false }])
  })

  test('parses a single URL with surrounding text', () => {
    const result = parseTextWithUrls('Visit https://example.com today')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ text: 'Visit ', isUrl: false })
    expect(result[1]).toEqual({
      text: 'https://example.com',
      isUrl: true,
      url: 'https://example.com',
      displayText: 'https://example.com',
    })
    expect(result[2]).toEqual({ text: ' today', isUrl: false })
  })

  test('parses a Markdown link', () => {
    const result = parseTextWithUrls('[GitHub](https://github.com)')
    expect(result).toHaveLength(1)
    expect(result[0].isUrl).toBe(true)
    expect(result[0].url).toBe('https://github.com')
    expect(result[0].displayText).toBe('GitHub')
  })

  test('parses mixed Markdown links and plain URLs', () => {
    const result = parseTextWithUrls('[GitHub](https://github.com) and https://example.com')
    expect(result).toHaveLength(3)
    expect(result[0].isUrl).toBe(true)
    expect(result[1].text).toBe(' and ')
    expect(result[2].isUrl).toBe(true)
    expect(result[2].url).toBe('https://example.com')
  })

  test('parses a URL with a complex path', () => {
    const url = 'https://example.com/path/to/page?param=value&other=123#section'
    const result = parseTextWithUrls(url)
    expect(result).toHaveLength(1)
    expect(result[0].isUrl).toBe(true)
    expect(result[0].url).toBe(url)
  })
})
