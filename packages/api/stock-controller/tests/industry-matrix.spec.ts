/** Industry matrix Remote reads a bounded catalog, comparison series, and selected current quotes. */
import { Context } from '@deepseek-ai/cordis'
import type { StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import { describe, expect, it } from 'vitest'
import StockController from '../src/index.ts'

const signal = new AbortController().signal
const catalog = [{ thscode: '881101.TI', name: '半导体' }, { thscode: '881102.TI', name: '通信' }]

function result(endpointId: string, rows: StockRow[]): StockResult {
  return { endpointId, rows, meta: { truncated: false } }
}

function harness() {
  const calls: { endpoint: string; params: Readonly<Record<string, unknown>> }[] = []
  const ctx = new Context()
  ctx.provide('stock', { call: async (endpoint: string, params: Readonly<Record<string, unknown>>) => {
    calls.push({ endpoint, params })
    if (endpoint === 'a-share-index.catalog.ths-index-list') return result(endpoint, catalog)
    if (endpoint === 'a-share-index.prices.historical') {
      if (params.thscode === '881102.TI') throw Object.assign(new Error('no history'), { code: 'STOCK_NO_DATA' })
      return result(endpoint, [{ date_ms: 1_780_000_000_000, open_price: 100, high_price: 101,
        low_price: 99, close_price: 100, volume: 1_000, turnover: 100_000 }])
    }
    if (endpoint === 'a-share-index.constituents.ths-stock-list') return result(endpoint, [
      { thscode: '600001.SH', ticker: '600001', name: '甲公司' },
    ])
    if (endpoint === 'a-share.prices.snapshot') return result(endpoint, [{ thscode: '600001.SH',
      last_price: 11, price_change: 1, price_change_ratio_pct: 10, open_price: 10, high_price: 11,
      low_price: 10, prev_price: 10, volume: 100, turnover: 1_000 }])
    throw new Error(endpoint)
  } } as never)
  return { calls, controller: new StockController(ctx, {
    maxQuotes: 50, maxDocuments: 30, maxSummaryChars: 400, maxSymbolMatches: 20,
    maxDragonTigerStocks: 200, maxDragonTigerSeats: 60, maxDragonTigerSeatStocks: 30,
    maxLimitUpPagesPerDay: 5, maxIndustryMatrixIndices: 2, industryMatrixConcurrency: 2,
  }) }
}

describe('industry matrix reads', () => {
  it('keeps valid histories when one industry has no data and reports the gap', async () => {
    const h = harness()
    const matrix = await h.controller.industryMatrix(signal)
    expect(matrix.industries.map(item => item.sector.name)).toEqual(['半导体'])
    expect(matrix.unavailableCount).toBe(1)
    expect(matrix.benchmark.thscode).toBe('000300.SH')
    expect(h.calls.filter(call => call.endpoint === 'a-share-index.prices.historical')).toHaveLength(3)
  })

  it('returns current membership and quote coverage only for the selected industry', async () => {
    const h = harness()
    const detail = await h.controller.industryDetail({ thscode: '881101.TI', name: '半导体', kind: 'industry' }, signal)
    expect(detail.board.constituents).toHaveLength(1)
    expect(detail.quotes.quotes[0]?.changePct).toBe(10)
    expect(detail.quotedCount).toBe(1)
    await expect(h.controller.industryDetail({ thscode: '881101.TI', name: '半导体', kind: 'concept' }, signal))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
  })
})
