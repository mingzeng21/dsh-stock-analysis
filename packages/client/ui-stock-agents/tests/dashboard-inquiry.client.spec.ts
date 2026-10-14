/** Dashboard questions carry the visible selection and bounded returned data into the Session log. */
import { expect, it } from 'vitest'
import type { DragonTigerDashboard, HotRankDashboard } from '@deepseek-ai/dsh-api-stock-controller/client'
import { dashboardInquiryPrompt } from '../src/client/dashboard-inquiry.ts'

it('includes the selected dragon-tiger stock and observation date', () => {
  const data: DragonTigerDashboard = {
    tradeDate: '2026-10-12', boards: [{ type: 'all', stockCount: 1, recordCount: 1, truncated: false,
      stocks: [{ thscode: '600001.SH', name: '甲公司', netValue: 12_000_000 }], seats: [] }],
  }
  const prompt = dashboardInquiryPrompt({ kind: 'dragon', data, scope: { kind: 'dragon', board: 'all', stock: '600001.SH' } }, '资金如何？')
  expect(prompt).toContain('用户问题：资金如何？')
  expect(prompt).toContain('2026-10-12')
  expect(prompt).toContain('"stock":"600001.SH"')
  expect(prompt).toContain('"netValue":12000000')
})

it('includes hot-rank history only for the selected stock', () => {
  const data: HotRankDashboard = { boards: [{ kind: 'hot', period: 'day', stocks: [
    { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 1, heat: '1234', rankTrend: 'up' },
  ] }] }
  const scope = { kind: 'hot' as const, board: 'hot' as const, period: 'day' as const, stock: '600001.SH' }
  const matched = dashboardInquiryPrompt({ kind: 'hot', data, scope,
    history: { thscode: '600001.SH', points: [{ date: '2026-10-12', rank: 7 }] } }, '变化？')
  const other = dashboardInquiryPrompt({ kind: 'hot', data, scope,
    history: { thscode: '000002.SZ', points: [{ date: '2026-10-12', rank: 7 }] } }, '变化？')
  expect(matched).toContain('"history":{"thscode":"600001.SH"')
  expect(other).toContain('"history":null')
})

it('keeps large snapshots parseable and identifies truncation', () => {
  const data: DragonTigerDashboard = { tradeDate: '2026-10-12', boards: [{
    type: 'all', stockCount: 1, recordCount: 1, truncated: false, seats: [],
    stocks: [{ thscode: '600001.SH', name: '甲公司'.repeat(6_000), netValue: 12_000_000 }],
  }] }
  const prompt = dashboardInquiryPrompt({ kind: 'dragon', data, scope: { kind: 'dragon', board: 'all' } }, '资金？')
  const json = prompt.split('看板快照（JSON；truncated 为 true 时只含前段记录，不能推断未展示记录）：\n\n')[1]
  expect(JSON.parse(json ?? '')).toMatchObject({ dashboard: 'dragon-tiger', truncated: true })
})
