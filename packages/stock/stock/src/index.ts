/**
 * Service Definition for the stock-market data capability seam (`ctx.stock`):
 * a provider registry plus the cross-endpoint behavior every consumer needs —
 * catalog lookup, parameter validation, bounded results, and symbol
 * disambiguation. Transport and wire normalization belong to a provider.
 * @module @deepseek-ai/dsh-stock
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  STOCK_CANCELLED,
  STOCK_CAPABILITY_CLOSED,
  STOCK_DUPLICATE_ENDPOINT,
  STOCK_DUPLICATE_PROVIDER,
  STOCK_PROVIDER_CONFIGURED_MISSING,
  STOCK_PROVIDER_UNAVAILABLE,
  STOCK_UNKNOWN_ENDPOINT,
  StockError,
} from './error.ts'
import { resolveParams } from './params.ts'
import type { StockEndpoint } from './registry.ts'
import type {
  StockCatalogQuery,
  StockProvider,
  StockResult,
  StockRow,
  SymbolMatch,
  SymbolQueryOptions,
} from './types.ts'

export {
  STOCK_CANCELLED,
  STOCK_CAPABILITY_CLOSED,
  STOCK_DUPLICATE_ENDPOINT,
  STOCK_DUPLICATE_PROVIDER,
  STOCK_FORBIDDEN,
  STOCK_INVALID_PARAMS,
  STOCK_MALFORMED_RESPONSE,
  STOCK_NOT_FOUND,
  STOCK_NO_DATA,
  STOCK_PROVIDER_CONFIGURED_MISSING,
  STOCK_PROVIDER_UNAVAILABLE,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UNKNOWN_ENDPOINT,
  STOCK_UNSUPPORTED_ASSET,
  STOCK_UPSTREAM,
  StockError,
} from './error.ts'
export { nextPage } from './paging.ts'
export { resolveParams } from './params.ts'
export type {
  StockAvailability,
  StockDateEncoding,
  StockEndpoint,
  StockPaging,
  StockParam,
  StockParamType,
  StockUniverse,
  StockWindow,
} from './registry.ts'
export type {
  StockCatalogQuery,
  StockMeta,
  StockParams,
  StockParamValue,
  StockProvider,
  StockProviderRequest,
  StockResult,
  StockRow,
  SymbolMatch,
  SymbolQueryOptions,
} from './types.ts'

/** Capability id of the cross-market symbol search the seam resolves names through. */
export const SYMBOL_SEARCH_ENDPOINT = 'meta.tickers.search'

/** Default cap on rows one call returns; a deployment tunes it through config. */
export const DEFAULT_MAX_ROWS = 500

/** Default lifetime of one cached symbol lookup, in milliseconds. */
export const DEFAULT_SYMBOL_CACHE_TTL_MS = 300_000

declare module '@deepseek-ai/cordis' {
  interface Context {
    stock: StockRuntime
  }
}

/** Config for the stock seam. */
export interface StockRuntimeConfig {
  /** Restrict the seam to this provider id. Omitted = every registered usable provider takes part. */
  readonly provider?: string
  /** Upper bound on rows one call returns before the result is marked truncated. */
  readonly maxRows?: number
  /** Lifetime of a cached symbol lookup, in milliseconds. */
  readonly symbolCacheTtlMs?: number
}

/** One cached symbol lookup. */
interface SymbolCacheEntry {
  readonly at: number
  readonly matches: readonly SymbolMatch[]
}

/**
 * The stock data service, registered as `ctx.stock`.
 *
 * Capabilities from every registered usable provider form one catalog, and a
 * call routes to the provider that registered the capability id. A configured
 * `provider` restricts the seam to that one provider. Capability ids are unique
 * across providers, which registration enforces, so routing never depends on
 * registration order.
 */
export class StockRuntime extends Service {
  /** Deployment config: provider selection, row bound, and symbol-cache lifetime. */
  static Config: z<StockRuntimeConfig> = z.object({
    provider: z.string(),
    maxRows: z.number().default(DEFAULT_MAX_ROWS),
    symbolCacheTtlMs: z.number().default(DEFAULT_SYMBOL_CACHE_TTL_MS),
  })

  private readonly providers = new Map<string, StockProvider>()
  private readonly providerId: string | undefined
  private readonly maxRows: number
  private readonly symbolCacheTtlMs: number
  private readonly symbolCache = new Map<string, SymbolCacheEntry>()

  /**
   * @param ctx - owning context; the service registers as `ctx.stock`.
   * @param config - provider selection and bounds; every field is defaulted by {@link StockRuntime.Config}.
   */
  constructor(ctx: Context, config: StockRuntimeConfig = {}) {
    super(ctx, 'stock')
    this.providerId = config.provider
    this.maxRows = config.maxRows ?? DEFAULT_MAX_ROWS
    this.symbolCacheTtlMs = config.symbolCacheTtlMs ?? DEFAULT_SYMBOL_CACHE_TTL_MS
  }

  /**
   * Register a provider.
   *
   * Throws {@link StockError} `STOCK_DUPLICATE_PROVIDER` when its id is taken,
   * and `STOCK_DUPLICATE_ENDPOINT` when any capability id it serves is already
   * registered by another provider: a capability id is the handle callers and
   * feature code write down, so two owners would make it ambiguous. The
   * registration unwinds with the calling fiber.
   *
   * @param provider - the provider; its `id` is the registry key.
   * @returns the disposer that unregisters it.
   */
  register(provider: StockProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new StockError(`a stock provider with id "${provider.id}" is already registered`, STOCK_DUPLICATE_PROVIDER)
    }
    for (const existing of this.providers.values()) {
      const taken = new Set(existing.endpoints.map(endpoint => endpoint.id))
      const clash = provider.endpoints.find(endpoint => taken.has(endpoint.id))
      if (clash !== undefined) {
        throw new StockError(
          `stock capability "${clash.id}" is already served by provider "${existing.id}"`,
          STOCK_DUPLICATE_ENDPOINT,
        )
      }
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'stock.register()')
    return () => void dispose()
  }

  /**
   * List registry records matching a query, across every usable provider.
   * @param query - optional text and universe filters.
   * @returns matching endpoints, ordered by provider registration then registry order.
   */
  catalog(query: StockCatalogQuery = {}): readonly StockEndpoint[] {
    const needle = query.text?.toLowerCase()
    return this.candidateProviders().flatMap(provider => provider.endpoints).filter((endpoint) => {
      if (query.universe !== undefined && endpoint.universe !== query.universe) return false
      if (needle === undefined || needle === '') return true
      return (
        endpoint.id.toLowerCase().includes(needle) ||
        endpoint.tool.toLowerCase().includes(needle) ||
        endpoint.title.toLowerCase().includes(needle) ||
        endpoint.summary.toLowerCase().includes(needle)
      )
    })
  }

  /**
   * Execute one capability. Arguments are validated against the registry record
   * before any request is issued, and the row count is bounded before the
   * result reaches a caller.
   *
   * The capability's owning provider is found by registry record, not by
   * provider selection: several vendors answer different capabilities through
   * the same seam, and an id belongs to exactly one of them.
   *
   * @param endpointId - capability id from {@link StockRuntime.catalog}.
   * @param params - untrusted arguments, normally model-authored.
   * @param signal - optional cancellation forwarded to the provider.
   * @returns normalized rows plus batch facts.
   */
  async call(endpointId: string, params: Readonly<Record<string, unknown>> = {}, signal?: AbortSignal): Promise<StockResult> {
    const { provider, endpoint } = this.ownerOf(endpointId)
    if (endpoint.availability === 'unavailable') {
      throw new StockError(
        `stock capability "${endpointId}" is published by the vendor but not open to external access`,
        STOCK_CAPABILITY_CLOSED,
      )
    }
    const resolved = resolveParams(endpoint, params)
    if (signal?.aborted === true) {
      throw new StockError(`stock capability "${endpointId}" was cancelled before dispatch`, STOCK_CANCELLED)
    }
    const result = await provider.execute({
      endpoint,
      params: resolved,
      signal: signal ?? new AbortController().signal,
    })
    return this.capRows(result)
  }

  /**
   * Resolve a company name, bare code, or thscode fragment to complete
   * instruments. Results are cached per query for `symbolCacheTtlMs`, because
   * disambiguation is a prerequisite for nearly every other call.
   * @param query - user-facing text, e.g. `中际旭创` or `300308`.
   * @param options - asset-type filter and result bound.
   * @returns matches in vendor order, capped to `options.limit`.
   */
  async resolveSymbols(query: string, options: SymbolQueryOptions = {}): Promise<readonly SymbolMatch[]> {
    const key = `${options.assetType ?? ''}\u0000${query}`
    const cached = this.symbolCache.get(key)
    if (cached !== undefined && Date.now() - cached.at < this.symbolCacheTtlMs) {
      return this.capMatches(cached.matches, options.limit)
    }
    const result = await this.call(SYMBOL_SEARCH_ENDPOINT, {
      q: query,
      ...options.assetType === undefined ? {} : { asset_type: options.assetType },
      limit: options.limit ?? DEFAULT_MAX_ROWS,
    })
    const matches = result.rows.map(toSymbolMatch).filter((match): match is SymbolMatch => match !== undefined)
    this.symbolCache.set(key, { at: Date.now(), matches })
    return this.capMatches(matches, options.limit)
  }

  /** Apply the configured row bound, flagging the result when it dropped rows. */
  private capRows(result: StockResult): StockResult {
    if (result.rows.length <= this.maxRows) return result
    return { ...result, rows: result.rows.slice(0, this.maxRows), meta: { ...result.meta, truncated: true } }
  }

  /** Apply a caller's match bound. */
  private capMatches(matches: readonly SymbolMatch[], limit: number | undefined): readonly SymbolMatch[] {
    if (limit === undefined || matches.length <= limit) return matches
    return matches.slice(0, limit)
  }

  /**
   * Providers a call or a catalog listing may use.
   *
   * A configured `provider` restricts the seam to that one, which is how a
   * deployment pins a vendor for tests or for a single-vendor product. Without
   * one, every registered provider that reports itself usable takes part: the
   * seam routes by capability ownership, so serving several vendors needs no
   * selection rule.
   */
  private candidateProviders(): readonly StockProvider[] {
    const configured = this.providerId
    if (configured !== undefined) {
      const provider = this.providers.get(configured)
      if (provider === undefined) {
        throw new StockError(`configured stock provider "${configured}" is not registered`, STOCK_PROVIDER_CONFIGURED_MISSING)
      }
      if (!provider.available()) {
        throw new StockError(`configured stock provider "${configured}" is registered but unavailable`, STOCK_PROVIDER_UNAVAILABLE)
      }
      return [provider]
    }
    return [...this.providers.values()].filter(provider => provider.available())
  }

  /**
   * Find the provider and registry record that serve one capability.
   *
   * A capability whose provider is registered but currently unusable is
   * reported as such rather than as unknown: the caller's mistake (a bad id)
   * and the deployment's (a missing credential) need different fixes. A
   * capability outside the configured provider's scope is unknown, because the
   * configuration deliberately removed it from this seam.
   */
  private ownerOf(endpointId: string): { provider: StockProvider; endpoint: StockEndpoint } {
    for (const provider of this.candidateProviders()) {
      const endpoint = provider.endpoints.find(candidate => candidate.id === endpointId)
      if (endpoint !== undefined) return { provider, endpoint }
    }
    const unavailable = [...this.providers.values()].find(provider =>
      !provider.available() && provider.endpoints.some(endpoint => endpoint.id === endpointId))
    if (unavailable !== undefined) {
      throw new StockError(
        `stock capability "${endpointId}" is served by provider "${unavailable.id}", which is unavailable`,
        STOCK_PROVIDER_UNAVAILABLE,
      )
    }
    throw new StockError(`unknown stock capability "${endpointId}"`, STOCK_UNKNOWN_ENDPOINT)
  }
}

/**
 * Project one vendor row onto {@link SymbolMatch}. Returns `undefined` for a row
 * without a usable thscode, which the vendor emits for records it cannot
 * resolve; a malformed row must not fail the whole lookup.
 */
function toSymbolMatch(row: StockRow): SymbolMatch | undefined {
  const thscode = row.thscode
  if (typeof thscode !== 'string' || thscode === '') return undefined
  // The vendor's own ticker wins; otherwise strip the market suffix. A thscode
  // without a dot is legal input here — the vendor emits over-the-counter and
  // index codes whose suffix is not an exchange.
  const dot = thscode.indexOf('.')
  const bare = dot < 0 ? thscode : thscode.slice(0, dot)
  const ticker = typeof row.ticker === 'string' && row.ticker !== '' ? row.ticker : bare
  const name = typeof row.name === 'string' ? row.name : ''
  const assetType = typeof row.asset_type === 'string' ? row.asset_type : undefined
  const exchange = typeof row.exchange === 'string' ? row.exchange : undefined
  return {
    thscode,
    ticker,
    name,
    ...assetType === undefined ? {} : { assetType },
    ...exchange === undefined ? {} : { exchange },
  }
}

export default StockRuntime
