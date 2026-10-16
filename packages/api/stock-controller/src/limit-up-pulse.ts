/** Normalize closing-limit pools and the vendor's bounded 30-day ladder. */
import type { StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { LimitUpPulseLevel, LimitUpPulseStock } from './types.ts'
import { readNumber, readOptionalString, readString, type RowContext } from './vendor.ts'

const LADDER_ENDPOINT = 'a-share.special-data.limit-up-ladder'
const POOL_ENDPOINT = 'a-share.special-data.limit-up-pool'
const LEVELS = [
  { boards: 2, field: 'two_board' }, { boards: 3, field: 'three_board' },
  { boards: 4, field: 'four_board' }, { boards: 5, field: 'five_board' },
  { boards: 6, field: 'six_board' }, { boards: 7, field: 'seven_over' },
] as const

/**
 * Normalize a vendor trading date into calendar form.
 * @param value - date returned by the ladder endpoint.
 * @returns YYYY-MM-DD calendar date.
 */
export function pulseDate(value: string): string {
  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
    : value.replaceAll('/', '-')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00+08:00`))) {
    throw new RemoteError('stock/malformed-row', `${LADDER_ENDPOINT} returned an invalid date`,
      { endpoint: LADDER_ENDPOINT, field: 'date' })
  }
  return normalized
}

/**
 * Convert a trading date to the pool's `date_ms` argument.
 * @param date - YYYY-MM-DD calendar date.
 * @returns Asia/Shanghai midnight in Unix milliseconds.
 */
export function pulseDateMs(date: string): number {
  return Date.parse(`${date}T00:00:00+08:00`)
}

function record(value: unknown): StockRow | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as StockRow : undefined
}

/**
 * Keep exactly the six ladder tiers, including empty arrays.
 * @param row - one ladder date's vendor response row.
 * @returns bounded samples for the 2 through 7+ board tiers.
 */
export function pulseLevels(row: StockRow): readonly LimitUpPulseLevel[] {
  const boards = record(row['boards'])
  if (boards === undefined) {
    throw new RemoteError('stock/malformed-row', `${LADDER_ENDPOINT} returned no boards`,
      { endpoint: LADDER_ENDPOINT, field: 'boards' })
  }
  return LEVELS.map(({ boards: height, field }) => {
    const entries = boards[field]
    if (!Array.isArray(entries)) {
      throw new RemoteError('stock/malformed-row', `${LADDER_ENDPOINT} returned no ${field} array`,
        { endpoint: LADDER_ENDPOINT, field })
    }
    const stocks = entries.map((entry: unknown) => {
      if (typeof entry === 'string' && entry !== '') return { name: entry }
      const item = record(entry)
      const name = item === undefined ? undefined
        : readOptionalString(item, 'name') ?? readOptionalString(item, 'stock_name')
      const thscode = item === undefined ? undefined
        : readOptionalString(item, 'thscode') ?? readOptionalString(item, 'stock_code')
      const displayName = name ?? thscode
      if (displayName === undefined) {
        throw new RemoteError('stock/malformed-row', `${LADDER_ENDPOINT} returned an unnamed ladder stock`,
          { endpoint: LADDER_ENDPOINT, field })
      }
      return { name: displayName, ...thscode === undefined ? {} : { thscode } }
    })
    return { boards: height, stocks }
  })
}

function optionalNumber(row: StockRow, field: string, context: RowContext): number | undefined {
  return row[field] === undefined || row[field] === null ? undefined : readNumber(row, field, context)
}

/**
 * Project pool rows while retaining missing optional amounts as unknown.
 * @param result - one page returned by the closing-limit pool.
 * @returns normalized stock observations on that page.
 */
export function pulseStocks(result: StockResult): readonly LimitUpPulseStock[] {
  const context: RowContext = { endpoint: POOL_ENDPOINT }
  return result.rows.map((row) => {
    const boards = readNumber(row, 'continue_day_cnt', context)
    if (!Number.isSafeInteger(boards) || boards < 1) {
      throw new RemoteError('stock/malformed-row', `${POOL_ENDPOINT} returned an invalid board count`,
        { endpoint: POOL_ENDPOINT, field: 'continue_day_cnt' })
    }
    const sealMoney = optionalNumber(row, 'seal_money', context)
    const maxSealMoney = optionalNumber(row, 'max_seal_money', context)
    const limitUpTime = readOptionalString(row, 'limit_up_time')
    const reason = readOptionalString(row, 'limit_up_reason')
    return {
      thscode: readString(row, 'thscode', context),
      name: readString(row, 'name', context), boards,
      ...sealMoney === undefined ? {} : { sealMoney },
      ...maxSealMoney === undefined ? {} : { maxSealMoney },
      ...limitUpTime === undefined ? {} : { limitUpTime },
      ...reason === undefined ? {} : { reason },
    }
  })
}
