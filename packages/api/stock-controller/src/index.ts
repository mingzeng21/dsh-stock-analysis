/**
 * Browser-facing market-data reads: the Host half of the `stock` Remote
 * namespace.
 *
 * The capability seam (`ctx.stock`) keeps the vendor's own field names on its
 * rows and leaves symbol disambiguation, parameter validation, row bounds, and
 * the failure taxonomy to itself. This service is the seam's first consumer
 * that fixes a canonical type: it performs the browser reads for symbol search,
 * quotes, candles, research documents, board catalogs, index history,
 * constituents, and same-date dragon-tiger boards. It
 * resolves vendor field names, encodings, and search vocabulary on the Host,
 * so no browser view or store reads a vendor row.
 *
 * It adds no state and no cache. Every read is a thin composition over one or
 * two seam capabilities, and every seam failure keeps a distinct Remote code
 * so the browser branches on a code rather than a message.
 *
 * Stock symbol search is A-share only, which is why it filters by asset
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
  Candle, CandleRequest, CandleSeries, DocumentKind, DocumentRow, DocumentsRequest, DragonTigerDashboard,
  HotRankDashboard, HotRankHistory, IndustryDetail, IndustryMatrix, InstrumentMatch, LimitUpPulseDashboard,
  Quote, QuoteBatch, SectorCatalog, SectorDashboard, SectorMatch,
} from './types.ts'
import { toDragonTigerBoard } from './dragon-tiger.ts'
import { toHotRankBoard, toHotRankHistory } from './hot-rank.ts'
import { pulseDate, pulseDateMs, pulseLevels, pulseStocks } from './limit-up-pulse.ts'
import { readString, toCandle, toDocument, toQuote, type RowContext } from './vendor.ts'

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
const DRAGON_TIGER_ENDPOINT = 'a-share.special-data.dragon-tiger-list'
const HOT_RANK_ENDPOINT = 'a-share.special-data.hot-stock-list'
const SURGE_ENDPOINT = 'a-share.special-data.skyrocket-list'
const HOT_RANK_TREND_ENDPOINT = 'a-share.special-data.hot-stock-rank-trend'
const SECTOR_CATALOG_ENDPOINT = 'a-share-index.catalog.ths-index-list'
const SECTOR_CONSTITUENTS_ENDPOINT = 'a-share-index.constituents.ths-stock-list'
const SECTOR_HISTORY_ENDPOINT = 'a-share-index.prices.historical'
const LIMIT_UP_LADDER_ENDPOINT = 'a-share.special-data.limit-up-ladder'
const LIMIT_UP_POOL_ENDPOINT = 'a-share.special-data.limit-up-pool'
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
  /** Inclusive cap on stock entries per dragon-tiger board sent to the browser. */
  readonly maxDragonTigerStocks: number
  /** Inclusive cap on active seats per board sent to the browser. */
  readonly maxDragonTigerSeats: number
  /** Inclusive cap on stock links sent for each active seat. */
  readonly maxDragonTigerSeatStocks: number
  /** Maximum 200-row pool pages read per trading date in the pulse dashboard. */
  readonly maxLimitUpPagesPerDay: number
  /** Maximum industry histories returned for the cross-section matrix. */
  readonly maxIndustryMatrixIndices: number
  /** Concurrent index-history reads in the matrix. */
  readonly industryMatrixConcurrency: number
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
    maxDragonTigerStocks: z.number().step(1).min(1).default(200),
    maxDragonTigerSeats: z.number().step(1).min(1).default(60),
    maxDragonTigerSeatStocks: z.number().step(1).min(1).default(30),
    maxLimitUpPagesPerDay: z.number().step(1).min(1).default(5),
    maxIndustryMatrixIndices: z.number().step(1).min(1).default(40),
    industryMatrixConcurrency: z.number().step(1).min(1).default(4),
  })

  /**
   * @param ctx - Host context carrying the stock seam.
   * @param config - deployment caps on the browser reads.
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
   * Read all three dragon-tiger boards for the latest available trading date.
   * @param signal - caller cancellation.
   * @returns same-date boards, with bounded nested entries and vendor counts.
   */
  @Remote
  async dragonTiger(signal: AbortSignal): Promise<DragonTigerDashboard> {
    const limits = {
      stocks: this.config.maxDragonTigerStocks,
      seats: this.config.maxDragonTigerSeats,
      seatStocks: this.config.maxDragonTigerSeatStocks,
    }
    const allResult = await this.seam(
      () => this.ctx.stock.call(DRAGON_TIGER_ENDPOINT, { board_type: 'all' }, signal),
      DRAGON_TIGER_ENDPOINT, undefined,
    )
    const all = toDragonTigerBoard(allResult, 'all', limits)
    const [orgResult, hotResult] = await Promise.all([
      this.seam(() => this.ctx.stock.call(DRAGON_TIGER_ENDPOINT, { board_type: 'org', date: all.tradeDate }, signal), DRAGON_TIGER_ENDPOINT, undefined),
      this.seam(() => this.ctx.stock.call(DRAGON_TIGER_ENDPOINT, { board_type: 'hot_money', date: all.tradeDate }, signal), DRAGON_TIGER_ENDPOINT, undefined),
    ])
    const org = toDragonTigerBoard(orgResult, 'org', limits)
    const hot = toDragonTigerBoard(hotResult, 'hot_money', limits)
    if (org.tradeDate !== all.tradeDate || hot.tradeDate !== all.tradeDate) {
      throw new RemoteError('stock/upstream', 'dragon-tiger boards returned different trade dates', { endpoint: DRAGON_TIGER_ENDPOINT })
    }
    return {
      tradeDate: all.tradeDate,
      ...allResult.meta.asOf === undefined ? {} : { asOf: allResult.meta.asOf },
      boards: [all.board, org.board, hot.board],
    }
  }

  /**
   * Read the current 24-hour and hourly hot-stock and rank-surge lists.
   * @param signal - caller cancellation.
   * @returns four separately timestamped lists.
   */
  @Remote
  async hotRank(signal: AbortSignal): Promise<HotRankDashboard> {
    const requests = [
      { kind: 'hot', period: 'day', endpoint: HOT_RANK_ENDPOINT },
      { kind: 'hot', period: 'hour', endpoint: HOT_RANK_ENDPOINT },
      { kind: 'surge', period: 'day', endpoint: SURGE_ENDPOINT },
      { kind: 'surge', period: 'hour', endpoint: SURGE_ENDPOINT },
    ] as const
    const boards = await Promise.all(requests.map(async ({ kind, period, endpoint }) => {
      const result = await this.seam(() => this.ctx.stock.call(endpoint, { period }, signal), endpoint, undefined)
      return toHotRankBoard(result, kind, period)
    }))
    return { boards }
  }

  /**
   * Read the last 30 calendar days of daily ranking for one A-share.
   * @param thscode - complete A-share identifier.
   * @param signal - caller cancellation.
   * @returns all returned daily rank points, including ranks outside the current Top 30.
   */
  @Remote
  async hotRankHistory(thscode: string, signal: AbortSignal): Promise<HotRankHistory> {
    const code = requireThscode(thscode)
    const endDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    const startDate = new Date(`${endDate}T00:00:00Z`)
    startDate.setUTCDate(startDate.getUTCDate() - 29)
    const fromDate = startDate.toISOString().slice(0, 10)
    const result = await this.seam(
      () => this.ctx.stock.call(HOT_RANK_TREND_ENDPOINT, { thscode: code, start_date: fromDate, end_date: endDate }, signal),
      HOT_RANK_TREND_ENDPOINT, code,
    )
    return toHotRankHistory(result, code)
  }

  /**
   * Read the vendor's recent trading-date ladder and closing-limit pools for those dates.
   * The ladder's tiers are limited samples; pool metrics disclose when the
   * configured page bound prevented complete aggregation.
   * @param signal - caller cancellation.
   * @returns trading-day pulse observations in chronological order.
   */
  @Remote
  async limitUpPulse(signal: AbortSignal): Promise<LimitUpPulseDashboard> {
    const ladder = await this.seam(
      () => this.ctx.stock.call(LIMIT_UP_LADDER_ENDPOINT, {}, signal), LIMIT_UP_LADDER_ENDPOINT, undefined,
    )
    const entries = ladder.rows.map(row => ({ date: pulseDate(readString(row, 'date', { endpoint: LIMIT_UP_LADDER_ENDPOINT })), levels: pulseLevels(row) }))
      .sort((left, right) => left.date.localeCompare(right.date))
    const days = await Promise.all(entries.map(async ({ date, levels }) => {
      const stocks = [] as ReturnType<typeof pulseStocks>[number][]
      let page = 1
      let poolTruncated = false
      while (page <= this.config.maxLimitUpPagesPerDay) {
        const result = await this.seam(
          () => this.ctx.stock.call(LIMIT_UP_POOL_ENDPOINT, { date_ms: pulseDateMs(date), page, size: 200 }, signal),
          LIMIT_UP_POOL_ENDPOINT, undefined,
        )
        stocks.push(...pulseStocks(result))
        poolTruncated ||= result.meta.truncated
        if (result.meta.next === undefined) break
        if (page === this.config.maxLimitUpPagesPerDay) { poolTruncated = true; break }
        page += 1
      }
      return { date, stocks, poolTruncated, levels }
    }))
    return { ...ladder.meta.asOf === undefined ? {} : { asOf: ladder.meta.asOf }, days }
  }

  /**
   * Read concept and industry board names for exact or partial user matching.
   * @param signal - caller cancellation.
   * @returns catalog entries in provider order and whether either list was cut.
   */
  @Remote
  async sectors(signal: AbortSignal): Promise<SectorCatalog> {
    const kinds = [
      { tag: 'cn_concept', kind: 'concept' },
      { tag: 'industry', kind: 'industry' },
    ] as const
    const results = await Promise.all(kinds.map(async ({ tag, kind }) => {
      const result = await this.seam(
        () => this.ctx.stock.call(SECTOR_CATALOG_ENDPOINT, { tag }, signal), SECTOR_CATALOG_ENDPOINT, undefined,
      )
      const context: RowContext = { endpoint: SECTOR_CATALOG_ENDPOINT }
      const matches: SectorMatch[] = result.rows.map(row => ({
        thscode: readString(row, 'thscode', context), name: readString(row, 'name', context), kind,
      }))
      return { matches, truncated: result.meta.truncated }
    }))
    return { matches: results.flatMap(result => result.matches), truncated: results.some(result => result.truncated) }
  }

  /**
   * Read current constituents and daily history for one catalog entry.
   * @param sector - selected catalog entry.
   * @param signal - caller cancellation.
   * @returns independent current membership and history observations.
   */
  @Remote
  async sectorDashboard(sector: SectorMatch, signal: AbortSignal): Promise<SectorDashboard> {
    const thscode = requireThscode(sector.thscode)
    const end = Date.now()
    const start = end - 120 * 24 * 60 * 60 * 1000
    const [members, history] = await Promise.all([
      this.seam(() => this.ctx.stock.call(SECTOR_CONSTITUENTS_ENDPOINT, { thscode }, signal), SECTOR_CONSTITUENTS_ENDPOINT, thscode),
      this.seam(() => this.ctx.stock.call(SECTOR_HISTORY_ENDPOINT, { thscode, interval: '1d', start, end }, signal), SECTOR_HISTORY_ENDPOINT, thscode),
    ])
    const context: RowContext = { endpoint: SECTOR_CONSTITUENTS_ENDPOINT, thscode }
    const constituents = members.rows.map(row => ({
      thscode: readString(row, 'thscode', context),
      ticker: readString(row, 'ticker', context),
      name: readString(row, 'name', context),
    }))
    const bars: RowContext = { endpoint: SECTOR_HISTORY_ENDPOINT, thscode }
    return {
      sector: { thscode, name: sector.name, kind: sector.kind },
      constituents,
      constituentsTruncated: members.meta.truncated,
      ...members.meta.asOf === undefined ? {} : { constituentsAsOf: members.meta.asOf },
      history: { thscode, interval: '1d', ...asOfOf(history.meta.asOf), truncated: history.meta.truncated,
        candles: history.rows.map(row => toCandle(row, bars)) },
    }
  }

  /**
   * Read bounded industry daily histories and a CSI 300 comparison series.
   * @param signal - caller cancellation.
   * @returns aligned index observations and catalog completeness.
   */
  @Remote
  async industryMatrix(signal: AbortSignal): Promise<IndustryMatrix> {
    const catalog = await this.seam(
      () => this.ctx.stock.call(SECTOR_CATALOG_ENDPOINT, { tag: 'industry' }, signal), SECTOR_CATALOG_ENDPOINT, undefined,
    )
    const entries = catalog.rows.map(row => ({
      thscode: readString(row, 'thscode', { endpoint: SECTOR_CATALOG_ENDPOINT }),
      name: readString(row, 'name', { endpoint: SECTOR_CATALOG_ENDPOINT }),
      kind: 'industry' as const,
    }))
    const selected = entries.slice(0, this.config.maxIndustryMatrixIndices)
    const end = Date.now()
    const start = end - 120 * 24 * 60 * 60 * 1000
    const readHistory = async (thscode: string): Promise<CandleSeries> => {
      const result = await this.seam(
        () => this.ctx.stock.call(SECTOR_HISTORY_ENDPOINT, { thscode, interval: '1d', start, end }, signal),
        SECTOR_HISTORY_ENDPOINT, thscode,
      )
      return { thscode, interval: '1d', ...asOfOf(result.meta.asOf), truncated: result.meta.truncated,
        candles: result.rows.map(row => toCandle(row, { endpoint: SECTOR_HISTORY_ENDPOINT, thscode })) }
    }
    const benchmark = await readHistory('000300.SH')
    const histories: ({ sector: SectorMatch; history: CandleSeries } | null)[] = Array.from({ length: selected.length }, () => null)
    let unavailableCount = 0
    let next = 0
    await Promise.all(Array.from({ length: Math.min(this.config.industryMatrixConcurrency, selected.length) }, async () => {
      while (next < selected.length) {
        const index = next++
        const sector = selected[index]
        if (sector === undefined || signal.aborted) return
        try {
          histories[index] = { sector, history: await readHistory(sector.thscode) }
        } catch (error: unknown) {
          if (error instanceof RemoteError && (error.code === 'stock/no-data' || error.code === 'stock/not-found')) {
            unavailableCount += 1
            continue
          }
          throw error
        }
      }
    }))
    return { benchmark, industries: histories.filter((item): item is { sector: SectorMatch; history: CandleSeries } => item !== null),
      unavailableCount, catalogTruncated: catalog.meta.truncated,
      industriesTruncated: entries.length > selected.length }
  }

  /**
   * Read the selected industry's current constituents and bounded quote sample.
   * @param sector - selected industry catalog entry.
   * @param signal - caller cancellation.
   * @returns independent index, membership, and current quote observations.
   */
  @Remote
  async industryDetail(sector: SectorMatch, signal: AbortSignal): Promise<IndustryDetail> {
    if (sector.kind !== 'industry') throw new RemoteError('gateway/bad-request', 'industry sector is required', {})
    const board = await this.sectorDashboard(sector, signal)
    const codes = board.constituents.slice(0, this.config.maxQuotes).map(item => item.thscode)
    const quotes = codes.length === 0 ? { quotes: [] } : await this.quotes(codes, signal)
    return { board, quotes, quotedCount: codes.length }
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
