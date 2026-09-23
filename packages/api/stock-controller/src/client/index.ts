/**
 * Browser half: the `stockClient` read face over the `stock` Remote namespace.
 *
 * The watchlist panel calls this service instead of the Remote directly, so the
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
  CandleRequest, CandleSeries, DocumentRow, DocumentsRequest, InstrumentMatch, QuoteBatch,
} from '../types.ts'

export type {
  Candle, CandleAdjust, CandleInterval, CandleRequest, CandleSeries,
  DocumentKind, DocumentRow, DocumentsRequest,
  InstrumentMatch, Quote, QuoteBatch,
} from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Browser reads over the `stock` Remote namespace. */
    stockClient: IStockClient
  }
}

/** The reads the watchlist panel performs, each resolving to a value or throwing a `RemoteError`. */
export interface IStockClient {
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
