/**
 * Vendor-row readers for the `stock` Remote namespace.
 *
 * The capability seam deliberately keeps the vendor's field names on its rows,
 * so this is the one place those names are read and the one place a row that
 * does not carry what the browser surface needs becomes a typed failure instead
 * of an `undefined` that would render as a blank cell. A missing or
 * non-numeric value fails the read: substituting a zero or dropping the row
 * would report an undisclosed value as a real one.
 * @module @deepseek-ai/dsh-api-stock-controller/vendor
 */

import type { StockRow } from '@deepseek-ai/dsh-stock'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { Candle, DocumentKind, DocumentRow, Quote } from './types.ts'

/** Which read a malformed row was encountered by. */
export interface RowContext {
  /** Capability id the row came from. */
  readonly endpoint: string
  /** Instrument the row is about, when the read was issued for one. */
  readonly thscode?: string
}

/** One malformed-row failure carrying the field and endpoint that produced it. */
function malformed(context: RowContext, field: string, received: unknown): RemoteError<'stock/malformed-row'> {
  const thscode = context.thscode
  const suffix = thscode === undefined ? '' : ` for ${thscode}`
  return new RemoteError(
    'stock/malformed-row',
    `${context.endpoint} returned no usable "${field}"${suffix}: ${String(received)}`,
    thscode === undefined
      ? { endpoint: context.endpoint, field }
      : { endpoint: context.endpoint, field, thscode },
  )
}

/**
 * Read one numeric field. A numeric string is accepted because the vendor is
 * inconsistent about JSON number encoding; anything else fails.
 * @param row - the vendor row.
 * @param field - vendor field name to read.
 * @param context - endpoint and instrument the row is about.
 * @returns the finite number the field carried.
 */
export function readNumber(row: StockRow, field: string, context: RowContext): number {
  const value = row[field]
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) {
    throw malformed(context, field, value)
  }
  return numeric
}

/**
 * Read one required string field; a non-string fails rather than stringifying.
 * @param row - the vendor row.
 * @param field - vendor field name to read.
 * @param context - endpoint and instrument the row is about.
 * @returns the non-empty string the field carried.
 */
export function readString(row: StockRow, field: string, context: RowContext): string {
  const value = row[field]
  if (typeof value !== 'string' || value === '') throw malformed(context, field, value)
  return value
}

/**
 * Read one optional string field.
 * @param row - the vendor row.
 * @param field - vendor field name to read.
 * @returns the non-empty string the field carried, or `undefined` when the vendor omitted it or sent a non-string.
 */
export function readOptionalString(row: StockRow, field: string): string | undefined {
  const value = row[field]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * Project one `a-share.prices.snapshot` row onto a quote.
 * @param row - the vendor row.
 * @param context - endpoint and instrument the row is about.
 * @returns the quote.
 */
export function toQuote(row: StockRow, context: RowContext): Quote {
  return {
    thscode: readString(row, 'thscode', context),
    last: readNumber(row, 'last_price', context),
    change: readNumber(row, 'price_change', context),
    changePct: readNumber(row, 'price_change_ratio_pct', context),
    open: readNumber(row, 'open_price', context),
    high: readNumber(row, 'high_price', context),
    low: readNumber(row, 'low_price', context),
    prevClose: readNumber(row, 'prev_price', context),
    volume: readNumber(row, 'volume', context),
    turnover: readNumber(row, 'turnover', context),
  }
}

/**
 * Project one `a-share.prices.historical` row onto a candlestick.
 * @param row - the vendor row.
 * @param context - endpoint and instrument the row is about.
 * @returns the candlestick.
 */
export function toCandle(row: StockRow, context: RowContext): Candle {
  return {
    time: readNumber(row, 'date_ms', context),
    open: readNumber(row, 'open_price', context),
    high: readNumber(row, 'high_price', context),
    low: readNumber(row, 'low_price', context),
    close: readNumber(row, 'close_price', context),
    volume: readNumber(row, 'volume', context),
  }
}

/**
 * Read a document row's `extra` column, which the search gateway carries as a
 * JSON string whose keys vary by channel. A value that is not a JSON object
 * yields no keys: `extra` is optional vendor metadata, and every consumer of it
 * has a channel-level fallback, so a parse failure cannot change the row's
 * identity, title, time, or link.
 */
function readExtra(row: StockRow): Readonly<Record<string, unknown>> {
  const raw = row['extra']
  if (typeof raw !== 'string' || raw === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    // `extra` is a vendor JSON string; malformed JSON means no optional keys.
  }
  return {}
}

/** One string member of a parsed `extra` object. */
function extraString(extra: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = extra[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * The publishing organization for one document row. Reports name their
 * brokerage, news names the outlet, and announcements have none, so the caller
 * renders its own localized channel label when this is absent.
 */
function sourceOf(row: StockRow, kind: DocumentKind): string | undefined {
  if (kind === 'announcement') return undefined
  const extra = readExtra(row)
  if (kind === 'report') return extraString(extra, 'organization')
  return extraString(extra, 'real_publish_source') ?? extraString(extra, 'publish_source')
}

/** Publication time in milliseconds; the gateway reports whole seconds since the Unix epoch. */
function publishedAtOf(row: StockRow, context: RowContext): number {
  const seconds = readNumber(row, 'publish_time', context)
  return seconds * 1000
}

/**
 * Project one search-gateway row onto a document, cutting the excerpt to the
 * configured cap and reporting that it was cut.
 * @param row - one `iwencai.search.*` row.
 * @param kind - the channel the row was returned for.
 * @param context - endpoint and instrument the row is about.
 * @param maxSummaryChars - inclusive character cap on the excerpt.
 * @returns the wire row.
 */
export function toDocument(
  row: StockRow,
  kind: DocumentKind,
  context: RowContext,
  maxSummaryChars: number,
): DocumentRow {
  const summary = readOptionalString(row, 'summary') ?? ''
  const truncated = summary.length > maxSummaryChars
  const source = sourceOf(row, kind)
  const url = readOptionalString(row, 'url')
  return {
    kind,
    title: readString(row, 'title', context),
    ...source === undefined ? {} : { source },
    publishedAt: publishedAtOf(row, context),
    summary: truncated ? summary.slice(0, maxSummaryChars) : summary,
    summaryTruncated: truncated,
    ...url === undefined ? {} : { url },
  }
}
