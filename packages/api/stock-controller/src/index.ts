/**
 * Browser-facing market-data reads: the Host half of the `stock` Remote
 * namespace.
 *
 * The capability seam (`ctx.stock`) keeps the vendor's own field names on its
 * rows and leaves symbol disambiguation, parameter validation, row bounds, and
 * the failure taxonomy to itself. This service is the seam's first consumer
 * that fixes a canonical type: it performs the four reads one instrument
 * surface needs — symbol search, a quote batch, a candle series, and research
 * documents — and resolves the vendor's field names, encodings, and search
 * vocabulary once, on the Host, so no browser view or store ever reads a vendor
 * row.
 *
 * It adds no state and no cache. Every read is a thin composition over one or
 * two seam capabilities, and every seam failure keeps a distinct Remote code
 * so the browser branches on a code rather than a message.
 *
 * The read surface is A-share only, which is why symbol search filters by asset
 * type: the quote, candle, and document capabilities the panel consumes all
 * serve that universe, so admitting another asset class means widening the
 * filter and those reads together.
 * @module @deepseek-ai/dsh-api-stock-controller
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-stock'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type {
  Candle, CandleRequest, CandleSeries, DocumentKind, DocumentRow, DocumentsRequest,
  InstrumentMatch, Quote, QuoteBatch,
} from './types.ts'
import { toCandle, toDocument, toQuote, type RowContext } from './vendor.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `stock` Remote namespace. */
    stockController: StockController
  }
}

/** Capability ids this service reads. */
const SYMBOL_SEARCH_ENDPOINT = 'meta.tickers.search'
const QUOTE_ENDPOINT = 'a-share.prices.snapshot'
const CANDLE_ENDPOINT = 'a-share.prices.historical'
const DOCUMENT_ENDPOINTS: Readonly<Record<DocumentKind, string>> = {
  report: 'iwencai.search.report',
  announcement: 'iwencai.search.announcement',
  news: 'iwencai.search.news',
}

/**
 * Query suffix appended to an instrument name for each document channel. The
 * gateway searches by natural language, so the channel is named in the query
 * rather than selected by a parameter.
 */
const DOCUMENT_QUERY_SUFFIX: Readonly<Record<DocumentKind, string>> = {
  report: '研报',
  announcement: '公告',
  news: '新闻',
}

/**
 * Asset types symbol search admits. The quote, candle, and document
 * capabilities this service reads all serve this universe; a match outside it
 * would enter a list that could never quote it.
 */
const SYMBOL_ASSET_TYPES = 'a-share'

/** Longest candle window the vendor accepts, in years. */
const MAX_CANDLE_WINDOW_YEARS = 10

/** Remote codes a seam failure maps onto; every one names the read that failed. */
export type SeamFailureCode =
  | 'stock/provider-unavailable'
  | 'stock/unauthenticated'
  | 'stock/forbidden'
  | 'stock/not-found'
  | 'stock/no-data'
  | 'stock/unsupported-asset'
  | 'stock/rate-limited'
  | 'stock/capability-closed'
  | 'stock/cancelled'
  | 'stock/upstream'
  | 'stock/invalid-params'
  | 'stock/unavailable-capability'

/**
 * Seam codes to Remote codes. Compared by code string rather than class
 * identity, because the `StockError` class belongs to whichever seam instance
 * the composition loaded and no instance is shared across the package edge.
 */
const SEAM_FAILURE_CODES: Readonly<Record<string, SeamFailureCode>> = {
  STOCK_PROVIDER_UNAVAILABLE: 'stock/provider-unavailable',
  STOCK_PROVIDER_CONFIGURED_MISSING: 'stock/provider-unavailable',
  STOCK_PROVIDER_AMBIGUOUS: 'stock/provider-unavailable',
  STOCK_UNKNOWN_ENDPOINT: 'stock/unavailable-capability',
  STOCK_INVALID_PARAMS: 'stock/invalid-params',
  STOCK_UNAUTHENTICATED: 'stock/unauthenticated',
  STOCK_FORBIDDEN: 'stock/forbidden',
  STOCK_NOT_FOUND: 'stock/not-found',
  STOCK_NO_DATA: 'stock/no-data',
  STOCK_UNSUPPORTED_ASSET: 'stock/unsupported-asset',
  STOCK_RATE_LIMITED: 'stock/rate-limited',
  STOCK_CAPABILITY_CLOSED: 'stock/capability-closed',
  STOCK_CANCELLED: 'stock/cancelled',
  STOCK_UPSTREAM: 'stock/upstream',
  STOCK_MALFORMED_RESPONSE: 'stock/upstream',
}

/** Reads this service exposes and the caps a deployment applies to them. */
export interface Config {
  /** Inclusive cap on instruments one quote batch may name. */
  readonly maxQuotes: number
  /** Inclusive cap on rows one document search may return. */
  readonly maxDocuments: number
  /** Inclusive character cap on one document excerpt. */
  readonly maxSummaryChars: number
  /** Inclusive cap on symbol-search candidates. */
  readonly maxSymbolMatches: number
}

/**
 * Classify one seam failure onto its Remote code.
 * @param error - the value the seam call threw.
 * @param endpoint - capability id the read was issued against.
 * @param thscode - instrument the read was about, when it named one.
 * @returns the mapped failure, or `undefined` when the value is not a seam failure and must propagate unchanged.
 */
function seamFailure(error: unknown, endpoint: string, thscode: string | undefined): RemoteError | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string' || !code.startsWith('STOCK_')) return undefined
  const message = error instanceof Error ? error.message : code
  const details = thscode === undefined ? { endpoint } : { endpoint, thscode }
  return new RemoteError(SEAM_FAILURE_CODES[code] ?? 'stock/upstream', message, details, { cause: error })
}

/** One required thscode argument: the vendor rejects a bare code, so a blank one never reaches it. */
function requireThscode(value: string): string {
  const thscode = value.trim()
  if (thscode === '') throw new RemoteError('gateway/bad-request', 'thscode is required', {})
  return thscode
}

/**
 * Validate one candle window. The vendor accepts at most ten years per request,
 * measured from the start date, so the bound is calendar arithmetic rather than
 * a fixed millisecond count.
 */
function candleWindow(start: number, end: number): { start: number; end: number } {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    throw new RemoteError('gateway/bad-request', 'start and end must be integer millisecond timestamps', {})
  }
  if (end < start) throw new RemoteError('gateway/bad-request', 'end must not precede start', {})
  const limit = new Date(start)
  limit.setFullYear(limit.getFullYear() + MAX_CANDLE_WINDOW_YEARS)
  if (end > limit.getTime()) {
    throw new RemoteError('gateway/bad-request', `the window must not exceed ${MAX_CANDLE_WINDOW_YEARS} years`, {})
  }
  return { start, end }
}

/** The batch fact a seam result reports, omitted when the vendor reports none. */
function asOfOf(asOf: number | undefined): { asOf?: number } {
  return asOf === undefined ? {} : { asOf }
}

/** Project one seam symbol match onto the wire vocabulary. */
function toMatch(match: {
  readonly thscode: string
  readonly ticker: string
  readonly name: string
  readonly assetType?: string
  readonly exchange?: string
}): InstrumentMatch {
  return {
    thscode: match.thscode,
    ticker: match.ticker,
    name: match.name,
    ...match.assetType === undefined ? {} : { assetType: match.assetType },
    ...match.exchange === undefined ? {} : { exchange: match.exchange },
  }
}

/** Host Remote reads over the stock capability seam. */
export class StockController extends TypertRemoteService {
  static inject = ['stock']

  static Config: z<Config> = z.object({
    maxQuotes: z.number().step(1).min(1).default(50),
    maxDocuments: z.number().step(1).min(1).default(30),
    maxSummaryChars: z.number().step(1).min(1).default(400),
    maxSymbolMatches: z.number().step(1).min(1).default(20),
  })

  /**
   * @param ctx - Host context carrying the stock seam.
   * @param config - deployment caps on the four reads.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'stockController', { namespace: 'stock' })
  }

  /**
   * Resolve a name, bare code, or thscode fragment to complete instruments.
   *
   * The seam's symbol lookup is cached rather than transport-cancellable, so a
   * superseded request is refused before it starts instead of being aborted
   * mid-flight.
   * @param query - user-facing search text.
   * @param limit - desired candidate count; capped by configuration.
   * @param signal - caller cancellation.
   * @returns candidates in vendor order, or every candidate the cap allows.
   */
  @Remote
  async searchSymbols(query: string, limit: number, signal: AbortSignal): Promise<readonly InstrumentMatch[]> {
    const text = query.trim()
    if (text === '') throw new RemoteError('gateway/bad-request', 'query is required', {})
    if (signal.aborted) {
      throw new RemoteError('stock/cancelled', 'the symbol search was cancelled', { endpoint: SYMBOL_SEARCH_ENDPOINT })
    }
    const bounded = this.cap(limit, this.config.maxSymbolMatches, 'limit')
    const matches = await this.seam(
      () => this.ctx.stock.resolveSymbols(text, { assetType: SYMBOL_ASSET_TYPES, limit: bounded }),
      SYMBOL_SEARCH_ENDPOINT,
      undefined,
    )
    return matches.map(toMatch)
  }

  /**
   * Read the latest quote for each named instrument in one batched call.
   * @param thscodes - complete thscodes; blanks and duplicates are dropped, and the batch is capped by configuration.
   * @param signal - caller cancellation.
   * @returns the quotes the vendor returned, in the seam's order, with the batch's data-readiness timestamp.
   */
  @Remote
  async quotes(thscodes: string[], signal: AbortSignal): Promise<QuoteBatch> {
    const codes = [...new Set(thscodes.map(code => code.trim()).filter(code => code !== ''))]
    if (codes.length === 0) throw new RemoteError('gateway/bad-request', 'at least one thscode is required', {})
    if (codes.length > this.config.maxQuotes) {
      throw new RemoteError('gateway/bad-request', `at most ${this.config.maxQuotes} thscodes are accepted`, {})
    }
    const result = await this.seam(
      () => this.ctx.stock.call(QUOTE_ENDPOINT, { thscodes: codes.join(',') }, signal),
      QUOTE_ENDPOINT,
      undefined,
    )
    const context: RowContext = { endpoint: QUOTE_ENDPOINT }
    const quotes: Quote[] = result.rows.map(row => toQuote(row, context))
    return { ...asOfOf(result.meta.asOf), quotes }
  }

  /**
   * Read one instrument's candle series for a window.
   * @param request - instrument, period, adjustment, and the window.
   * @param signal - caller cancellation.
   * @returns bars in the vendor's ascending order, with the seam's truncation fact.
   */
  @Remote
  async candles(request: CandleRequest, signal: AbortSignal): Promise<CandleSeries> {
    const thscode = requireThscode(request.thscode)
    const window = candleWindow(request.start, request.end)
    const result = await this.seam(
      () => this.ctx.stock.call(CANDLE_ENDPOINT, {
        thscode,
        interval: request.interval,
        adjust: request.adjust ?? 'forward',
        start: window.start,
        end: window.end,
      }, signal),
      CANDLE_ENDPOINT,
      thscode,
    )
    const context: RowContext = { endpoint: CANDLE_ENDPOINT, thscode }
    const candles: Candle[] = result.rows.map(row => toCandle(row, context))
    return {
      thscode,
      interval: request.interval,
      ...asOfOf(result.meta.asOf),
      truncated: result.meta.truncated,
      candles,
    }
  }

  /**
   * Search one document channel for an instrument.
   * @param request - instrument display name, channel, and desired row count.
   * @param signal - caller cancellation.
   * @returns rows in the gateway's relevance order, each excerpt capped by configuration.
   */
  @Remote
  async documents(request: DocumentsRequest, signal: AbortSignal): Promise<readonly DocumentRow[]> {
    const name = request.name.trim()
    if (name === '') throw new RemoteError('gateway/bad-request', 'name is required', {})
    const endpoint = DOCUMENT_ENDPOINTS[request.kind]
    const size = this.cap(request.size, this.config.maxDocuments, 'size')
    const query = `${name} ${DOCUMENT_QUERY_SUFFIX[request.kind]}`
    const result = await this.seam(
      () => this.ctx.stock.call(endpoint, { query, size }, signal),
      endpoint,
      undefined,
    )
    const context: RowContext = { endpoint }
    return result.rows.map(row => toDocument(row, request.kind, context, this.config.maxSummaryChars))
  }

  /** Read a desired count as a positive integer and cap it to the deployment bound. */
  private cap(value: number, max: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RemoteError('gateway/bad-request', `${name} must be a positive integer`, {})
    }
    return Math.min(value, max)
  }

  /**
   * Run one seam call, mapping a seam failure onto its Remote code.
   * @param run - the seam call.
   * @param endpoint - capability id the read is issued against.
   * @param thscode - instrument the read is about, when it names one.
   * @returns the seam result.
   */
  private async seam<T>(run: () => Promise<T>, endpoint: string, thscode: string | undefined): Promise<T> {
    try {
      return await run()
    } catch (error: unknown) {
      const failure = seamFailure(error, endpoint, thscode)
      if (failure === undefined) throw error
      throw failure
    }
  }
}

export default StockController
