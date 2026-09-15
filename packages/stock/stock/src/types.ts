/**
 * Vocabulary for the stock-market data capability seam (`ctx.stock`): the
 * provider contract, the normalized result envelope, and the symbol-resolution
 * result. The provider owns transport and wire normalization; the runtime owns
 * cross-endpoint behavior (registry lookup, parameter validation, symbol
 * resolution, result bounds).
 * @module @deepseek-ai/dsh-stock/types
 */

import type { StockEndpoint, StockParamType } from './registry.ts'

/** One result row after wire normalization, keyed by the vendor's field names. */
export type StockRow = Readonly<Record<string, unknown>>

/** A parameter value the seam accepts for one endpoint argument. */
export type StockParamValue = string | number | boolean

/** Parameters resolved for one call, keyed by wire name. */
export type StockParams = Readonly<Record<string, StockParamValue>>

/**
 * Result metadata that is true for the whole batch. `asOf` is the vendor's own
 * data-readiness timestamp in milliseconds since the Unix epoch
 * (`Asia/Shanghai`), absent when the endpoint returns none.
 */
export interface StockMeta {
  /** Vendor data-readiness timestamp in milliseconds, when the endpoint reports one. */
  readonly asOf?: number
  /** Vendor-reported total row count for the queried set, when it reports one. */
  readonly total?: number
  /** True when the seam dropped or capped rows before returning them. */
  readonly truncated: boolean
  /** Continuation arguments for the next page, present when more rows exist. */
  readonly next?: StockParams
}

/**
 * Outcome of one endpoint call. `rows` preserves the vendor's field names on
 * purpose: 82 capabilities return 82 different row shapes, and inventing a
 * canonical type per shape without a consumer would fix the wrong model. The
 * envelope — bounds, `asOf`, pagination — is normalized.
 */
export interface StockResult {
  /** Capability id the rows came from. */
  readonly endpointId: string
  /** Normalized rows, in vendor order. */
  readonly rows: readonly StockRow[]
  /** Batch-level facts. */
  readonly meta: StockMeta
}

/** One endpoint execution, as handed to a provider. */
export interface StockProviderRequest {
  /** The endpoint being executed; its `params` documents what `params` carries. */
  readonly endpoint: StockEndpoint
  /** Validated parameters, keyed by wire name, with endpoint defaults applied. */
  readonly params: StockParams
  /** Cancellation; a provider must stop in-flight work when it fires. */
  readonly signal: AbortSignal
}

/**
 * One stock data backend. A provider implements transport for the vendor it
 * speaks to and normalizes that vendor's response envelope; it never decides
 * which endpoint exists, which parameters are legal, or how many rows the
 * caller may see.
 */
export interface StockProvider {
  /** Stable provider id, unique among registered providers. */
  readonly id: string
  /**
   * Every capability this provider serves, as registry records. The provider
   * owns the data because the contract is vendor-specific; the runtime owns
   * lookup, validation, and bounds.
   */
  readonly endpoints: readonly StockEndpoint[]
  /** Cheap local usability check; must not make network calls. */
  readonly available: () => boolean
  /** Execute one endpoint; must honor `request.signal`. */
  readonly execute: (request: StockProviderRequest) => Promise<StockResult>
}

/** One resolved instrument. */
export interface SymbolMatch {
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

/** Filters for catalog lookup; omitted fields match everything. */
export interface StockCatalogQuery {
  /** Case-insensitive substring matched against id, tool name, title, and summary. */
  readonly text?: string
  /** Restrict to one vendor universe. */
  readonly universe?: StockEndpoint['universe']
}

/** Narrowing applied to one `resolveSymbols` call. */
export interface SymbolQueryOptions {
  /** Vendor asset-type filter, e.g. `stock`. */
  readonly assetType?: string
  /** Upper bound on returned matches; the seam enforces it. */
  readonly limit?: number
}

/** The wire type of one parameter, exported for provider-side coercion. */
export type { StockParamType }
