import { describe, expect, it } from 'vitest'
import type { ChartBar } from '../src/client/chart/index.ts'
import { priceOverview, tradingDate } from '../src/client/overview.ts'

/** Bars with a known peak, trough, and last-window turnover. */
function series(): ChartBar[] {
  return Array.from({ length: 60 }, (_, index) => {
    const close = index === 29 ? 120 : index === 59 ? 90 : 100
    return {
      time: Date.UTC(2026, 0, index + 1),
      open: close,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100,
      turnover: index >= 40 ? 200_000_000 : 100_000_000,
    }
  })
}

describe('priceOverview', () => {
  it('uses the full returned window for return, 60 bars for drawdown, and 20 for average turnover', () => {
    const result = priceOverview(series())
    expect(result.returnPct).toBeCloseTo(-10)
    expect(result.drawdown60Pct).toBeCloseTo(-25)
    expect(result.averageTurnover20).toBe(200_000_000)
    expect(result.recent).toHaveLength(8)
    expect(result.recent[0]?.bar.close).toBe(90)
    expect(result.recent[0]?.changePct).toBeCloseTo(-10)
  })

  it('leaves metrics absent when their complete observation window is unavailable', () => {
    const result = priceOverview(series().slice(0, 10))
    expect(result.drawdown60Pct).toBeUndefined()
    expect(result.averageTurnover20).toBeUndefined()
    expect(priceOverview([]).returnPct).toBeUndefined()
  })

  it('formats trading dates in Shanghai regardless of the browser time zone', () => {
    expect(tradingDate(Date.UTC(2026, 6, 13, 16))).toBe('2026-07-14')
  })
})
