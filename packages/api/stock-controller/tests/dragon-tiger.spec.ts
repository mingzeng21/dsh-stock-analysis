/** The dashboard read aligns all boards and bounds nested vendor lists. */
import { Context } from '@deepseek-ai/cordis'
import type { StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import { describe, expect, it } from 'vitest'
import StockController from '../src/index.ts'
import { toDragonTigerBoard } from '../src/dragon-tiger.ts'

const ENDPOINT = 'a-share.special-data.dragon-tiger-list'
const SIGNAL = new AbortController().signal

function payload(type: string, date = '2026-10-12'): StockRow {
  return {
    board_type: type,
    trade_date: date,
    count: 2,
    stock_count: 2,
    stock_items: [
      { thscode: '600001.SH', name: '甲公司', change: 5.57, amount: 924_555_074.08, net_value: 120_000_000, org_net_value: 70_000_000, range_days: 1 },
      { thscode: '000002.SZ', name: '乙公司', net_value: -60_000_000, hot_money_net_value: -40_000_000, range_days: 3 },
    ],
    hot_money_items: [{ name: '活跃席位', rows: [
      { thscode: '600001.SH', name: '甲公司', hot_money_item_net_value: 30_000_000 },
      { thscode: '000002.SZ', name: '乙公司', hot_money_item_net_value: -10_000_000 },
    ] }],
  }
}

function result(type: string, date?: string): StockResult {
  return { endpointId: ENDPOINT, rows: [payload(type, date)], meta: { asOf: 1_781_000_000_000, truncated: false } }
}

describe('dragon-tiger projection', () => {
  it('keeps signed amounts and reports nested caps', () => {
    const { board, tradeDate } = toDragonTigerBoard(result('all'), 'all', { stocks: 1, seats: 1, seatStocks: 1 })
    expect(tradeDate).toBe('2026-10-12')
    expect(board.stockCount).toBe(2)
    expect(board.stocks).toEqual([{ thscode: '600001.SH', name: '甲公司', netValue: 120_000_000, changePct: 5.57, amount: 924_555_074.08, orgNetValue: 70_000_000, rangeDays: 1 }])
    expect(board.truncated).toBe(true)
    expect(board.seats[0]).toMatchObject({ name: '活跃席位', truncated: true, stocks: [{ thscode: '600001.SH', netValue: 30_000_000 }] })
    expect(toDragonTigerBoard(result('all'), 'all', { stocks: 2, seats: 1, seatStocks: 1 }).board.truncated).toBe(true)
  })

  it('rejects a mismatched board and a malformed nested list', () => {
    const limits = { stocks: 5, seats: 5, seatStocks: 5 }
    expect(() => toDragonTigerBoard(result('org'), 'all', limits)).toThrow(/mismatched board/)
    const malformed: StockResult = { endpointId: ENDPOINT, rows: [{ ...payload('all'), stock_items: null }], meta: { truncated: false } }
    expect(() => toDragonTigerBoard(malformed, 'all', limits)).toThrow(/stock_items/)
  })
})

describe('stockController.dragonTiger', () => {
  function controller(hotDate = '2026-10-12') {
    const calls: Array<Readonly<Record<string, unknown>>> = []
    const ctx = new Context()
    ctx.provide('stock', {
      call: async (_endpoint: string, params: Readonly<Record<string, unknown>>) => {
        calls.push(params)
        const type = params['board_type']
        return result(String(type), type === 'hot_money' ? hotDate : '2026-10-12')
      },
    } as never)
    return {
      calls,
      service: new StockController(ctx, {
        maxQuotes: 50, maxDocuments: 30, maxSummaryChars: 400, maxSymbolMatches: 20,
        maxDragonTigerStocks: 200, maxDragonTigerSeats: 60, maxDragonTigerSeatStocks: 30,
      }),
    }
  }

  it('queries the latest all board before requesting two boards for that date', async () => {
    const { service, calls } = controller()
    const dashboard = await service.dragonTiger(SIGNAL)
    expect(dashboard.tradeDate).toBe('2026-10-12')
    expect(dashboard.boards.map(board => board.type)).toEqual(['all', 'org', 'hot_money'])
    expect(calls).toEqual([
      { board_type: 'all' },
      { board_type: 'org', date: '2026-10-12' },
      { board_type: 'hot_money', date: '2026-10-12' },
    ])
  })

  it('refuses to combine boards from different trade dates', async () => {
    const { service } = controller('2026-10-09')
    await expect(service.dragonTiger(SIGNAL)).rejects.toMatchObject({ code: 'stock/upstream' })
  })
})
