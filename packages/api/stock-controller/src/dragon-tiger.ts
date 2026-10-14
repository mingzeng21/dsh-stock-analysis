/** Host projection of the vendor's nested dragon-tiger lists. */
import type { StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { DragonTigerBoard, DragonTigerBoardType, DragonTigerSeat, DragonTigerStock } from './types.ts'
import { readNumber, readString, type RowContext } from './vendor.ts'

/** Limits applied before nested vendor arrays cross the Remote. */
export interface DragonTigerLimits {
  readonly stocks: number
  readonly seats: number
  readonly seatStocks: number
}

function isRow(value: unknown): value is StockRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayOf(row: StockRow, field: string, context: RowContext): readonly StockRow[] {
  const value = row[field]
  if (!Array.isArray(value) || !value.every(isRow)) {
    throw new RemoteError('stock/malformed-row', `${context.endpoint} returned no usable "${field}"`, {
      endpoint: context.endpoint, field,
    })
  }
  return value
}

function optionalNumber(row: StockRow, field: string, context: RowContext): number | undefined {
  return row[field] === undefined || row[field] === null ? undefined : readNumber(row, field, context)
}

function stockOf(row: StockRow, context: RowContext): DragonTigerStock {
  const orgNetValue = optionalNumber(row, 'org_net_value', context)
  const hotMoneyNetValue = optionalNumber(row, 'hot_money_net_value', context)
  const buyValue = optionalNumber(row, 'buy_value', context)
  const sellValue = optionalNumber(row, 'sell_value', context)
  const rangeDays = optionalNumber(row, 'range_days', context)
  return {
    thscode: readString(row, 'thscode', context),
    name: readString(row, 'name', context),
    netValue: readNumber(row, 'net_value', context),
    ...orgNetValue === undefined ? {} : { orgNetValue },
    ...hotMoneyNetValue === undefined ? {} : { hotMoneyNetValue },
    ...buyValue === undefined ? {} : { buyValue },
    ...sellValue === undefined ? {} : { sellValue },
    ...rangeDays === undefined ? {} : { rangeDays },
  }
}

function seatOf(row: StockRow, context: RowContext, limit: number): DragonTigerSeat {
  const entries = arrayOf(row, 'rows', context)
  const buying = optionalNumber(row, 'buying', context)
  return {
    name: readString(row, 'name', context),
    ...buying === undefined ? {} : { buying },
    stocks: entries.slice(0, limit).map((entry) => {
      const netValue = optionalNumber(entry, 'hot_money_item_net_value', context)
      return {
        thscode: readString(entry, 'thscode', context),
        name: readString(entry, 'name', context),
        ...netValue === undefined ? {} : { netValue },
      }
    }),
    truncated: entries.length > limit,
  }
}

/**
 * Read one list payload and cap its nested arrays before returning it to the browser.
 * @param result - stock seam result for the requested board.
 * @param type - requested board type.
 * @param limits - maximum entries shipped to the browser.
 * @returns the trading date and normalized board.
 */
export function toDragonTigerBoard(
  result: StockResult, type: DragonTigerBoardType, limits: DragonTigerLimits,
): { tradeDate: string; board: DragonTigerBoard } {
  const context: RowContext = { endpoint: result.endpointId }
  const [payload] = result.rows
  if (payload === undefined || result.rows.length !== 1) {
    throw new RemoteError('stock/malformed-row', `${context.endpoint} returned no single board payload`, {
      endpoint: context.endpoint, field: 'data',
    })
  }
  const returnedType = readString(payload, 'board_type', context)
  const tradeDate = readString(payload, 'trade_date', context)
  if (returnedType !== type || !/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) {
    throw new RemoteError('stock/malformed-row', `${context.endpoint} returned a mismatched board or trade date`, {
      endpoint: context.endpoint, field: returnedType !== type ? 'board_type' : 'trade_date',
    })
  }
  const stocks = arrayOf(payload, 'stock_items', context)
  const seats = arrayOf(payload, 'hot_money_items', context)
  const visibleSeats = seats.slice(0, limits.seats).map(row => seatOf(row, context, limits.seatStocks))
  return {
    tradeDate,
    board: {
      type,
      stockCount: readNumber(payload, 'stock_count', context),
      recordCount: readNumber(payload, 'count', context),
      stocks: stocks.slice(0, limits.stocks).map(row => stockOf(row, context)),
      seats: visibleSeats,
      truncated: result.meta.truncated || stocks.length > limits.stocks || seats.length > limits.seats
        || visibleSeats.some(seat => seat.truncated),
    },
  }
}
