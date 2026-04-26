import { describe, test, expect } from 'vitest'
import { parseContent } from './parseContent'

describe('parseContent — TipTap content guard', () => {
  test("returns '' for empty string", () => {
    expect(parseContent('')).toBe('')
  })

  test("returns '' for the literal string '{}'", () => {
    // Critical: '{}' parses to the empty object, which TipTap rejects with
    // "Invalid content for node doc". The guard must convert it to ''.
    expect(parseContent('{}')).toBe('')
  })

  test("returns '' for malformed JSON", () => {
    expect(parseContent('{not valid json')).toBe('')
    expect(parseContent('undefined')).toBe('')
    expect(parseContent('[1,2,')).toBe('')
  })

  test("returns '' for valid JSON that is not a doc shape", () => {
    expect(parseContent('null')).toBe('')
    expect(parseContent('123')).toBe('')
    expect(parseContent('"hello"')).toBe('')
    expect(parseContent('[]')).toBe('')
    expect(parseContent('{"type":"paragraph"}')).toBe('')
    expect(parseContent('{"foo":"bar"}')).toBe('')
  })

  test('returns the parsed object for valid {type:"doc", ...} shape', () => {
    const docJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    })
    const result = parseContent(docJson)
    expect(result).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }],
    })
  })

  test('returns the parsed doc even when content array is empty', () => {
    const result = parseContent('{"type":"doc","content":[]}')
    expect(result).toEqual({ type: 'doc', content: [] })
  })
})
