/** Values derived from the returned price history for the selected instrument. */
import type { ChartBar } from './chart/index.ts'

/** One recent bar and its change from the preceding close. */
export interface RecentBar {
  readonly bar: ChartBar
  readonly changePct?: number
}

/** Summary values; unavailable windows remain absent instead of using shorter samples. */
export interface PriceOverview {
  readonly latest: ChartBar | undefined
  readonly first: ChartBar | undefined
  readonly returnPct: number | undefined
  readonly drawdown60Pct: number | undefined
  readonly averageTurnover20: number | undefined
  readonly recent: readonly RecentBar[]
}

/**
 * Derive the overview from one ascending series.
 * @param bars - bars for one instrument and one interval.
 * @returns values whose required observations are present.
 */
export function priceOverview(bars: readonly ChartBar[]): PriceOverview {
  const latest = bars.at(-1)
  const first = bars[0]
  const returnPct = latest !== undefined && first !== undefined && bars.length >= 2 && first.close > 0
    ? (latest.close / first.close - 1) * 100
    : undefined

  let drawdown60Pct: number | undefined
  if (bars.length >= 60) {
    let peak = 0
    let worst = 0
    for (const bar of bars.slice(-60)) {
      peak = Math.max(peak, bar.close)
      if (peak > 0) worst = Math.min(worst, (bar.close / peak - 1) * 100)
    }
    drawdown60Pct = worst
  }

  const averageTurnover20 = bars.length >= 20
    ? bars.slice(-20).reduce((sum, bar) => sum + bar.turnover, 0) / 20
    : undefined

  const recent = bars.slice(-8).map((bar, offset) => {
    const index = bars.length - Math.min(8, bars.length) + offset
    const previous = bars[index - 1]
    return {
      bar,
      ...previous !== undefined && previous.close > 0
        ? { changePct: (bar.close / previous.close - 1) * 100 }
        : {},
    }
  }).reverse()

  return { latest, first, returnPct, drawdown60Pct, averageTurnover20, recent }
}

/**
 * Format a vendor trading date in its market time zone.
 * @param time - milliseconds since the Unix epoch.
 * @returns an ISO-like calendar date in Shanghai.
 */
export function tradingDate(time: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(time)
  const part = (type: string): string => parts.find(item => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
