import type { CandleSeries, IndustryMatrix, SectorMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import { describe, expect, it } from 'vitest'
import { industryPoints } from '../src/client/industry-strength.ts'

function series(code: string, closes: readonly number[]): CandleSeries {
  return { thscode: code, interval: '1d', truncated: false, candles: closes.map((close, index) => ({
    time: index * 86_400_000, open: close, high: close, low: close, close, volume: 100, turnover: 100 + index,
  })) }
}

function industry(code: string, name: string, closes: readonly number[]) {
  const sector: SectorMatch = { thscode: code, name, kind: 'industry' }
  return { sector, history: series(code, closes) }
}

describe('industry strength calculations', () => {
  it('compares matching trading dates and ranks accelerating excess returns', () => {
    const flat = Array.from({ length: 70 }, () => 100)
    const rising = flat.map((_, index) => 100 + index * index / 100)
    const data: IndustryMatrix = { benchmark: series('000300.SH', flat), unavailableCount: 0, catalogTruncated: false,
      industriesTruncated: false, industries: [industry('A.TI', '甲', rising), industry('B.TI', '乙', flat)] }
    const points = industryPoints(data, 20)
    expect(points.map(point => point.code)).toEqual(['A.TI', 'B.TI'])
    expect(points[0]?.excess).toBeGreaterThan(0)
    expect(points[0]?.acceleration).toBeGreaterThan(0)
    expect(points[0]?.strength).toBeGreaterThan(points[1]!.strength)
    expect(points[0]?.heat).toHaveLength(20)
  })

  it('omits short and stale histories instead of mixing dates', () => {
    const flat = Array.from({ length: 70 }, () => 100)
    const data: IndustryMatrix = { benchmark: series('000300.SH', flat), unavailableCount: 0, catalogTruncated: false,
      industriesTruncated: false, industries: [industry('SHORT.TI', '短', flat.slice(-20)),
        industry('STALE.TI', '旧', flat.slice(0, -1))] }
    expect(industryPoints(data, 20)).toEqual([])
  })
})
