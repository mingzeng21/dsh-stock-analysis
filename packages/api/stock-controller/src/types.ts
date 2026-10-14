/**
 * Browser-facing market-data vocabulary for the `stock` Remote namespace.
 *
 * The stock capability seam keeps the vendor's own field names on its rows,
 * because the 94 capabilities it serves return 94 row shapes. This module is
 * the single consumer that fixes a canonical type: the reads the watchlist and
 * dashboard need, with the vendor's field names and encodings resolved
 * once on the Host so no view or store ever reads a vendor row.
 * @module @deepseek-ai/dsh-api-stock-controller/types
 */

// Import the protocol module so the declaration at the end of this file
// augments its error map rather than defining an unrelated ambient module.
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** One instrument candidate from cross-market symbol disambiguation. */
export interface InstrumentMatch {
  /** Complete thscode, e.g. `600519.SH`. */
  readonly thscode: string
  /** Bare code without the market suffix. */
  readonly ticker: string
  /** Display name. */
  readonly name: string
  /** Vendor-normalized asset type, when the response carries one. */
  readonly assetType?: string
  /** Market suffix; absent for over-the-counter funds, whose suffix is not an exchange. */
  readonly exchange?: string
}

/** Candle aggregation period, in the vendor's own vocabulary. */
export type CandleInterval = '1d' | '1w' | '1mo'

/** Price adjustment applied to a candle series. */
export type CandleAdjust = 'none' | 'forward' | 'backward'

/** Which document channel one row came from. */
export type DocumentKind = 'report' | 'announcement' | 'news'

/** One instrument's latest quote. */
export interface Quote {
  /** Complete thscode. */
  readonly thscode: string
  /** Latest traded price. */
  readonly last: number
  /** Absolute change against the previous close. */
  readonly change: number
  /** Percentage change against the previous close, as the vendor reports it. */
  readonly changePct: number
  /** Session open. */
  readonly open: number
  /** Session high. */
  readonly high: number
  /** Session low. */
  readonly low: number
  /** Previous close. */
  readonly prevClose: number
  /** Traded volume in shares. */
  readonly volume: number
  /** Traded turnover in the instrument's currency. */
  readonly turnover: number
}

/**
 * One quote batch. `asOf` is the vendor's data-readiness timestamp in
 * milliseconds since the Unix epoch, absent when the vendor reports none.
 */
export interface QuoteBatch {
  /** Vendor data-readiness timestamp in milliseconds, when reported. */
  readonly asOf?: number
  /** Quotes in the requested order; an instrument the vendor does not know is absent. */
  readonly quotes: readonly Quote[]
}

/** The three published dragon-tiger list views. */
export type DragonTigerBoardType = 'all' | 'org' | 'hot_money'

/** One stock entry in a dragon-tiger list. Amounts are vendor yuan values. */
export interface DragonTigerStock {
  readonly thscode: string
  readonly name: string
  readonly netValue: number
  /** Vendor `change` percentage points for the trading date, when supplied. */
  readonly changePct?: number
  /** Trading amount in yuan, when supplied. */
  readonly amount?: number
  readonly orgNetValue?: number
  readonly hotMoneyNetValue?: number
  readonly buyValue?: number
  readonly sellValue?: number
  readonly rangeDays?: number
}

/** One stock linked to a named hot-money seat. */
export interface DragonTigerSeatStock {
  readonly thscode: string
  readonly name: string
  readonly netValue?: number
}

/** One active seat and its returned stock links. */
export interface DragonTigerSeat {
  readonly name: string
  readonly buying?: number
  readonly stocks: readonly DragonTigerSeatStock[]
  readonly truncated: boolean
}

/** One board's reported counts and bounded, browser-safe entries. */
export interface DragonTigerBoard {
  readonly type: DragonTigerBoardType
  readonly stockCount: number
  readonly recordCount: number
  readonly stocks: readonly DragonTigerStock[]
  readonly seats: readonly DragonTigerSeat[]
  readonly truncated: boolean
}

/** Three boards aligned to the latest available trading date. */
export interface DragonTigerDashboard {
  readonly tradeDate: string
  readonly asOf?: number
  readonly boards: readonly DragonTigerBoard[]
}

/** One stock on a current hot-stock or rank-surge list. */
export interface HotRankStock {
  readonly thscode: string
  readonly ticker: string
  readonly name: string
  readonly rank: number
  readonly heat: string
  readonly rankChange?: number
  readonly rankTrend: 'up' | 'down' | 'flat' | 'unknown'
}

/** One current list, with its own observation time. */
export interface HotRankBoard {
  readonly kind: 'hot' | 'surge'
  readonly period: 'day' | 'hour'
  readonly asOf?: number
  readonly stocks: readonly HotRankStock[]
}

/** Four independent current attention lists. */
export interface HotRankDashboard {
  readonly boards: readonly HotRankBoard[]
}

/** One daily ranking observation for a selected stock. */
export interface HotRankPoint {
  readonly date: string
  readonly rank: number
}

/** A stock's complete daily rank series within the requested window. */
export interface HotRankHistory {
  readonly thscode: string
  readonly points: readonly HotRankPoint[]
}

/** One candlestick. */
export interface Candle {
  /** Bar open time in milliseconds since the Unix epoch. */
  readonly time: number
  /** Opening price. */
  readonly open: number
  /** Highest price in the bar. */
  readonly high: number
  /** Lowest price in the bar. */
  readonly low: number
  /** Closing price. */
  readonly close: number
  /** Traded volume in shares. */
  readonly volume: number
  /** Traded turnover in the instrument's currency. */
  readonly turnover: number
}

/** One instrument's candle series for the requested window. */
export interface CandleSeries {
  /** Complete thscode the series belongs to. */
  readonly thscode: string
  /** Aggregation period the series was requested at. */
  readonly interval: CandleInterval
  /** Vendor data-readiness timestamp in milliseconds, when reported. */
  readonly asOf?: number
  /** True when the vendor returned more bars than the seam's row bound allowed. */
  readonly truncated: boolean
  /** Bars in ascending time order. */
  readonly candles: readonly Candle[]
}

/** One research document about an instrument. */
export interface DocumentRow {
  /** Channel the row came from. */
  readonly kind: DocumentKind
  /** Document title. */
  readonly title: string
  /** Publishing organization for a report or the outlet for news; absent for a channel that has none. */
  readonly source?: string
  /** Publication time in milliseconds since the Unix epoch. */
  readonly publishedAt: number
  /** Vendor-provided excerpt; the Host caps its length. */
  readonly summary: string
  /** True when `summary` was cut to the configured character cap. */
  readonly summaryTruncated: boolean
  /** Link to the original document, when the vendor supplies one. */
  readonly url?: string
}

/** One candle window request. */
export interface CandleRequest {
  /** Complete thscode; the vendor rejects a bare code. */
  readonly thscode: string
  /** Aggregation period. */
  readonly interval: CandleInterval
  /** Price adjustment; the Host default applies when omitted. */
  readonly adjust?: CandleAdjust
  /** Window start in milliseconds since the Unix epoch. */
  readonly start: number
  /** Window end in milliseconds since the Unix epoch; at most ten years after `start`. */
  readonly end: number
}

/** One document search request. */
export interface DocumentsRequest {
  /** Instrument display name, used as the natural-language query subject. */
  readonly name: string
  /** Channel to search. */
  readonly kind: DocumentKind
  /** Desired row count; the Host caps it. */
  readonly size: number
}

/** Read that failed, and the instrument it was about when it named one. */
export interface StockFailureDetails {
  /** Capability id the read was issued against. */
  readonly endpoint: string
  /** Instrument the read was about, when it named one. */
  readonly thscode?: string
}

/** Malformed-row failure details, naming the field the row omitted. */
export interface StockRowFailureDetails extends StockFailureDetails {
  /** Vendor field the row did not carry usably. */
  readonly field: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No usable provider serves the capability the read needed. */
    'stock/provider-unavailable': StockFailureDetails
    /** The vendor refused the credential, or none is configured. */
    'stock/unauthenticated': StockFailureDetails
    /** The credential is valid but lacks permission for the capability. */
    'stock/forbidden': StockFailureDetails
    /** The requested instrument does not exist. */
    'stock/not-found': StockFailureDetails
    /** The instrument exists but has no data for the requested window. */
    'stock/no-data': StockFailureDetails
    /** The instrument's asset type does not support the capability. */
    'stock/unsupported-asset': StockFailureDetails
    /** The vendor throttled the request. */
    'stock/rate-limited': StockFailureDetails
    /** The vendor publishes the capability but has not opened external access. */
    'stock/capability-closed': StockFailureDetails
    /** The read was cancelled. */
    'stock/cancelled': StockFailureDetails
    /** The vendor or an upstream data source failed. */
    'stock/upstream': StockFailureDetails
    /** Arguments failed seam validation before any request was issued. */
    'stock/invalid-params': StockFailureDetails
    /** The capability is absent from every registered provider's catalog. */
    'stock/unavailable-capability': StockFailureDetails
    /** A vendor row did not carry a value the browser surface requires. */
    'stock/malformed-row': StockRowFailureDetails
  }
}
