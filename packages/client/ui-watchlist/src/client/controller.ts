/**
 * React-free state for the watchlist panel.
 *
 * The durable list belongs to the `watchlist` Remote namespace and quotes
 * belong to the `stock` one, so this object owns only what the panel derives
 * from them: one published quote batch keyed by instrument, and the phase of
 * each read so the surface can render a retry instead of an empty list. It
 * holds no subscription and no cache key — a read the user asks for is a read
 * performed, and a superseded read never publishes over a newer one.
 * @module @deepseek-ai/dsh-client-ui-watchlist/controller
 */

import type {
  CandleInterval, DocumentKind, DocumentRow, IStockClient, InstrumentMatch, Quote,
} from '@deepseek-ai/dsh-api-stock-controller/client'
import type { IWatchlist, WatchlistEntry } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ChartBar } from './chart/index.ts'

/** How far one read has got. */
export type LoadPhase = 'idle' | 'loading' | 'ready' | 'failed'

/** What a quote batch carries whatever its phase. */
interface QuotesFacts {
  /** Vendor data-readiness timestamp in milliseconds, when the seam reported one. */
  readonly asOf?: number
  /** Quotes by thscode; an instrument the vendor did not answer for is absent. */
  readonly byCode: Readonly<Record<string, Quote>>
}

/**
 * The published quote batch. The failure arm carries its code as a required
 * member, so a surface that renders a retry reads it without re-checking that
 * the producer set one.
 */
export type QuotesSnapshot =
  | (QuotesFacts & { readonly phase: 'idle' | 'loading' | 'ready' })
  | (QuotesFacts & { readonly phase: 'failed'; readonly failure: string })

/** The published state of the durable list read, with the same failed-arm rule. */
export type ListSnapshot =
  | { readonly phase: 'idle' | 'loading' | 'ready' }
  | { readonly phase: 'failed'; readonly failure: string }

/** What a candle read carries whatever its phase. */
interface CandlesFacts {
  /** Window the bars cover, as the period switch named it. */
  readonly interval: CandleInterval
  /** Bars in ascending time order; the last successful read's while one is in flight. */
  readonly bars: readonly ChartBar[]
  /** True when the vendor returned more bars than the seam's row bound allowed. */
  readonly truncated: boolean
}

/** The published candle series, with the same failed-arm rule. */
export type CandlesSnapshot =
  | (CandlesFacts & { readonly phase: 'idle' | 'loading' | 'ready' })
  | (CandlesFacts & { readonly phase: 'failed'; readonly failure: string })

/** The periods the switch offers, in display order. */
export const CANDLE_INTERVALS: readonly CandleInterval[] = ['1d', '1w', '1mo']

/** The document channels the tab strip offers, in display order. */
export const DOCUMENT_KINDS: readonly DocumentKind[] = ['report', 'announcement', 'news']

/** Rows one document read asks for; the Host caps it again. */
const DOCUMENT_LIMIT = 10

/**
 * The published document channel. Every arm but the first names the channel its
 * state belongs to, so a switch that lands during a read cannot render one
 * channel's rows under another channel's tab, and the failed arm carries its
 * code the way every other read here does.
 */
export type DocumentsSnapshot =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading'; readonly kind: DocumentKind }
  | { readonly phase: 'ready'; readonly kind: DocumentKind; readonly rows: readonly DocumentRow[] }
  | { readonly phase: 'failed'; readonly kind: DocumentKind; readonly failure: string }

/** How much history each period asks for, in days. */
const WINDOW_DAYS: Readonly<Record<CandleInterval, number>> = { '1d': 365, '1w': 1095, '1mo': 3650 }

/** Milliseconds in one day. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The window one period asks the Host for.
 * @param interval - the selected period.
 * @param now - current time in milliseconds, injected for a pure call.
 * @returns the window bounds, both integer millisecond timestamps.
 */
export function candleWindow(interval: CandleInterval, now: number): { start: number; end: number } {
  return { start: now - WINDOW_DAYS[interval] * DAY_MS, end: now }
}

/** Outcome of adding one instrument. */
export type AddOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string }

/** Outcome of one symbol search. */
export type SearchOutcome =
  | { readonly ok: true; readonly matches: readonly InstrumentMatch[] }
  | { readonly ok: false; readonly code: string }

/** Candidates one search asks for; the Host caps it again. */
const SEARCH_LIMIT = 10

/** A thrown failure's stable code, or `unknown` when it carries none. */
function failureCode(error: unknown): string {
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'unknown'
}

/** The list, quotes, and commands the watchlist panel reads and drives. */
export class WatchlistSurface {
  private readonly quoteStore = createSnapshotStore<QuotesSnapshot>({ phase: 'idle', byCode: {} })
  private readonly listStore = createSnapshotStore<ListSnapshot>({ phase: 'idle' })
  private readonly candleStore = createSnapshotStore<CandlesSnapshot>({
    phase: 'idle',
    interval: '1d',
    bars: [],
    truncated: false,
  })
  private readonly documentStore = createSnapshotStore<DocumentsSnapshot>({ phase: 'idle' })
  /** Latest read identity: a read that is no longer current publishes nothing. */
  private generation = 0
  /** Candle-read identity, advanced by every series read and by every supersession. */
  private candleGeneration = 0
  /** Document-read identity, advanced by every channel read and every supersession. */
  private documentGeneration = 0

  /** Quote batch published for the current list. */
  readonly quotes: ObservableSnapshot<QuotesSnapshot> = this.quoteStore
  /** Phase of the durable list read. */
  readonly list: ObservableSnapshot<ListSnapshot> = this.listStore
  /** The candle series currently drawn. */
  readonly candles: ObservableSnapshot<CandlesSnapshot> = this.candleStore
  /** The document channel currently listed. */
  readonly documents: ObservableSnapshot<DocumentsSnapshot> = this.documentStore

  /**
   * @param watchlist - browser projection of the durable list.
   * @param stock - browser reads over the market-data namespace.
   */
  constructor(
    private readonly watchlist: IWatchlist,
    private readonly stock: IStockClient,
  ) {}

  /**
   * Read the durable list, then its quotes. Never rejects: a failure is
   * published as a phase and a code so the surface can offer a retry.
   * @returns completion of the whole read.
   */
  async load(): Promise<void> {
    const token = ++this.generation
    this.listStore.set({ phase: 'loading' })
    let entries: readonly WatchlistEntry[]
    try {
      entries = await this.watchlist.refresh()
    } catch (error: unknown) {
      if (token !== this.generation) return
      this.listStore.set({ phase: 'failed', failure: failureCode(error) })
      return
    }
    if (token !== this.generation) return
    this.listStore.set({ phase: 'ready' })
    await this.loadQuotes(entries, token)
  }

  /**
   * Re-read the quotes for the list already held.
   * @returns completion of the read.
   */
  async refreshQuotes(): Promise<void> {
    const token = ++this.generation
    await this.loadQuotes(this.watchlist.entries.getSnapshot(), token)
  }

  /**
   * Resolve one instrument and append it to the durable list.
   * @param thscode - complete thscode to add.
   * @returns success, or the Remote failure code the Host answered with.
   */
  async add(thscode: string): Promise<AddOutcome> {
    try {
      await this.watchlist.add(thscode)
    } catch (error: unknown) {
      return { ok: false, code: failureCode(error) }
    }
    await this.refreshQuotes()
    return { ok: true }
  }

  /**
   * Drop one instrument from the durable list.
   * @param thscode - complete thscode to remove.
   * @returns success, or the Remote failure code the Host answered with.
   */
  async remove(thscode: string): Promise<AddOutcome> {
    try {
      await this.watchlist.remove(thscode)
    } catch (error: unknown) {
      return { ok: false, code: failureCode(error) }
    }
    await this.refreshQuotes()
    return { ok: true }
  }

  /**
   * Read one instrument's candle series for a period. Never rejects: a failure
   * is published as a phase and a code, and the last successful series stays
   * published while a newer read is in flight.
   * @param thscode - instrument to read.
   * @param interval - period to read.
   * @param now - current time in milliseconds, injected by the caller so the window is decided at the entry point.
   * @returns completion of the read.
   */
  async loadCandles(thscode: string, interval: CandleInterval, now: number): Promise<void> {
    const token = ++this.candleGeneration
    const current = this.candleStore.getSnapshot()
    this.candleStore.set({ ...current, phase: 'loading', interval, bars: current.bars })
    const window = candleWindow(interval, now)
    let series
    try {
      series = await this.stock.candles({
        thscode,
        interval,
        start: window.start,
        end: window.end,
      })
    } catch (error: unknown) {
      if (token !== this.candleGeneration) return
      this.candleStore.set({ ...current, phase: 'failed', interval, failure: failureCode(error) })
      return
    }
    if (token !== this.candleGeneration) return
    this.candleStore.set({
      phase: 'ready',
      interval,
      bars: series.candles.map(candle => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
      truncated: series.truncated,
    })
  }

  /**
   * Read one document channel for an instrument. Never rejects: a failure is
   * published as a phase and a code, and a superseded read publishes nothing,
   * so switching tabs twice leaves the last requested channel's state.
   * @param name - instrument display name the channel is searched for.
   * @param kind - channel to read.
   * @returns completion of the read.
   */
  async loadDocuments(name: string, kind: DocumentKind): Promise<void> {
    const token = ++this.documentGeneration
    this.documentStore.set({ phase: 'loading', kind })
    let rows
    try {
      rows = await this.stock.documents({ name, kind, size: DOCUMENT_LIMIT })
    } catch (error: unknown) {
      if (token !== this.documentGeneration) return
      this.documentStore.set({ phase: 'failed', kind, failure: failureCode(error) })
      return
    }
    if (token !== this.documentGeneration) return
    this.documentStore.set({ phase: 'ready', kind, rows })
  }

  /**
   * Resolve a name, bare code, or thscode fragment to candidates.
   * @param query - user-facing search text.
   * @returns the candidates, or the Remote failure code the Host answered with.
   */
  async search(query: string): Promise<SearchOutcome> {
    try {
      return { ok: true, matches: await this.stock.searchSymbols(query, SEARCH_LIMIT) }
    } catch (error: unknown) {
      return { ok: false, code: failureCode(error) }
    }
  }

  /** Read one batch for the given list under a read identity. */
  private async loadQuotes(entries: readonly WatchlistEntry[], token: number): Promise<void> {
    const codes = entries.map(entry => entry.thscode)
    if (codes.length === 0) {
      this.quoteStore.set({ phase: 'ready', byCode: {} })
      return
    }
    this.quoteStore.set({ ...this.quoteStore.getSnapshot(), phase: 'loading' })
    let batch
    try {
      batch = await this.stock.quotes(codes)
    } catch (error: unknown) {
      if (token !== this.generation) return
      this.quoteStore.set({ ...this.quoteStore.getSnapshot(), phase: 'failed', failure: failureCode(error) })
      return
    }
    if (token !== this.generation) return
    const byCode: Record<string, Quote> = {}
    for (const quote of batch.quotes) byCode[quote.thscode] = quote
    this.quoteStore.set({
      phase: 'ready',
      byCode,
      ...batch.asOf === undefined ? {} : { asOf: batch.asOf },
    })
  }
}
