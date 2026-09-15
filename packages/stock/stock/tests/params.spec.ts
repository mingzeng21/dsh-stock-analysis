/**
 * `resolveParams` is the seam's only argument-validation step, and the vendor
 * rejects unknown and malformed query parameters with business codes a model
 * cannot act on. These cases pin every accepted and rejected form.
 */

import { describe, expect, it } from 'vitest'
import { STOCK_INVALID_PARAMS, resolveParams, type StockEndpoint, type StockParam } from '@deepseek-ai/dsh-stock'
import { codeOf, makeEndpoint } from './support.ts'

/** An endpoint whose parameters are exactly the ones under test. */
function endpointWith(params: readonly StockParam[]): StockEndpoint {
  return makeEndpoint({ id: 'test.endpoint', params })
}

const optional = (name: string, type: StockParam['type'], extra: Partial<StockParam> = {}): StockParam =>
  ({ name, type, required: false, description: '', ...extra })

const required = (name: string, type: StockParam['type']): StockParam =>
  ({ name, type, required: true, description: '' })

describe('resolveParams — argument rejection', () => {
  it('rejects an unknown parameter rather than forwarding it', async () => {
    const endpoint = endpointWith([optional('limit', 'integer')])
    expect(await codeOf(() => resolveParams(endpoint, { nope: 1 }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('rejects a value that is not a string, number, or boolean', async () => {
    const endpoint = endpointWith([optional('indexes', 'object')])
    expect(await codeOf(() => resolveParams(endpoint, { indexes: { a: 1 } }))).toBe(STOCK_INVALID_PARAMS)
    expect(await codeOf(() => resolveParams(endpoint, { indexes: ['a'] }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('treats null and undefined as not provided', () => {
    const endpoint = endpointWith([optional('limit', 'integer'), optional('page', 'integer', { default: 0 })])
    expect(resolveParams(endpoint, { limit: null, page: undefined })).toEqual({ page: 0 })
  })

  it('rejects a value whose type does not match the declaration', async () => {
    expect(await codeOf(() => resolveParams(endpointWith([optional('q', 'string')]), { q: 5 }))).toBe(STOCK_INVALID_PARAMS)
    expect(await codeOf(() => resolveParams(endpointWith([optional('buy', 'boolean')]), { buy: 1 }))).toBe(STOCK_INVALID_PARAMS)
    expect(await codeOf(() => resolveParams(endpointWith([optional('limit', 'integer')]), { limit: true }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('rejects a non-integer for an integer parameter, including a decimal string', async () => {
    const endpoint = endpointWith([optional('limit', 'integer')])
    expect(await codeOf(() => resolveParams(endpoint, { limit: 1.5 }))).toBe(STOCK_INVALID_PARAMS)
    expect(await codeOf(() => resolveParams(endpoint, { limit: '1.5' }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('rejects a non-finite number for a number parameter', async () => {
    const endpoint = endpointWith([optional('amount', 'number')])
    expect(await codeOf(() => resolveParams(endpoint, { amount: Number.POSITIVE_INFINITY }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('rejects a required parameter that was not provided', async () => {
    expect(await codeOf(() => resolveParams(endpointWith([required('thscode', 'string')]), {}))).toBe(STOCK_INVALID_PARAMS)
  })

  it('rejects an enumeration value outside the declared set', async () => {
    const endpoint = endpointWith([optional('adjust', 'string', { enum: ['none', 'forward', 'backward'] })])
    expect(await codeOf(() => resolveParams(endpoint, { adjust: 'split' }))).toBe(STOCK_INVALID_PARAMS)
  })
})

describe('resolveParams — coercion', () => {
  it('coerces a numeric string for an integer parameter', () => {
    expect(resolveParams(endpointWith([optional('limit', 'integer')]), { limit: '250' })).toEqual({ limit: 250 })
  })

  it('coerces a numeric string for a number parameter', () => {
    expect(resolveParams(endpointWith([optional('amount', 'number')]), { amount: '12.5' })).toEqual({ amount: 12.5 })
  })

  it('leaves an empty or non-numeric string unconverted, so the type check rejects it', async () => {
    const endpoint = endpointWith([optional('limit', 'integer')])
    expect(await codeOf(() => resolveParams(endpoint, { limit: '' }))).toBe(STOCK_INVALID_PARAMS)
    expect(await codeOf(() => resolveParams(endpoint, { limit: 'many' }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('coerces the two boolean strings and leaves every other string alone', async () => {
    const endpoint = endpointWith([optional('buy', 'boolean')])
    expect(resolveParams(endpoint, { buy: 'true' })).toEqual({ buy: true })
    expect(resolveParams(endpoint, { buy: 'false' })).toEqual({ buy: false })
    expect(await codeOf(() => resolveParams(endpoint, { buy: 'yes' }))).toBe(STOCK_INVALID_PARAMS)
  })

  it('passes a non-string value through coercion unchanged', () => {
    expect(resolveParams(endpointWith([optional('buy', 'boolean')]), { buy: true })).toEqual({ buy: true })
  })

  it('accepts a JSON string for the object and array parameters', () => {
    const endpoint = endpointWith([optional('indexes', 'object'), optional('tags', 'array')])
    expect(resolveParams(endpoint, { indexes: '{"a":1}', tags: '["LIMIT_UP"]' }))
      .toEqual({ indexes: '{"a":1}', tags: '["LIMIT_UP"]' })
  })

  it('rejects a non-string for the object parameter', async () => {
    const endpoint = endpointWith([optional('indexes', 'object')])
    expect(await codeOf(() => resolveParams(endpoint, { indexes: 5 }))).toBe(STOCK_INVALID_PARAMS)
  })
})

describe('resolveParams — enumeration and defaults', () => {
  it('accepts a declared enumeration value', () => {
    const endpoint = endpointWith([optional('adjust', 'string', { enum: ['none', 'forward'] })])
    expect(resolveParams(endpoint, { adjust: 'forward' })).toEqual({ adjust: 'forward' })
  })

  it('skips the enumeration check for a non-string value', () => {
    // The vendor declares string enums, but a numeric parameter carrying one
    // must not be compared against string members.
    const endpoint = endpointWith([optional('score', 'number', { enum: ['a', 'b'] })])
    expect(resolveParams(endpoint, { score: 1 })).toEqual({ score: 1 })
  })

  it('applies a declared default and lets an explicit value win', () => {
    const endpoint = endpointWith([optional('page', 'integer', { default: 0 })])
    expect(resolveParams(endpoint, {})).toEqual({ page: 0 })
    expect(resolveParams(endpoint, { page: 3 })).toEqual({ page: 3 })
  })

  it('applies a default for a required parameter instead of failing', () => {
    const endpoint = endpointWith([{ name: 'period', type: 'string', required: true, description: '', default: '1' }])
    expect(resolveParams(endpoint, {})).toEqual({ period: '1' })
  })

  it('leaves an optional parameter without a default absent', () => {
    expect(resolveParams(endpointWith([optional('q', 'string')]), {})).toEqual({})
  })

  it('accepts a provided required parameter', () => {
    expect(resolveParams(endpointWith([required('thscode', 'string')]), { thscode: '600519.SH' }))
      .toEqual({ thscode: '600519.SH' })
  })
})
