// @vitest-environment jsdom
/** Answer-linked stocks select their records in both native dashboards. */
import { cleanup, render, screen } from '@testing-library/react'
import type { DragonTigerDashboard as DragonData, HotRankDashboard as HotData } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../src/client/index.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { DragonTigerDashboard } from '../src/client/DragonTigerDashboard.tsx'
import { HotRankDashboard } from '../src/client/HotRankDashboard.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

it('selects a dragon-tiger stock mentioned in an answer', () => {
  const data: DragonData = { tradeDate: '2026-10-12', boards: [{
    type: 'all', stockCount: 1, recordCount: 1, truncated: false, seats: [],
    stocks: [{ thscode: '600001.SH', name: '甲公司', netValue: 12_000_000 }],
  }] }
  const onScopeChange = vi.fn()
  render(<DragonTigerDashboard data={data} loading={false} error={false} onRetry={vi.fn()}
    focus={{ code: '600001.SH', sequence: 1 }} onScopeChange={onScopeChange} t={makeTranslate(zh)} />)
  expect(screen.getByRole('button', { name: /甲公司/ }).getAttribute('aria-pressed')).toBe('true')
  expect(onScopeChange).toHaveBeenCalledWith({ kind: 'dragon', board: 'all', stock: '600001.SH' })
})

it('switches hot-rank view when an answer references a stock on another board', () => {
  const data: HotData = { boards: [
    { kind: 'hot', period: 'day', stocks: [] },
    { kind: 'surge', period: 'hour', stocks: [
      { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 2, heat: '1234', rankTrend: 'up' },
    ] },
  ] }
  const onScopeChange = vi.fn()
  render(<HotRankDashboard data={data} loading={false} error={false} onRetry={vi.fn()}
    loadHistory={vi.fn(async () => ({ thscode: '600001.SH', points: [] }))} focus={{ code: '600001.SH', sequence: 1 }}
    onScopeChange={onScopeChange} t={makeTranslate(zh) as TranslateNS<'stockAgents'>} />)
  expect(screen.getByRole('button', { name: '飙升 · 小时' }).getAttribute('aria-current')).toBe('page')
  expect(onScopeChange).toHaveBeenCalledWith({ kind: 'hot', board: 'surge', period: 'hour', stock: '600001.SH' })
})
