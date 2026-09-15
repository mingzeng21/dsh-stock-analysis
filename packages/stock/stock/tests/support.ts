/**
 * Shared fixtures for the stock seam's unit tests: a minimal registry record, a
 * scripted in-memory provider, and the mounting helper. No vendor contract is
 * involved, so these suites stay keyless and offline.
 */

import { Context } from '@deepseek-ai/cordis'
import StockRuntime, {
  type StockEndpoint,
  type StockProvider,
  type StockProviderRequest,
  type StockResult,
  type StockRuntimeConfig,
} from '@deepseek-ai/dsh-stock'

/** Build one registry record, overriding only the fields a test cares about. */
export function makeEndpoint(overrides: Partial<StockEndpoint> = {}): StockEndpoint {
  return {
    id: 'a-share.prices.snapshot',
    universe: 'a-share',
    tool: 'stock_quote',
    method: 'GET',
    path: '/api/a-share/prices/snapshot',
    title: 'A股行情快照',
    summary: '获取 A 股行情快照。',
    params: [],
    availability: 'open',
    paging: 'none',
    window: 'none',
    dateEncoding: 'none',
    source: 'mcp',
    ...overrides,
  }
}

/** A successful result carrying no rows. */
export function emptyResult(endpointId: string): StockResult {
  return { endpointId, rows: [], meta: { truncated: false } }
}

/** A provider plus the requests it received, for cache and dispatch assertions. */
export interface StubProvider {
  /** The provider to register. */
  readonly provider: StockProvider
  /** Every request the provider was asked to execute, in order. */
  readonly calls: StockProviderRequest[]
}

/** Script one provider; an omitted `respond` resolves to an empty result. */
export function makeProvider(options: {
  id?: string
  available?: boolean
  endpoints?: readonly StockEndpoint[]
  respond?: (request: StockProviderRequest) => StockResult | Promise<StockResult>
} = {}): StubProvider {
  const calls: StockProviderRequest[] = []
  const provider: StockProvider = {
    id: options.id ?? 'stub',
    endpoints: options.endpoints ?? [makeEndpoint()],
    available: () => options.available ?? true,
    execute: async (request) => {
      calls.push(request)
      if (options.respond === undefined) return emptyResult(request.endpoint.id)
      return await options.respond(request)
    },
  }
  return { provider, calls }
}

/** Mount a `StockRuntime` on a fresh root context with the given config. */
export async function mountStock(config: StockRuntimeConfig = {}): Promise<{ ctx: Context; stock: StockRuntime }> {
  const ctx = new Context()
  await ctx.plugin(StockRuntime, config)
  return { ctx, stock: ctx.stock }
}

/**
 * Run one call and report its seam error code, or `no-throw` when it resolved.
 * Asserting on the code rather than the message is the contract consumers use.
 */
export async function codeOf(run: () => unknown): Promise<string> {
  try {
    await run()
  } catch (error: unknown) {
    return String((error as { code?: unknown }).code)
  }
  return 'no-throw'
}

/**
 * Run one synchronous operation and report the error it threw, or `undefined`
 * when it returned. Registration is synchronous and fails by throwing, so a
 * code-only probe cannot also inspect the message that names the conflicting id.
 */
export function errorOf(run: () => unknown): { readonly code?: string; readonly message?: string } | undefined {
  try {
    run()
  } catch (error: unknown) {
    return error as { readonly code?: string; readonly message?: string }
  }
  return undefined
}
