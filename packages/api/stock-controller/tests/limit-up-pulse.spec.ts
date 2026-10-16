import { Context } from '@deepseek-ai/cordis'
import type { StockResult } from '@deepseek-ai/dsh-stock'
import { describe, expect, it } from 'vitest'
import StockController from '../src/index.ts'

const LADDER = 'a-share.special-data.limit-up-ladder'
const POOL = 'a-share.special-data.limit-up-pool'
const SIGNAL = new AbortController().signal

function result(endpointId: string, rows: StockResult['rows'], next?: StockResult['meta']['next']): StockResult {
  return { endpointId, rows, meta: { truncated: false, ...next === undefined ? {} : { next } } }
}

function controller(answer: (endpoint: string, params: Readonly<Record<string, unknown>>) => StockResult, pages = 5) {
  const ctx = new Context()
  const calls: Array<{ endpoint: string; params: Readonly<Record<string, unknown>> }> = []
  ctx.provide('stock', {
    call: async (endpoint: string, params: Readonly<Record<string, unknown>>) => {
      calls.push({ endpoint, params })
      return answer(endpoint, params)
    },
  } as never)
  return {
    calls,
    service: new StockController(ctx, {
      maxQuotes: 50, maxDocuments: 30, maxSummaryChars: 400, maxSymbolMatches: 20,
      maxDragonTigerStocks: 200, maxDragonTigerSeats: 60, maxDragonTigerSeatStocks: 30,
      maxLimitUpPagesPerDay: pages,
    }),
  }
}

const BOARDS = {
  two_board: [{ thscode: '600001.SH', name: '甲公司' }],
  three_board: [], four_board: [], five_board: [], six_board: [], seven_over: [],
}

describe('stockController.limitUpPulse', () => {
  it('uses ladder dates for Asia/Shanghai pool reads and preserves missing amounts', async () => {
    const h = controller(endpoint => endpoint === LADDER
      ? result(LADDER, [{ date: '2026-10-15', boards: BOARDS }, { date: '2026-10-14', boards: BOARDS }])
      : result(POOL, [{ thscode: '600001.SH', name: '甲公司', continue_day_cnt: 2,
        seal_money: 350_000_000, limit_up_reason: '存储芯片' },
      { thscode: '600002.SH', name: '乙公司', continue_day_cnt: 1 }]))
    const dashboard = await h.service.limitUpPulse(SIGNAL)
    expect(dashboard.days.map(day => day.date)).toEqual(['2026-10-14', '2026-10-15'])
    expect(h.calls.filter(call => call.endpoint === POOL).map(call => call.params['date_ms']))
      .toEqual([Date.parse('2026-10-14T00:00:00+08:00'), Date.parse('2026-10-15T00:00:00+08:00')])
    expect(dashboard.days[0]?.levels[0]?.stocks).toEqual([{ thscode: '600001.SH', name: '甲公司' }])
    expect(dashboard.days[0]?.stocks[1]).toEqual({ thscode: '600002.SH', name: '乙公司', boards: 1 })
    expect(dashboard.days[0]?.poolTruncated).toBe(false)
  })

  it('marks a date incomplete when its next page exceeds the configured bound', async () => {
    const h = controller(endpoint => endpoint === LADDER
      ? result(LADDER, [{ date: '2026-10-15', boards: BOARDS }])
      : result(POOL, [{ thscode: '600001.SH', name: '甲公司', continue_day_cnt: 2 }], { page: 2, size: 200 }), 1)
    const dashboard = await h.service.limitUpPulse(SIGNAL)
    expect(dashboard.days[0]?.poolTruncated).toBe(true)
    expect(h.calls).toHaveLength(2)
  })

  it('rejects a ladder row without its finite-coverage tiers', async () => {
    const h = controller(() => result(LADDER, [{ date: '2026-10-15', boards: { two_board: [] } }]))
    await expect(h.service.limitUpPulse(SIGNAL)).rejects.toMatchObject({ code: 'stock/malformed-row' })
    expect(h.calls).toHaveLength(1)
  })
})
