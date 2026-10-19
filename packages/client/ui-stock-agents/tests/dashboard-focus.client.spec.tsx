// @vitest-environment jsdom
/** Answer-linked stocks select their records in both native dashboards. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DragonTigerDashboard as DragonData, HotRankDashboard as HotData } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '../src/client/index.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { DragonTigerDashboard } from '../src/client/DragonTigerDashboard.tsx'
import dragonCss from '../src/client/DragonTigerDashboard.module.css'
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

it('renders an unchanged dragon-tiger stock without a rise or fall color', () => {
  const data: DragonData = { tradeDate: '2026-10-12', boards: [{
    type: 'all', stockCount: 1, recordCount: 1, truncated: false, seats: [],
    stocks: [{ thscode: '600001.SH', name: '甲公司', netValue: 0, changePct: 0 }],
  }] }
  render(<DragonTigerDashboard data={data} loading={false} error={false} onRetry={vi.fn()} t={makeTranslate(zh)} />)
  const row = screen.getByRole('button', { name: /甲公司/ })
  expect(row.querySelector(`.${dragonCss.stockChange}`)?.className).toContain(dragonCss.flat)
  expect(row.querySelector(`.${dragonCss.stockChange}`)?.textContent).toBe('0.00%')
  fireEvent.click(row)
  expect(document.querySelector(`.${dragonCss.detailTable} tbody tr td:last-child`)?.className).toBe(dragonCss.flat)
})

it('switches hot-rank view when an answer references a stock on another board', () => {
  const data: HotData = { boards: [
    { kind: 'hot', period: 'day', stocks: [] },
    { kind: 'surge', period: 'hour', stocks: [
      { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 2, heat: '1234', rankChange: 2, rankTrend: 'up' },
    ] },
  ] }
  const onScopeChange = vi.fn()
  render(<HotRankDashboard data={data} loading={false} error={false} onRetry={vi.fn()}
    loadHistory={vi.fn(async () => ({ thscode: '600001.SH', points: [] }))} focus={{ code: '600001.SH', sequence: 1 }}
    onScopeChange={onScopeChange} t={makeTranslate(zh) as TranslateNS<'stockAgents'>} />)
  expect(screen.getByRole('button', { name: '飙升 · 小时' }).getAttribute('aria-current')).toBe('page')
  expect(onScopeChange).toHaveBeenCalledWith({ kind: 'hot', board: 'surge', period: 'hour', stock: '600001.SH' })
  expect(screen.getByText('↑ 2').closest('td')?.className).toBe('')
})

it('keeps the last rank chart visible when its refresh fails', async () => {
  const board = { kind: 'hot' as const, period: 'day' as const, stocks: [
    { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 2, heat: '1234', rankTrend: 'flat' as const },
  ] }
  const history = { thscode: '600001.SH', points: [{ date: '2026-10-12', rank: 2 }] }
  const loadHistory = vi.fn().mockResolvedValueOnce(history).mockRejectedValueOnce(new Error('offline'))
  const props = { loading: false, error: false, onRetry: vi.fn(), loadHistory, t: makeTranslate(zh) as TranslateNS<'stockAgents'> }
  const { rerender } = render(<HotRankDashboard {...props} data={{ boards: [board] }} />)
  await waitFor(() => { expect(screen.getAllByText('2026-10-12').length).toBeGreaterThan(0) })

  rerender(<HotRankDashboard {...props} data={{ boards: [{ ...board }] }} />)
  await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('暂时无法加载排名走势') })
  expect(screen.getAllByText('2026-10-12').length).toBeGreaterThan(0)
  expect(screen.queryByText('该股票近 30 日没有排名记录')).toBeNull()
})
