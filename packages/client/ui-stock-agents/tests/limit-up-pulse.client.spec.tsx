// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LimitUpPulseDashboard as PulseData } from '@deepseek-ai/dsh-api-stock-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { LimitUpPulseDashboard, pulseFacts } from '../src/client/LimitUpPulseDashboard.tsx'
import { zh } from '../src/client/locales.ts'

const data: PulseData = { days: [
  { date: '2026-10-14', poolTruncated: false, levels: [
    { boards: 2, stocks: [] }, { boards: 3, stocks: [] }, { boards: 4, stocks: [] },
    { boards: 5, stocks: [] }, { boards: 6, stocks: [] }, { boards: 7, stocks: [] },
  ], stocks: [{ thscode: '600001.SH', name: '甲公司', boards: 1, sealMoney: 100, maxSealMoney: 200, reason: '存储芯片' }] },
  { date: '2026-10-15', poolTruncated: true, levels: [
    { boards: 2, stocks: [{ thscode: '600002.SH', name: '乙公司' }] },
    { boards: 3, stocks: [] }, { boards: 4, stocks: [] }, { boards: 5, stocks: [] },
    { boards: 6, stocks: [] }, { boards: 7, stocks: [] },
  ], stocks: [
    { thscode: '600002.SH', name: '乙公司', boards: 2, sealMoney: 50, maxSealMoney: 100, reason: '机器人概念' },
    { thscode: '600003.SH', name: '丙公司', boards: 1, reason: '机器人概念' },
  ] },
] }

afterEach(cleanup)

it('calculates retention from disclosed pairs and marks incomplete pool totals', () => {
  const day = data.days[1]
  if (day === undefined) throw new Error('the fixture needs two dates')
  expect(pulseFacts(day)).toMatchObject({ count: 2, continuous: 1, retention: 50, seal: 50, sealIncomplete: true })
  render(<LimitUpPulseDashboard data={data} loading={false} error={false} onRetry={vi.fn()}
    onScopeChange={vi.fn()} focus={null} t={makeTranslate(zh)} />)
  expect(screen.getByText('≥2')).toBeTruthy()
  expect(screen.getByText(/该日涨停池未全部返回/)).toBeTruthy()
  expect(screen.getByText('机器人概念')).toBeTruthy()
})

it('changes the synchronized date and selected stock used by the inquiry', () => {
  const onScopeChange = vi.fn()
  render(<LimitUpPulseDashboard data={data} loading={false} error={false} onRetry={vi.fn()}
    onScopeChange={onScopeChange} focus={null} t={makeTranslate(zh)} />)
  fireEvent.change(screen.getByRole('combobox', { name: '交易日' }), { target: { value: '2026-10-14' } })
  expect(onScopeChange).toHaveBeenLastCalledWith({ kind: 'pulse', date: '2026-10-14' })
  fireEvent.click(screen.getByRole('button', { name: /甲公司/ }))
  expect(onScopeChange).toHaveBeenLastCalledWith({ kind: 'pulse', date: '2026-10-14', stock: '600001.SH' })
  fireEvent.click(screen.getByRole('button', { name: '30日分位' }))
  expect(screen.getByRole('button', { name: '30日分位' }).getAttribute('aria-pressed')).toBe('true')
})
