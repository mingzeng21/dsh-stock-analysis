/** Derived observations for the industry strength matrix. */
import type { CandleSeries, IndustryMatrix } from '@deepseek-ai/dsh-api-stock-controller/client'

/** One comparable industry observation. */
export interface IndustryPoint {
  readonly code: string
  readonly name: string
  readonly excess: number
  readonly acceleration: number
  readonly pulse: number | null
  readonly strength: number
  readonly heat: readonly (number | null)[]
  readonly closes: readonly { readonly time: number; readonly industry: number; readonly benchmark: number }[]
  readonly latestTurnover: number
}

function excessAt(industry: readonly number[], benchmark: readonly number[], index: number, days: number): number | null {
  const start = index - days
  const firstIndustry = industry[start]
  const firstBenchmark = benchmark[start]
  const lastIndustry = industry[index]
  const lastBenchmark = benchmark[index]
  if (firstIndustry === undefined || firstBenchmark === undefined || lastIndustry === undefined
    || lastBenchmark === undefined || firstIndustry === 0 || firstBenchmark === 0 || lastBenchmark === 0) return null
  return ((lastIndustry / firstIndustry) / (lastBenchmark / firstBenchmark) - 1) * 100
}

function aligned(history: CandleSeries, benchmark: CandleSeries) {
  const benchmarkByDate = new Map(benchmark.candles.map(bar => [bar.time, bar]))
  return history.candles.flatMap((bar) => {
    const comparison = benchmarkByDate.get(bar.time)
    return comparison === undefined ? [] : [{ time: bar.time, industry: bar.close, benchmark: comparison.close, turnover: bar.turnover }]
  })
}

/**
 * Calculate excess return, five-session acceleration, and cross-section heat.
 * @param data - independent industry and benchmark daily histories.
 * @param days - selected trading-session return window.
 * @returns comparable industries; insufficient histories are omitted.
 */
export function industryPoints(data: IndustryMatrix, days: 5 | 20 | 60): IndustryPoint[] {
  const latestBenchmarkTime = data.benchmark.candles.at(-1)?.time
  const raw = data.industries.flatMap(({ sector, history }) => {
    const bars = aligned(history, data.benchmark)
    const latestBar = bars.at(-1)
    if (latestBar === undefined || latestBar.time !== latestBenchmarkTime) return []
    const latest = bars.length - 1
    const industry = bars.map(bar => bar.industry)
    const benchmark = bars.map(bar => bar.benchmark)
    const excess = excessAt(industry, benchmark, latest, days)
    const before = excessAt(industry, benchmark, latest - 5, days)
    if (excess === null || before === null || !Number.isFinite(excess) || !Number.isFinite(before)) return []
    const recentTurnover = bars.slice(-21, -1).map(bar => bar.turnover).filter(value => value > 0)
    const average = recentTurnover.length === 0 ? 0 : recentTurnover.reduce((sum, value) => sum + value, 0) / recentTurnover.length
    return [{ code: sector.thscode, name: sector.name, excess, acceleration: excess - before,
      pulse: average === 0 ? null : latestBar.turnover / average,
      latestTurnover: latestBar.turnover,
      closes: bars.map(bar => ({ time: bar.time, industry: bar.industry, benchmark: bar.benchmark })),
      heatReturns: Array.from({ length: 20 }, (_, offset) => excessAt(industry, benchmark, latest - 19 + offset, days)) }]
  })
  const mean = raw.reduce((sum, item) => sum + item.excess, 0) / Math.max(raw.length, 1)
  const deviation = Math.sqrt(raw.reduce((sum, item) => sum + (item.excess - mean) ** 2, 0) / Math.max(raw.length, 1)) || 1
  const heatColumns = Array.from({ length: 20 }, (_, day) => {
    const values = raw.flatMap((item) => {
      const value = item.heatReturns[day]
      return value === null || value === undefined ? [] : [value]
    })
    const center = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
    const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / Math.max(values.length, 1)) || 1
    return { center, spread }
  })
  return raw.map(item => ({ code: item.code, name: item.name, excess: item.excess,
    acceleration: item.acceleration, pulse: item.pulse, latestTurnover: item.latestTurnover,
    strength: Math.max(0, Math.min(100, 50 + (item.excess - mean) / deviation * 15)), closes: item.closes,
    heat: item.heatReturns.map((value, day) => {
      const column = heatColumns[day]
      return value === null || column === undefined ? null
        : Math.max(-2, Math.min(2, (value - column.center) / column.spread))
    }),
  })).sort((left, right) => right.strength - left.strength)
}
