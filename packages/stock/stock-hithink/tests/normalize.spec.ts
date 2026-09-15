import { describe, expect, it } from 'vitest'
import type { StockEndpoint, StockParams } from '@deepseek-ai/dsh-stock'
import { normalizeResult } from '../src/normalize.ts'

/** Wrap a business payload in the vendor's success envelope. */
function envelope(data: unknown): { code: number; message: string; data: unknown } {
  return { code: 0, message: 'success', data }
}

/** One minimal registry record carrying the paging model under test. */
function endpoint(paging: StockEndpoint['paging']): StockEndpoint {
  return {
    id: 'test.endpoint',
    universe: 'a-share',
    tool: 'test_tool',
    method: 'GET',
    path: '/api/test',
    title: 'test',
    summary: 'test',
    params: [],
    availability: 'open',
    paging,
    window: 'none',
    dateEncoding: 'none',
    source: 'manual',
  }
}

/** Rows for a full or partial page of `size`. */
function rows(count: number): { item: Record<string, unknown>[] } {
  return { item: Array.from({ length: count }, (_, index) => ({ i: index })) }
}

describe('normalizeResult rows', () => {
  it('reads rows from data.item and keeps the vendor field names', () => {
    const result = normalizeResult(endpoint('none'), {}, envelope({
      timestamp: 1_784_275_991_000,
      total: 2,
      item: [{ thscode: '600519.SH', last_price: 1277.8 }, { thscode: '000001.SZ', last_price: 11.2 }],
    }))
    expect(result.endpointId).toBe('test.endpoint')
    expect(result.rows).toEqual([
      { thscode: '600519.SH', last_price: 1277.8 },
      { thscode: '000001.SZ', last_price: 11.2 },
    ])
    expect(result.meta).toEqual({ asOf: 1_784_275_991_000, total: 2, truncated: false })
  })

  it('reads a bare array payload as the row list', () => {
    expect(normalizeResult(endpoint('none'), {}, envelope([{ a: 1 }])).rows).toEqual([{ a: 1 }])
  })

  it('treats a record without an item member as one row', () => {
    expect(normalizeResult(endpoint('none'), {}, envelope({ url: 'https://example.test/dump.parquet' })).rows)
      .toEqual([{ url: 'https://example.test/dump.parquet' }])
  })

  it('reports no rows for a null, absent, or scalar payload', () => {
    expect(normalizeResult(endpoint('none'), {}, envelope(null)).rows).toEqual([])
    expect(normalizeResult(endpoint('none'), {}, envelope(undefined)).rows).toEqual([])
    expect(normalizeResult(endpoint('none'), {}, envelope(42)).rows).toEqual([])
    expect(normalizeResult(endpoint('none'), {}, envelope('nope')).rows).toEqual([])
  })

  it('drops list entries that are not objects', () => {
    expect(normalizeResult(endpoint('none'), {}, envelope({ item: [1, 'two', null, [3], { kept: true }] })).rows)
      .toEqual([{ kept: true }])
  })

  it('reports no rows when item is present but not an array', () => {
    expect(normalizeResult(endpoint('none'), {}, envelope({ item: 'not-a-list' })).rows).toEqual([])
  })

  it('omits batch facts the vendor did not report as numbers', () => {
    const result = normalizeResult(endpoint('none'), {}, envelope({ item: [], timestamp: 'yesterday', total: '2' }))
    expect(result.meta).toEqual({ truncated: false })
  })

  it('omits batch facts when the payload is not a record', () => {
    expect(normalizeResult(endpoint('none'), {}, envelope([{ a: 1 }])).meta).toEqual({ truncated: false })
  })
})

describe('normalizeResult paging continuation', () => {
  it('advances the page number when a page endpoint returns a full page', () => {
    const result = normalizeResult(endpoint('page'), { page: 2, size: 3 }, envelope(rows(3)))
    expect(result.meta.next).toEqual({ page: 3, size: 3 })
  })

  it('advances the offset by the rows returned when an offset endpoint returns a full page', () => {
    const result = normalizeResult(endpoint('offset'), { offset: 20, limit: 4 }, envelope(rows(4)))
    expect(result.meta.next).toEqual({ offset: 24, limit: 4 })
  })

  it('keeps the request parameters in the continuation', () => {
    const params: StockParams = { page: 1, size: 2, sort_field: 'continue_day_cnt', sort_dir: 'desc' }
    expect(normalizeResult(endpoint('page'), params, envelope(rows(2))).meta.next)
      .toEqual({ page: 2, size: 2, sort_field: 'continue_day_cnt', sort_dir: 'desc' })
  })

  it('reports no continuation for a partial page, which is necessarily the last', () => {
    expect(normalizeResult(endpoint('page'), { page: 1, size: 50 }, envelope(rows(24))).meta.next).toBeUndefined()
    expect(normalizeResult(endpoint('offset'), { offset: 0, limit: 100 }, envelope(rows(1))).meta.next).toBeUndefined()
  })

  it('uses the reported total to stop at the last page even when the page is full', () => {
    const full = { item: Array.from({ length: 10 }, (_, i) => ({ i })), total: 10 }
    expect(normalizeResult(endpoint('offset'), { offset: 0, limit: 10 }, envelope(full)).meta.next).toBeUndefined()
    const more = { item: Array.from({ length: 10 }, (_, i) => ({ i })), total: 25 }
    expect(normalizeResult(endpoint('offset'), { offset: 0, limit: 10 }, envelope(more)).meta.next)
      .toEqual({ offset: 10, limit: 10 })
  })

  it('reports no continuation for an endpoint that does not page', () => {
    expect(normalizeResult(endpoint('none'), { page: 1, size: 1 }, envelope(rows(1))).meta.next).toBeUndefined()
  })

  it('reports no continuation when the page size is absent, zero, or not an integer', () => {
    expect(normalizeResult(endpoint('page'), { page: 1 }, envelope(rows(1))).meta.next).toBeUndefined()
    expect(normalizeResult(endpoint('page'), { page: 1, size: 0 }, envelope(rows(0))).meta.next).toBeUndefined()
    expect(normalizeResult(endpoint('page'), { page: 1, size: 1.5 }, envelope(rows(2))).meta.next).toBeUndefined()
  })

  it('falls back to the model default page position when the request omitted it', () => {
    expect(normalizeResult(endpoint('page'), { size: 2 }, envelope(rows(2))).meta.next).toEqual({ size: 2, page: 2 })
    expect(normalizeResult(endpoint('offset'), { limit: 2 }, envelope(rows(2))).meta.next).toEqual({ limit: 2, offset: 2 })
  })
})
