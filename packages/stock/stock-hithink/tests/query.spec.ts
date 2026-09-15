import { describe, expect, it } from 'vitest'
import { buildQuery } from '../src/query.ts'

describe('buildQuery', () => {
  it('returns an empty string when no parameter was supplied', () => {
    expect(buildQuery({})).toBe('')
  })

  it('serializes strings, numbers and booleans', () => {
    expect(buildQuery({ thscode: '600519.SH', limit: 100, adjust: 'forward' }))
      .toBe('thscode=600519.SH&limit=100&adjust=forward')
    expect(buildQuery({ date_ms: 1_784_275_991_000 })).toBe('date_ms=1784275991000')
    expect(buildQuery({ subscribe: true })).toBe('subscribe=true')
    expect(buildQuery({ subscribe: false })).toBe('subscribe=false')
  })

  it('keeps the map insertion order, which is registry declaration order', () => {
    expect(buildQuery({ b: 1, a: 2, c: 3 })).toBe('b=1&a=2&c=3')
  })

  it('percent-encodes reserved characters and multi-byte text', () => {
    expect(buildQuery({ thscodes: '600519.SH,000001.SZ' })).toBe('thscodes=600519.SH%2C000001.SZ')
    expect(buildQuery({ q: '中际旭创' })).toBe(`q=${encodeURIComponent('中际旭创')}`)
    expect(buildQuery({ q: 'a b' })).toBe('q=a+b')
  })
})
