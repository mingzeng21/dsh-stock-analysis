/** Current attention lists and daily rank history keep their distinct units. */
import { Context } from '@deepseek-ai/cordis'
import type { StockResult } from '@deepseek-ai/dsh-stock'
import { describe, expect, it } from 'vitest'
import StockController from '../src/index.ts'
import { toHotRankBoard, toHotRankHistory } from '../src/hot-rank.ts'

const SIGNAL = new AbortController().signal
const HOT = 'a-share.special-data.hot-stock-list'
const TREND = 'a-share.special-data.hot-stock-rank-trend'
const stock = { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 1, heat: '1941909', rank_change: 7, rank_trend: 'up' }

function result(endpointId: string, rows: StockResult['rows']): StockResult {
  return { endpointId, rows, meta: { asOf: 1_781_000_000_000, truncated: false } }
}

describe('hot-rank projection', () => {
  it('preserves heat strings and absent rank changes', () => {
    expect(toHotRankBoard(result(HOT, [stock, { ...stock, rank: 2, rank_change: null }]), 'hot', 'day')).toEqual({
      kind: 'hot', period: 'day', asOf: 1_781_000_000_000,
      stocks: [
        { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 1, heat: '1941909', rankChange: 7, rankTrend: 'up' },
        { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 2, heat: '1941909', rankTrend: 'up' },
      ],
    })
    expect(() => toHotRankBoard(result(HOT, [{ ...stock, heat: null }]), 'hot', 'day')).toThrow(/heat/)
  })

  it('keeps ranks beyond Top 30 and rejects another stock', () => {
    expect(toHotRankHistory(result(TREND, [
      { thscode: '600001.SH', date: '2026-10-13', rank: 12 },
      { thscode: '600001.SH', date: '2026-10-12', rank: 1740 },
    ]), '600001.SH').points).toEqual([
      { date: '2026-10-12', rank: 1740 }, { date: '2026-10-13', rank: 12 },
    ])
    expect(() => toHotRankHistory(result(TREND, [{ thscode: '000002.SZ', date: '2026-10-12', rank: 1 }]), '600001.SH')).toThrow(/another stock/)
  })
})

it('reads four distinct lists without merging their observations', async () => {
  const calls: Array<{ endpoint: string; period: unknown }> = []
  const ctx = new Context()
  ctx.provide('stock', { call: async (endpoint: string, params: { period: unknown }) => {
    calls.push({ endpoint, period: params.period })
    return result(endpoint, [stock])
  } } as never)
  const service = new StockController(ctx, {
    maxQuotes: 50, maxDocuments: 30, maxSummaryChars: 400, maxSymbolMatches: 20,
    maxDragonTigerStocks: 200, maxDragonTigerSeats: 60, maxDragonTigerSeatStocks: 30,
  })
  const dashboard = await service.hotRank(SIGNAL)
  expect(dashboard.boards.map(board => [board.kind, board.period])).toEqual([
    ['hot', 'day'], ['hot', 'hour'], ['surge', 'day'], ['surge', 'hour'],
  ])
  expect(calls).toEqual([
    { endpoint: HOT, period: 'day' }, { endpoint: HOT, period: 'hour' },
    { endpoint: 'a-share.special-data.skyrocket-list', period: 'day' },
    { endpoint: 'a-share.special-data.skyrocket-list', period: 'hour' },
  ])
})

it('requests the selected stock over a 30-day calendar window', async () => {
  const calls: Array<{ endpoint: string; params: Readonly<Record<string, unknown>> }> = []
  const ctx = new Context()
  ctx.provide('stock', { call: async (endpoint: string, params: Readonly<Record<string, unknown>>) => {
    calls.push({ endpoint, params })
    return result(endpoint, [{ thscode: '600001.SH', date: '2026-10-12', rank: 1740 }])
  } } as never)
  const service = new StockController(ctx, {
    maxQuotes: 50, maxDocuments: 30, maxSummaryChars: 400, maxSymbolMatches: 20,
    maxDragonTigerStocks: 200, maxDragonTigerSeats: 60, maxDragonTigerSeatStocks: 30,
  })
  const history = await service.hotRankHistory('600001.SH', SIGNAL)
  expect(history.points).toEqual([{ date: '2026-10-12', rank: 1740 }])
  expect(calls[0]?.endpoint).toBe(TREND)
  const params = calls[0]?.params
  expect(params?.['thscode']).toBe('600001.SH')
  const start = String(params?.['start_date'])
  const end = String(params?.['end_date'])
  expect((Date.parse(end) - Date.parse(start)) / 86_400_000).toBe(29)
})
