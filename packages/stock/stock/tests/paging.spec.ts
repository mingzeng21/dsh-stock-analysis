import { describe, expect, it } from 'vitest'
import { nextPage } from '../src/paging.ts'
import type { StockEndpoint, StockParam, StockPaging } from '../src/registry.ts'

/** One registry record with the declared parameters under test. */
function endpoint(paging: StockPaging, params: readonly StockParam[] = []): StockEndpoint {
  return {
    id: 'test.endpoint',
    universe: 'a-share',
    tool: 'test_tool',
    method: 'GET',
    path: '/api/test',
    title: 'test',
    summary: 'test',
    params,
    availability: 'open',
    paging,
    window: 'none',
    dateEncoding: 'none',
    source: 'manual',
  }
}

/** One optional integer parameter. */
function param(name: string): StockParam {
  return { name, type: 'integer', required: false, description: name }
}

const PAGE_SIZE = [param('page'), param('size')]
const PAGE_LIMIT = [param('page'), param('limit')]
const OFFSET_LIMIT = [param('offset'), param('limit')]

describe('nextPage', () => {
  it('reports nothing for an endpoint that does not page', () => {
    expect(nextPage(endpoint('none', PAGE_SIZE), { page: 1, size: 5 }, 5, undefined)).toBeUndefined()
    expect(nextPage(endpoint('cursor', PAGE_SIZE), { page: 1, size: 5 }, 5, undefined)).toBeUndefined()
  })

  it('advances a page number by one', () => {
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 2, size: 5 }, 5, undefined)).toEqual({ page: 3, size: 5 })
  })

  it('advances an offset by the rows returned', () => {
    expect(nextPage(endpoint('offset', OFFSET_LIMIT), { offset: 10, limit: 5 }, 5, undefined))
      .toEqual({ offset: 15, limit: 5 })
  })

  it('uses the size parameter the endpoint declares, whatever the vendor calls it', () => {
    // `page` + `limit` is the 问财 gateway's pair; `page` + `size` is 同花顺's.
    // The paging model decides the arithmetic, the declared names supply the keys.
    expect(nextPage(endpoint('page', PAGE_LIMIT), { page: 1, limit: 3 }, 3, undefined))
      .toEqual({ page: 2, limit: 3 })
    expect(nextPage(endpoint('offset', [param('offset'), param('size')]), { offset: 9, size: 3 }, 3, undefined))
      .toEqual({ offset: 12, size: 3 })
  })

  it('falls back to the conventional pair when the record declares no paging parameters', () => {
    expect(nextPage(endpoint('page'), { page: 1, size: 2 }, 2, undefined)).toEqual({ page: 2, size: 2 })
    expect(nextPage(endpoint('offset'), { offset: 0, limit: 2 }, 2, undefined)).toEqual({ offset: 2, limit: 2 })
  })

  it('keeps every other request parameter in the continuation', () => {
    expect(nextPage(endpoint('page', PAGE_LIMIT), { query: '今日涨停', page: 1, limit: 2 }, 2, undefined))
      .toEqual({ query: '今日涨停', page: 2, limit: 2 })
  })

  it('reports nothing for a partial page, which is necessarily the last one', () => {
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 1, size: 50 }, 24, undefined)).toBeUndefined()
    expect(nextPage(endpoint('offset', OFFSET_LIMIT), { offset: 0, limit: 100 }, 1, undefined)).toBeUndefined()
  })

  it('lets a reported total stop the continuation on a full last page', () => {
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 1, size: 10 }, 10, 10)).toBeUndefined()
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 2, size: 10 }, 10, 25)).toEqual({ page: 3, size: 10 })
  })

  it('reports nothing when the page size is absent, zero, or not an integer', () => {
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 1 }, 1, undefined)).toBeUndefined()
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 1, size: 0 }, 0, undefined)).toBeUndefined()
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: 1, size: 1.5 }, 2, undefined)).toBeUndefined()
  })

  it('assumes the first page when the position is absent', () => {
    expect(nextPage(endpoint('page', PAGE_SIZE), { size: 2 }, 2, undefined)).toEqual({ size: 2, page: 2 })
    expect(nextPage(endpoint('offset', OFFSET_LIMIT), { limit: 2 }, 2, undefined)).toEqual({ limit: 2, offset: 2 })
  })

  it('ignores a non-integer position', () => {
    expect(nextPage(endpoint('page', PAGE_SIZE), { page: '1', size: 2 }, 2, undefined)).toEqual({ page: 2, size: 2 })
  })
})
