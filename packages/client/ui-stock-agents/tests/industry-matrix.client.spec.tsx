// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CandleSeries, IndustryDetail, IndustryMatrix, SectorMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { IndustryMatrixDashboard } from '../src/client/IndustryMatrixDashboard.tsx'
import css from '../src/client/IndustryMatrixDashboard.module.css'
import { zh } from '../src/client/locales.ts'

function series(code: string, closes: readonly number[]): CandleSeries {
  return { thscode: code, interval: '1d', truncated: false, candles: closes.map((close, index) => ({
    time: index * 86_400_000, open: close, high: close, low: close, close, volume: 100, turnover: 100 + index,
  })) }
}

const alpha: SectorMatch = { thscode: 'A.TI', name: '甲行业', kind: 'industry' }
const beta: SectorMatch = { thscode: 'B.TI', name: '乙行业', kind: 'industry' }
const benchmark = Array.from({ length: 70 }, () => 100)
const data: IndustryMatrix = {
  benchmark: series('000300.SH', benchmark), catalogTruncated: false, industriesTruncated: false,
  unavailableCount: 0, industries: [
    { sector: alpha, history: series(alpha.thscode, benchmark.map((_, index) => 100 + index * index / 100)) },
    { sector: beta, history: series(beta.thscode, benchmark) },
  ],
}

afterEach(cleanup)

it('exposes industry bubbles to keyboard selection and heat values to assistive technology', () => {
  const onSelect = vi.fn()
  render(<IndustryMatrixDashboard data={data} detail={null} selected={alpha.thscode} window={20}
    loading={false} detailLoading={false} error={false} detailError={false}
    onSelect={onSelect} onStock={vi.fn()} onWindowChange={vi.fn()} onRetry={vi.fn()} t={makeTranslate(zh)} />)
  const bubble = screen.getByRole('button', { name: /乙行业 · 超额/ })
  expect(bubble.getAttribute('tabindex')).toBe('0')
  fireEvent.keyDown(bubble, { key: 'Enter' })
  expect(onSelect).toHaveBeenLastCalledWith(beta)
  fireEvent.keyDown(bubble, { key: ' ' })
  expect(onSelect).toHaveBeenLastCalledWith(beta)
  const heat = screen.getByRole('button', { name: /甲行业 · 横截面强度.*从早到晚的标准分/ })
  expect(heat.getAttribute('aria-label')).toContain('20/20:')
  expect(heat.getAttribute('aria-pressed')).toBe('true')
})

it('keeps an unchanged constituent quote neutral', () => {
  const detail: IndustryDetail = {
    board: { sector: alpha, constituents: [{ thscode: '600001.SH', ticker: '600001', name: '甲公司' }],
      constituentsTruncated: false, history: series(alpha.thscode, [100]) },
    quotes: { quotes: [{ thscode: '600001.SH', last: 100, change: 0, changePct: 0, open: 100, high: 100,
      low: 100, prevClose: 100, volume: 100, turnover: 10_000 }] }, quotedCount: 1,
  }
  render(<IndustryMatrixDashboard data={data} detail={detail} selected={alpha.thscode} window={20}
    loading={false} detailLoading={false} error={false} detailError={false}
    onSelect={vi.fn()} onStock={vi.fn()} onWindowChange={vi.fn()} onRetry={vi.fn()} t={makeTranslate(zh)} />)
  expect(screen.getByRole('button', { name: /甲公司/ }).querySelector('b')?.className).toBe(css.flat)
})
