/**
 * The two gateway families carry rows under different members and size them
 * under different names, so this module is where that difference is absorbed
 * before the seam sees a result.
 */

import { describe, expect, it } from 'vitest'
import type { StockEndpoint, StockParams } from '@deepseek-ai/dsh-stock'
import { IWENCAI_ENDPOINTS_BY_ID } from '../src/catalog/generated.ts'
import { normalizeResult } from '../src/normalize.ts'
import type { IwencaiPayload } from '../src/envelope.ts'

/** One generated registry record, which the identity table is keyed by. */
function endpoint(id: string): StockEndpoint {
  const found = IWENCAI_ENDPOINTS_BY_ID.get(id)
  if (found === undefined) throw new Error(`fixture: no registry record for "${id}"`)
  return found
}

const SEARCH = endpoint('iwencai.search.announcement')
const QUERY = endpoint('iwencai.research.astock-selector')

/** A successful gateway payload around one body. */
function payload(body: Record<string, unknown>): IwencaiPayload {
  return { statusCode: 0, statusMessage: 'OK', body }
}

/** One full page of `size` rows under `member`. */
function page(member: string, size: number, extra: Record<string, unknown> = {}): IwencaiPayload {
  return payload({ [member]: Array.from({ length: size }, (_, i) => ({ i })), ...extra })
}

describe('normalizeResult row source', () => {
  it('reads a document search from data and its size from total', () => {
    const result = normalizeResult(SEARCH, { query: '茅台 分红', size: 10 }, payload({
      total: 42,
      data: [{ title: '公告', summary: '摘要', url: 'https://example.test/a.pdf' }, { title: '二' }],
    }))

    expect(result.endpointId).toBe(SEARCH.id)
    expect(result.rows).toEqual([
      { title: '公告', summary: '摘要', url: 'https://example.test/a.pdf' },
      { title: '二' },
    ])
    expect(result.meta).toEqual({ total: 42, truncated: false })
  })

  it('reads a natural-language query from datas and its size from row_count', () => {
    const result = normalizeResult(QUERY, { query: '今日涨幅居前的A股' }, payload({
      row_count: 7,
      datas: [{ '股票简称': '中际旭创', '涨停[20260915]': true }],
    }))

    expect(result.rows).toEqual([{ '股票简称': '中际旭创', '涨停[20260915]': true }])
    expect(result.meta).toEqual({ total: 7, truncated: false })
  })

  it('reports no rows when the row member is absent or not an array', () => {
    expect(normalizeResult(SEARCH, {}, payload({ total: 1 })).rows).toEqual([])
    expect(normalizeResult(SEARCH, {}, payload({ data: 'not-a-list' })).rows).toEqual([])
    expect(normalizeResult(QUERY, {}, payload({ row_count: 1 })).rows).toEqual([])
    expect(normalizeResult(QUERY, {}, payload({ datas: { a: 1 } })).rows).toEqual([])
  })

  it('drops row entries that are not objects', () => {
    expect(normalizeResult(SEARCH, {}, payload({ data: [1, 'two', null, [3], { kept: true }] })).rows)
      .toEqual([{ kept: true }])
    expect(normalizeResult(QUERY, {}, payload({ datas: [null, { kept: true }, 5] })).rows)
      .toEqual([{ kept: true }])
  })

  it('omits the total when the vendor did not report a finite number', () => {
    expect(normalizeResult(SEARCH, {}, payload({ data: [] })).meta.total).toBeUndefined()
    expect(normalizeResult(SEARCH, {}, payload({ data: [], total: '42' })).meta.total).toBeUndefined()
    expect(normalizeResult(SEARCH, {}, payload({ data: [], total: Number.POSITIVE_INFINITY })).meta.total).toBeUndefined()
    expect(normalizeResult(QUERY, {}, payload({ datas: [], row_count: null })).meta.total).toBeUndefined()
  })

  it('refuses to guess an identity for a capability outside the table', () => {
    const foreign: StockEndpoint = { ...SEARCH, id: 'iwencai.search.unregistered' }

    expect(() => normalizeResult(foreign, {}, payload({ data: [] })))
      .toThrow(/no gateway identity is registered for capability "iwencai\.search\.unregistered"/)
  })
})

describe('normalizeResult paging continuation', () => {
  it('advances the page and keeps the query for a full natural-language page', () => {
    const params: StockParams = { query: '今日涨幅居前的A股', page: 1, limit: 3 }

    expect(normalizeResult(QUERY, params, page('datas', 3)).meta.next)
      .toEqual({ query: '今日涨幅居前的A股', page: 2, limit: 3 })
  })

  it('reports no continuation for a partial page or a reached total', () => {
    const params: StockParams = { query: 'x', page: 1, limit: 3 }

    expect(normalizeResult(QUERY, params, page('datas', 2)).meta.next).toBeUndefined()
    expect(normalizeResult(QUERY, params, page('datas', 3, { row_count: 3 })).meta.next).toBeUndefined()
    expect(normalizeResult(QUERY, params, page('datas', 3, { row_count: 9 })).meta.next)
      .toEqual({ query: 'x', page: 2, limit: 3 })
  })

  it('never reports a continuation for a document search, which does not page', () => {
    expect(normalizeResult(SEARCH, { query: 'x', size: 2 }, page('data', 2)).meta.next).toBeUndefined()
  })
})
