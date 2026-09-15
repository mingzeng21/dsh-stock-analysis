import { describe, expect, it } from 'vitest'
import {
  STOCK_FORBIDDEN,
  STOCK_INVALID_PARAMS,
  STOCK_MALFORMED_RESPONSE,
  STOCK_NO_DATA,
  STOCK_NOT_FOUND,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UNSUPPORTED_ASSET,
  STOCK_UPSTREAM,
} from '@deepseek-ai/dsh-stock'
import { classify, isRetryable, mapVendorCode, readEnvelope } from '../src/envelope.ts'

/** Read one failure's seam code, or report that nothing was thrown. */
function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error: unknown) {
    return String((error as { code?: unknown }).code)
  }
  return 'no-throw'
}

describe('readEnvelope', () => {
  it('reads the documented success body', () => {
    expect(readEnvelope({ code: 0, message: 'success', request_id: 'abc', data: { item: [] } }))
      .toEqual({ code: 0, message: 'success', requestId: 'abc', data: { item: [] } })
  })

  it('tolerates the shortened throttling body, which has no request_id', () => {
    expect(readEnvelope({ code: 429, message: 'request limit exceeded', data: null }))
      .toEqual({ code: 429, message: 'request limit exceeded', data: null })
  })

  it('defaults a missing message and normalizes an absent data member to null', () => {
    expect(readEnvelope({ code: 0 })).toEqual({ code: 0, message: '', data: null })
  })

  it('keeps a present data member unchanged', () => {
    expect(readEnvelope({ code: 0, data: [] }).data).toEqual([])
  })

  it('rejects a body that is not an object', () => {
    expect(codeOf(() => readEnvelope('boom'))).toBe(STOCK_MALFORMED_RESPONSE)
    expect(codeOf(() => readEnvelope(undefined))).toBe(STOCK_MALFORMED_RESPONSE)
    expect(codeOf(() => readEnvelope(null))).toBe(STOCK_MALFORMED_RESPONSE)
    expect(codeOf(() => readEnvelope([1, 2]))).toBe(STOCK_MALFORMED_RESPONSE)
  })

  it('rejects an object with no numeric business code', () => {
    expect(codeOf(() => readEnvelope({ message: 'nope' }))).toBe(STOCK_MALFORMED_RESPONSE)
    expect(codeOf(() => readEnvelope({ code: '0' }))).toBe(STOCK_MALFORMED_RESPONSE)
    expect(codeOf(() => readEnvelope({ code: Number.NaN }))).toBe(STOCK_MALFORMED_RESPONSE)
  })
})

describe('mapVendorCode', () => {
  it('maps the parameter codes onto the seam parameter failure', () => {
    for (const code of [1001, 1002, 1003, 1004]) {
      expect(mapVendorCode(code)).toBe(STOCK_INVALID_PARAMS)
    }
  })

  it('maps every documented business code', () => {
    expect(mapVendorCode(2001)).toBe(STOCK_UNAUTHENTICATED)
    expect(mapVendorCode(2003)).toBe(STOCK_FORBIDDEN)
    expect(mapVendorCode(3001)).toBe(STOCK_NOT_FOUND)
    expect(mapVendorCode(3002)).toBe(STOCK_NO_DATA)
    expect(mapVendorCode(3004)).toBe(STOCK_UNSUPPORTED_ASSET)
    expect(mapVendorCode(4001)).toBe(STOCK_RATE_LIMITED)
    expect(mapVendorCode(429)).toBe(STOCK_RATE_LIMITED)
    expect(mapVendorCode(5001)).toBe(STOCK_UPSTREAM)
    expect(mapVendorCode(5002)).toBe(STOCK_UPSTREAM)
    expect(mapVendorCode(5003)).toBe(STOCK_UPSTREAM)
  })

  it('reports an unknown code as unmapped', () => {
    expect(mapVendorCode(9999)).toBeUndefined()
  })
})

describe('isRetryable', () => {
  const ok = { code: 0, message: '', data: null }

  it('retries throttling and the two transient upstream codes', () => {
    expect(isRetryable(429, ok)).toBe(true)
    expect(isRetryable(200, { ...ok, code: 429 })).toBe(true)
    expect(isRetryable(200, { ...ok, code: 4001 })).toBe(true)
    expect(isRetryable(200, { ...ok, code: 5002 })).toBe(true)
    expect(isRetryable(200, { ...ok, code: 5003 })).toBe(true)
  })

  it('does not retry a hard failure', () => {
    expect(isRetryable(200, { ...ok, code: 3001 })).toBe(false)
    expect(isRetryable(500, ok)).toBe(false)
  })
})

describe('classify', () => {
  it('accepts an HTTP 200 success', () => {
    expect(classify(200, { code: 0, message: 'success', data: {} })).toBeUndefined()
  })

  it('reports HTTP throttling even when the envelope claims success', () => {
    const failure = classify(429, { code: 0, message: 'slow down', data: null })
    expect(failure?.code).toBe(STOCK_RATE_LIMITED)
  })

  it('maps a business failure carried under HTTP 200', () => {
    const failure = classify(200, { code: 3001, message: 'no such code', requestId: 'r1', data: null })
    expect(failure?.code).toBe(STOCK_NOT_FOUND)
    expect(failure?.message).toBe('hithink: no such code (request_id r1)')
  })

  it('reports an unmapped business code as an upstream failure', () => {
    expect(classify(200, { code: 9999, message: 'who knows', data: null })?.code).toBe(STOCK_UPSTREAM)
  })

  it('reports a success envelope under a non-200 status as an upstream failure', () => {
    expect(classify(503, { code: 0, message: 'success', data: null })?.code).toBe(STOCK_UPSTREAM)
  })

  it('uses a fallback detail when the vendor sends no message', () => {
    expect(classify(200, { code: 5001, message: '', data: null })?.message).toBe('hithink: request failed')
  })
})
