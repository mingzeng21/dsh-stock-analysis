/** Host projection for current attention lists and daily rank history. */
import type { StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { HotRankBoard, HotRankHistory, HotRankStock } from './types.ts'
import { readNumber, readString, type RowContext } from './vendor.ts'

function trendOf(row: StockRow, context: RowContext): HotRankStock['rankTrend'] {
  const value = readString(row, 'rank_trend', context)
  if (value === 'up' || value === 'down' || value === 'flat' || value === 'unknown') return value
  throw new RemoteError('stock/malformed-row', `${context.endpoint} returned invalid rank_trend`, { endpoint: context.endpoint, field: 'rank_trend' })
}

/**
 * Project a vendor list, preserving its rank and heat values.
 * @param result - current list returned by the stock seam.
 * @param kind - attention or rank-surge list.
 * @param period - daily or hourly observation period.
 * @returns browser-safe rows with the list's observation time.
 */
export function toHotRankBoard(result: StockResult, kind: HotRankBoard['kind'], period: HotRankBoard['period']): HotRankBoard {
  const context: RowContext = { endpoint: result.endpointId }
  return {
    kind, period,
    ...result.meta.asOf === undefined ? {} : { asOf: result.meta.asOf },
    stocks: result.rows.map((row) => {
      const rawHeat = row['heat']
      const rankChange = row['rank_change'] === null || row['rank_change'] === undefined
        ? undefined : readNumber(row, 'rank_change', context)
      if (typeof rawHeat !== 'string' || rawHeat.trim() === '' || !Number.isFinite(Number(rawHeat))) {
        throw new RemoteError('stock/malformed-row', `${context.endpoint} returned invalid heat`, { endpoint: context.endpoint, field: 'heat' })
      }
      return {
        thscode: readString(row, 'thscode', context),
        ticker: readString(row, 'ticker', context),
        name: readString(row, 'name', context),
        rank: readNumber(row, 'rank', context),
        heat: rawHeat,
        ...rankChange === undefined ? {} : { rankChange },
        rankTrend: trendOf(row, context),
      }
    }),
  }
}

/**
 * Project daily rank points for exactly the requested stock.
 * @param result - rank series returned by the stock seam.
 * @param thscode - stock requested by the caller.
 * @returns daily points, including ranks outside Top 30.
 */
export function toHotRankHistory(result: StockResult, thscode: string): HotRankHistory {
  const context: RowContext = { endpoint: result.endpointId, thscode }
  return {
    thscode,
    points: result.rows.map((row) => {
      if (readString(row, 'thscode', context) !== thscode) {
        throw new RemoteError('stock/malformed-row', `${context.endpoint} returned another stock`, { endpoint: context.endpoint, field: 'thscode' })
      }
      return { date: readString(row, 'date', context), rank: readNumber(row, 'rank', context) }
    }).sort((left, right) => left.date.localeCompare(right.date)),
  }
}
