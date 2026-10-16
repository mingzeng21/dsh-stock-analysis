/**
 * Browser half: the `stockClient` read face over the `stock` Remote namespace.
 *
 * Browser panels call this service instead of the Remote directly, so the
 * package that owns the wire names is also the package that unwraps their
 * results. A failure is thrown as the Gateway's `RemoteError`, whose `code` a
 * caller branches on; nothing here pre-formats a code into copy, because the
 * surface that renders it owns its own locale.
 *
 * The service holds no state and no cache: it is the shape a surface can be
 * handed without also being handed the transport, and per-instrument results
 * are cached by the surface that knows when they go stale.
 * @module @deepseek-ai/dsh-api-stock-controller/client
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
// Merges the generated `stock` namespace into the Client Remote face.
import type {} from '@deepseek-ai/dsh-api-stock-controller/remote'
import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type {
  CandleRequest, CandleSeries, DocumentRow, DocumentsRequest, DragonTigerDashboard,
  HotRankDashboard, HotRankHistory, InstrumentMatch, LimitUpPulseDashboard, QuoteBatch, SectorCatalog, SectorDashboard, SectorMatch,
} from '../types.ts'

export type {
  Candle, CandleAdjust, CandleInterval, CandleRequest, CandleSeries,
  DocumentKind, DocumentRow, DocumentsRequest,
  DragonTigerBoard, DragonTigerBoardType, DragonTigerDashboard, DragonTigerSeat, DragonTigerSeatStock, DragonTigerStock,
  HotRankBoard, HotRankDashboard, HotRankHistory, HotRankPoint, HotRankStock,
  LimitUpPulseDashboard, LimitUpPulseDay, LimitUpPulseLevel, LimitUpPulseStock,
  InstrumentMatch, Quote, QuoteBatch, SectorCatalog, SectorConstituent, SectorDashboard, SectorMatch,
} from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Browser reads over the `stock` Remote namespace. */
    stockClient: IStockClient
  }
}

/** Browser market-data reads, each resolving to a value or throwing a `RemoteError`. */
export interface IStockClient {
  /**
   * Read the latest same-date dragon-tiger boards.
   * @param signal - caller cancellation.
   * @returns all, institution, and hot-money boards.
   */
  dragonTiger(signal?: AbortSignal): Promise<DragonTigerDashboard>
  /**
   * Read current hot-stock and rank-surge lists for both time periods.
   * @param signal - caller cancellation.
   * @returns four separately timestamped lists.
   */
  hotRank(signal?: AbortSignal): Promise<HotRankDashboard>
  /**
   * Read the last 30 calendar days of ranking for one A-share.
   * @param thscode - complete A-share identifier.
   * @param signal - caller cancellation.
   * @returns daily rank points, including ranks beyond the current Top 30.
   */
  hotRankHistory(thscode: string, signal?: AbortSignal): Promise<HotRankHistory>
  /**
   * Read recent closing-limit pools alongside the bounded ladder matrix.
   * @param signal - caller cancellation.
   * @returns chronological observations with incomplete pool days marked.
   */
  limitUpPulse(signal?: AbortSignal): Promise<LimitUpPulseDashboard>
  /**
   * Read concept and industry board entries for name matching.
   * @param signal - caller cancellation.
   * @returns catalog entries and the truncation fact.
   */
  sectors(signal?: AbortSignal): Promise<SectorCatalog>
  /**
   * Read independent current membership and index history observations.
   * @param sector - selected board from the catalog.
   * @param signal - caller cancellation.
   * @returns current constituents and the past 120 calendar days of daily index bars.
   */
  sectorDashboard(sector: SectorMatch, signal?: AbortSignal): Promise<SectorDashboard>
  /**
   * Resolve a name, bare code, or thscode fragment to complete instruments.
   * @param query - user-facing search text.
   * @param limit - desired candidate count; the Host caps it.
   * @param signal - caller cancellation.
   * @returns candidates in vendor order.
   */
  searchSymbols(query: string, limit: number, signal?: AbortSignal): Promise<readonly InstrumentMatch[]>
  /**
   * Read the latest quote for each named instrument in one batched call.
   * @param thscodes - complete thscodes; blanks and duplicates are dropped by the Host.
   * @param signal - caller cancellation.
   * @returns the returned quotes and the batch's data-readiness timestamp.
   */
  quotes(thscodes: readonly string[], signal?: AbortSignal): Promise<QuoteBatch>
  /**
   * Read one instrument's candle series for a window.
   * @param request - instrument, period, adjustment, and the window.
   * @param signal - caller cancellation.
   * @returns bars in ascending time order.
   */
  candles(request: CandleRequest, signal?: AbortSignal): Promise<CandleSeries>
  /**
   * Search one document channel for an instrument.
   * @param request - instrument display name, channel, and desired row count.
   * @param signal - caller cancellation.
   * @returns rows in the gateway's relevance order.
   */
  documents(request: DocumentsRequest, signal?: AbortSignal): Promise<readonly DocumentRow[]>
}

/** Return a successful result's value, or throw the Gateway's failure unchanged. */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

/** Required Client services: the Remote carrier and its generated namespace. */
export const inject = ['remote', 'remote.stock']

/** Browser reads over the Host's stock Remote namespace. */
export class StockClient extends Service implements IStockClient {
  /**
   * @param ctx - Client root context carrying the Remote face.
   * @param namespace - the `stock` namespace bound on this plugin's own
   * context: Cordis replaces `ctx` with the consumer's on a handed-out service,
   * so a method reading `this.ctx` answers to the consumer's injections.
   */
  constructor(ctx: Context, private readonly namespace: TypertRemoteNamespaceMap['stock']) {
    super(ctx, 'stockClient')
  }

  /** {@inheritDoc IStockClient.dragonTiger} */
  async dragonTiger(signal?: AbortSignal): Promise<DragonTigerDashboard> {
    return unwrap(await this.namespace.dragonTiger(signal))
  }

  /** {@inheritDoc IStockClient.hotRank} */
  async hotRank(signal?: AbortSignal): Promise<HotRankDashboard> {
    return unwrap(await this.namespace.hotRank(signal))
  }

  /** {@inheritDoc IStockClient.hotRankHistory} */
  async hotRankHistory(thscode: string, signal?: AbortSignal): Promise<HotRankHistory> {
    return unwrap(await this.namespace.hotRankHistory(thscode, signal))
  }

  /** {@inheritDoc IStockClient.limitUpPulse} */
  async limitUpPulse(signal?: AbortSignal): Promise<LimitUpPulseDashboard> {
    return unwrap(await this.namespace.limitUpPulse(signal))
  }

  /** {@inheritDoc IStockClient.sectors} */
  async sectors(signal?: AbortSignal): Promise<SectorCatalog> {
    return unwrap(await this.namespace.sectors(signal))
  }

  /** {@inheritDoc IStockClient.sectorDashboard} */
  async sectorDashboard(sector: SectorMatch, signal?: AbortSignal): Promise<SectorDashboard> {
    return unwrap(await this.namespace.sectorDashboard(sector, signal))
  }

  /** {@inheritDoc IStockClient.searchSymbols} */
  async searchSymbols(query: string, limit: number, signal?: AbortSignal): Promise<readonly InstrumentMatch[]> {
    return unwrap(await this.namespace.searchSymbols(query, limit, signal))
  }

  /** {@inheritDoc IStockClient.quotes} */
  async quotes(thscodes: readonly string[], signal?: AbortSignal): Promise<QuoteBatch> {
    return unwrap(await this.namespace.quotes([...thscodes], signal))
  }

  /** {@inheritDoc IStockClient.candles} */
  async candles(request: CandleRequest, signal?: AbortSignal): Promise<CandleSeries> {
    return unwrap(await this.namespace.candles(request, signal))
  }

  /** {@inheritDoc IStockClient.documents} */
  async documents(request: DocumentsRequest, signal?: AbortSignal): Promise<readonly DocumentRow[]> {
    return unwrap(await this.namespace.documents(request, signal))
  }
}

/**
 * Client plugin body: publish the read face for this plugin's lifetime.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  new StockClient(ctx, ctx.remote.stock)
}
