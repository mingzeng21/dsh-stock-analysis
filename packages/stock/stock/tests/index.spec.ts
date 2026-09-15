/**
 * `StockRuntime` owns provider registration, capability routing, catalog
 * filtering, the row bound, and symbol disambiguation. These cases pin each
 * registration rule, each routing outcome, and each branch of the filtering and
 * caching behavior, using in-memory providers so the suite stays keyless.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import StockRuntime, {
  DEFAULT_MAX_ROWS,
  DEFAULT_SYMBOL_CACHE_TTL_MS,
  STOCK_CANCELLED,
  STOCK_CAPABILITY_CLOSED,
  STOCK_DUPLICATE_ENDPOINT,
  STOCK_DUPLICATE_PROVIDER,
  STOCK_PROVIDER_CONFIGURED_MISSING,
  STOCK_PROVIDER_UNAVAILABLE,
  STOCK_UNKNOWN_ENDPOINT,
  SYMBOL_SEARCH_ENDPOINT,
  type StockEndpoint,
  type StockRow,
  type StockRuntimeConfig,
} from '@deepseek-ai/dsh-stock'
import { codeOf, errorOf, makeEndpoint, makeProvider, mountStock } from './support.ts'

const QUOTE = makeEndpoint()

const FUND = makeEndpoint({
  id: 'fund.profile.detail',
  universe: 'fund',
  tool: 'fund_profile_detail',
  path: '/api/fund/profile/detail',
  title: '基金基本资料',
  summary: '查询基金基本资料。',
})

/** A second a-share record, for the union-ordering case. */
const QUOTE_SIBLING = makeEndpoint({
  id: 'a-share.prices.historical',
  tool: 'stock_kline',
  path: '/api/a-share/prices/historical',
  title: '历史K线',
  summary: '取单只标的的历史 K 线。',
})

/** The cross-market search record `resolveSymbols` dispatches through. */
function symbolEndpoint(): StockEndpoint {
  return makeEndpoint({
    id: SYMBOL_SEARCH_ENDPOINT,
    universe: 'meta',
    tool: 'stock_symbol_search',
    path: '/api/meta/tickers/search',
    title: '标的检索',
    summary: '按 thscode / ticker / 名称检索标的。',
    params: [
      { name: 'q', type: 'string', required: true, description: '' },
      { name: 'asset_type', type: 'string', required: false, description: '' },
      { name: 'limit', type: 'integer', required: false, description: '' },
    ],
  })
}

/** One vendor-shaped search row. */
function symbolRow(overrides: StockRow = {}): StockRow {
  return { thscode: '300308.SZ', ticker: '300308', name: '中际旭创', asset_type: 'stock', exchange: 'SZ', ...overrides }
}

/** Mount a runtime whose only provider answers symbol search with `rows`. */
async function mountWithSymbols(rows: readonly StockRow[], config: StockRuntimeConfig = {}) {
  const mounted = await mountStock(config)
  const stub = makeProvider({
    endpoints: [symbolEndpoint()],
    respond: request => ({ endpointId: request.endpoint.id, rows, meta: { truncated: false } }),
  })
  mounted.stock.register(stub.provider)
  return { ...mounted, requests: stub.calls }
}

describe('module constants', () => {
  it('pins the symbol-search capability id and both defaults', () => {
    expect(SYMBOL_SEARCH_ENDPOINT).toBe('meta.tickers.search')
    expect(DEFAULT_MAX_ROWS).toBe(500)
    expect(DEFAULT_SYMBOL_CACHE_TTL_MS).toBe(300_000)
  })
})

describe('StockRuntime construction', () => {
  it('defaults the row bound and the symbol-cache lifetime without config', async () => {
    // Mounting through `ctx.plugin` has schemastery fill every default before
    // the constructor runs, so the constructor's own fallbacks are reachable
    // only on direct construction — the path an embedder takes.
    const ctx = new Context()
    const stock = new StockRuntime(ctx)

    const stub = makeProvider({
      endpoints: [QUOTE, symbolEndpoint()],
      respond: request => ({
        endpointId: request.endpoint.id,
        rows: request.endpoint.id === SYMBOL_SEARCH_ENDPOINT
          ? [symbolRow()]
          : Array.from({ length: DEFAULT_MAX_ROWS + 1 }, (_value, index) => ({ index })),
        meta: { truncated: false },
      }),
    })
    stock.register(stub.provider)

    const result = await stock.call(QUOTE.id)
    expect(result.rows).toHaveLength(DEFAULT_MAX_ROWS)
    expect(result.meta.truncated).toBe(true)

    await stock.resolveSymbols('中际旭创')
    await stock.resolveSymbols('中际旭创')
    // The quote call plus one symbol search: the second lookup is cached, which
    // is the observable consequence of a non-zero default lifetime.
    expect(stub.calls).toHaveLength(2)
  })
})

describe('StockRuntime registration', () => {
  it('registers a provider and drops its capabilities when the disposer runs', async () => {
    const { stock } = await mountStock()
    const stub = makeProvider({ endpoints: [QUOTE] })

    const dispose = stock.register(stub.provider)
    expect(stock.catalog()).toEqual([QUOTE])

    dispose()
    // A disposed provider takes its capabilities with it: the id is no longer
    // served, which is a different failure from a registered-but-unusable one.
    expect(stock.catalog()).toEqual([])
    expect(await codeOf(() => stock.call(QUOTE.id))).toBe(STOCK_UNKNOWN_ENDPOINT)
  })

  it('rejects a duplicate provider id', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'stub' }).provider)
    expect(() => stock.register(makeProvider({ id: 'stub' }).provider))
      .toThrow(expect.objectContaining({ code: STOCK_DUPLICATE_PROVIDER }))
  })

  it('rejects a capability another provider already serves', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'first', endpoints: [QUOTE] }).provider)

    const failure = errorOf(() => stock.register(makeProvider({ id: 'second', endpoints: [QUOTE] }).provider))
    expect(failure?.code).toBe(STOCK_DUPLICATE_ENDPOINT)
    // The fix is to rename one of the two, so the message has to name both the
    // clashing capability and the provider that already owns it.
    expect(failure?.message).toContain(QUOTE.id)
    expect(failure?.message).toContain('first')
  })

  it('accepts a second provider whose capabilities do not clash', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'first', endpoints: [QUOTE] }).provider)
    stock.register(makeProvider({ id: 'second', endpoints: [FUND] }).provider)
    expect(stock.catalog()).toEqual([QUOTE, FUND])
  })
})

describe('StockRuntime provider routing', () => {
  it('restricts the catalog to the configured provider', async () => {
    const { stock } = await mountStock({ provider: 'chosen' })
    stock.register(makeProvider({ id: 'other', endpoints: [FUND] }).provider)
    stock.register(makeProvider({ id: 'chosen', endpoints: [QUOTE] }).provider)

    expect(stock.catalog()).toEqual([QUOTE])
  })

  it('reports a configured provider that was never registered', async () => {
    const { stock } = await mountStock({ provider: 'ghost' })
    expect(await codeOf(() => stock.catalog())).toBe(STOCK_PROVIDER_CONFIGURED_MISSING)
  })

  it('reports a configured provider that is registered but unusable', async () => {
    const { stock } = await mountStock({ provider: 'stub' })
    stock.register(makeProvider({ id: 'stub', available: false }).provider)
    expect(await codeOf(() => stock.catalog())).toBe(STOCK_PROVIDER_UNAVAILABLE)
  })

  it('lists nothing when no provider is registered', async () => {
    const { stock } = await mountStock()
    expect(stock.catalog()).toEqual([])
  })

  it('lists nothing while every registered provider is unusable', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'down', available: false, endpoints: [FUND] }).provider)
    expect(stock.catalog()).toEqual([])
  })

  it('unions every usable provider in registration order', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'first', endpoints: [QUOTE, FUND] }).provider)
    stock.register(makeProvider({ id: 'second', endpoints: [QUOTE_SIBLING] }).provider)

    // Registration order decides the concatenation; each provider keeps its own
    // registry order inside its slice.
    expect(stock.catalog()).toEqual([QUOTE, FUND, QUOTE_SIBLING])
  })

  it('skips the capabilities of an unusable provider in the union', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'down', available: false, endpoints: [FUND] }).provider)
    stock.register(makeProvider({ id: 'up', endpoints: [QUOTE] }).provider)

    expect(stock.catalog()).toEqual([QUOTE])
  })

  it('filters the union by text and universe', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ id: 'first', endpoints: [QUOTE] }).provider)
    stock.register(makeProvider({ id: 'second', endpoints: [FUND] }).provider)

    expect(stock.catalog({ text: 'a-share.prices' })).toEqual([QUOTE])
    expect(stock.catalog({ universe: 'fund' })).toEqual([FUND])
  })
})

describe('StockRuntime dispatch', () => {
  it('routes each capability to the provider that owns it', async () => {
    const { stock } = await mountStock()
    const quotes = makeProvider({ id: 'quotes', endpoints: [QUOTE] })
    const funds = makeProvider({ id: 'funds', endpoints: [FUND] })
    stock.register(quotes.provider)
    stock.register(funds.provider)

    await stock.call(QUOTE.id)
    await stock.call(FUND.id)

    // Ownership, not registration order, decides where a call lands.
    expect(quotes.calls.map(request => request.endpoint.id)).toEqual([QUOTE.id])
    expect(funds.calls.map(request => request.endpoint.id)).toEqual([FUND.id])
  })

  it('dispatches through the only usable provider that owns the capability', async () => {
    const { stock } = await mountStock()
    const quotes = makeProvider({ id: 'quotes', endpoints: [QUOTE] })
    stock.register(makeProvider({ id: 'down', available: false, endpoints: [FUND] }).provider)
    stock.register(quotes.provider)

    await stock.call(QUOTE.id)
    expect(quotes.calls).toHaveLength(1)
  })

  it('names the owning provider when it is registered but unusable', async () => {
    const { stock } = await mountStock()
    const down = makeProvider({ id: 'down', available: false, endpoints: [FUND] })
    stock.register(down.provider)
    stock.register(makeProvider({ id: 'up', endpoints: [QUOTE] }).provider)

    const failure = await stock.call(FUND.id).catch((error: unknown) => error) as { code?: string; message?: string }
    expect(failure.code).toBe(STOCK_PROVIDER_UNAVAILABLE)
    // A missing credential and a bad id need different fixes, so the message has
    // to point at the provider rather than claim the capability does not exist.
    expect(failure.message).toContain('down')
    expect(down.calls).toHaveLength(0)
  })

  it('refuses another provider\'s capability when one provider is configured', async () => {
    const { stock } = await mountStock({ provider: 'chosen' })
    const chosen = makeProvider({ id: 'chosen', endpoints: [QUOTE] })
    const other = makeProvider({ id: 'other', endpoints: [FUND] })
    stock.register(chosen.provider)
    stock.register(other.provider)

    // A capability outside the configured provider is out of scope: the caller
    // sees an unknown id, not a claim that the other provider is unusable.
    expect(await codeOf(() => stock.call(FUND.id))).toBe(STOCK_UNKNOWN_ENDPOINT)
    expect(other.calls).toHaveLength(0)
    await expect(stock.call(QUOTE.id)).resolves.toMatchObject({ endpointId: QUOTE.id })
  })
})

describe('StockRuntime catalog', () => {
  /** A runtime exposing both fixture endpoints. */
  async function mounted(): Promise<Awaited<ReturnType<typeof mountStock>>> {
    const mounted = await mountStock()
    mounted.stock.register(makeProvider({ endpoints: [QUOTE, FUND] }).provider)
    return mounted
  }

  it('returns every record when no query is given', async () => {
    const { stock } = await mounted()
    expect(stock.catalog()).toEqual([QUOTE, FUND])
  })

  it('treats an empty text filter as no filter', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ text: '' })).toEqual([QUOTE, FUND])
  })

  it('matches the text filter against the capability id', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ text: 'a-share.prices' })).toEqual([QUOTE])
  })

  it('matches the text filter against the tool name', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ text: 'fund_profile_detail' })).toEqual([FUND])
  })

  it('matches the text filter against the title', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ text: '基金基本资料' })).toEqual([FUND])
  })

  it('matches the text filter against the summary', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ text: '获取' })).toEqual([QUOTE])
  })

  it('returns nothing when the text filter matches no field', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ text: 'zzz' })).toEqual([])
  })

  it('filters by universe', async () => {
    const { stock } = await mounted()
    expect(stock.catalog({ universe: 'fund' })).toEqual([FUND])
  })
})

describe('StockRuntime call', () => {
  it('rejects a capability id that is not in the registry', async () => {
    const { stock } = await mountStock()
    stock.register(makeProvider({ endpoints: [QUOTE] }).provider)
    expect(await codeOf(() => stock.call('nope'))).toBe(STOCK_UNKNOWN_ENDPOINT)
  })

  it('rejects a capability the vendor does not expose externally', async () => {
    const closed = makeEndpoint({ id: 'a-share.capital-flow.snapshot', availability: 'unavailable' })
    const { stock } = await mountStock()
    const stub = makeProvider({ endpoints: [closed] })
    stock.register(stub.provider)

    expect(await codeOf(() => stock.call(closed.id))).toBe(STOCK_CAPABILITY_CLOSED)
    expect(stub.calls).toHaveLength(0)
  })

  it('refuses to dispatch an already-aborted call without touching the provider', async () => {
    const { stock } = await mountStock()
    const stub = makeProvider({ endpoints: [QUOTE] })
    stock.register(stub.provider)

    expect(await codeOf(() => stock.call(QUOTE.id, {}, AbortSignal.abort()))).toBe(STOCK_CANCELLED)
    expect(stub.calls).toHaveLength(0)
  })

  it('supplies a live signal when the caller passes none', async () => {
    const { stock } = await mountStock()
    const stub = makeProvider({ endpoints: [QUOTE] })
    stock.register(stub.provider)

    await stock.call(QUOTE.id)
    expect(stub.calls[0]?.signal.aborted).toBe(false)
  })

  it('returns the provider result after validating the arguments', async () => {
    const endpoint = makeEndpoint({
      id: 'a-share.prices.snapshot',
      params: [{ name: 'limit', type: 'integer', required: false, description: '' }],
    })
    const { stock } = await mountStock()
    const stub = makeProvider({
      endpoints: [endpoint],
      respond: request => ({
        endpointId: request.endpoint.id,
        rows: [{ sent: request.params.limit }],
        meta: { truncated: false },
      }),
    })
    stock.register(stub.provider)

    await expect(stock.call(endpoint.id, { limit: '10' })).resolves.toEqual({
      endpointId: endpoint.id,
      rows: [{ sent: 10 }],
      meta: { truncated: false },
    })
  })
})

describe('StockRuntime row bound', () => {
  /** Mount a runtime returning `count` rows through one endpoint. */
  async function withRows(count: number, config: StockRuntimeConfig = {}) {
    const endpoint = makeEndpoint({ id: 'a-share.prices.snapshot' })
    const mounted = await mountStock(config)
    const stub = makeProvider({
      endpoints: [endpoint],
      respond: request => ({
        endpointId: request.endpoint.id,
        rows: Array.from({ length: count }, (_value, index) => ({ index })),
        meta: { truncated: false },
      }),
    })
    mounted.stock.register(stub.provider)
    return { ...mounted, endpoint }
  }

  it('returns a result within the bound unchanged', async () => {
    const { stock, endpoint } = await withRows(3, { maxRows: 10 })
    const result = await stock.call(endpoint.id)
    expect(result.rows).toHaveLength(3)
    expect(result.meta.truncated).toBe(false)
  })

  it('truncates to the configured bound and flags the result', async () => {
    const { stock, endpoint } = await withRows(5, { maxRows: 2 })
    const result = await stock.call(endpoint.id)
    expect(result.rows).toEqual([{ index: 0 }, { index: 1 }])
    expect(result.meta.truncated).toBe(true)
  })

  it('truncates to the default bound when config omits one', async () => {
    const { stock, endpoint } = await withRows(DEFAULT_MAX_ROWS + 1)
    const result = await stock.call(endpoint.id)
    expect(result.rows).toHaveLength(DEFAULT_MAX_ROWS)
    expect(result.meta.truncated).toBe(true)
  })
})

describe('StockRuntime resolveSymbols', () => {
  it('maps every documented field onto a match', async () => {
    const { stock } = await mountWithSymbols([symbolRow()])
    expect(await stock.resolveSymbols('中际旭创')).toEqual([
      { thscode: '300308.SZ', ticker: '300308', name: '中际旭创', assetType: 'stock', exchange: 'SZ' },
    ])
  })

  it('drops rows the vendor could not resolve', async () => {
    const { stock } = await mountWithSymbols([
      symbolRow(),
      { ticker: '000001', name: '无代码' },
      { thscode: '', ticker: '000001' },
    ])
    expect(await stock.resolveSymbols('x')).toHaveLength(1)
  })

  it('derives a missing ticker from the thscode prefix', async () => {
    const { stock } = await mountWithSymbols([{ thscode: '600519.SH' }])
    expect(await stock.resolveSymbols('贵州茅台')).toEqual([{ thscode: '600519.SH', ticker: '600519', name: '' }])
  })

  it('keeps a dotless thscode whole when deriving the ticker', async () => {
    // Over-the-counter and index codes carry no exchange suffix, so stripping
    // everything after the first dot must not truncate them to nothing.
    const { stock } = await mountWithSymbols([{ thscode: 'ABC' }])
    expect(await stock.resolveSymbols('ABC')).toEqual([{ thscode: 'ABC', ticker: 'ABC', name: '' }])
  })

  it('prefers the vendor ticker over the thscode prefix', async () => {
    const { stock } = await mountWithSymbols([{ thscode: '600519.SH', ticker: '519' }])
    expect(await stock.resolveSymbols('贵州茅台')).toEqual([{ thscode: '600519.SH', ticker: '519', name: '' }])
  })

  it('omits an absent asset type and exchange rather than inventing them', async () => {
    const { stock } = await mountWithSymbols([symbolRow({ asset_type: null, exchange: null, name: 7 })])
    expect(await stock.resolveSymbols('x')).toEqual([{ thscode: '300308.SZ', ticker: '300308', name: '' }])
  })

  it('serves a repeated query from cache without dispatching again', async () => {
    const mounted = await mountWithSymbols([symbolRow()])
    const first = await mounted.stock.resolveSymbols('中际旭创')
    const second = await mounted.stock.resolveSymbols('中际旭创')

    expect(second).toEqual(first)
    expect(mounted.requests).toHaveLength(1)
  })

  it('re-dispatches once the cached entry outlives its lifetime', async () => {
    const mounted = await mountWithSymbols([symbolRow()], { symbolCacheTtlMs: 0 })
    await mounted.stock.resolveSymbols('中际旭创')
    await mounted.stock.resolveSymbols('中际旭创')

    expect(mounted.requests).toHaveLength(2)
  })

  it('keeps results for different asset-type filters apart', async () => {
    const mounted = await mountWithSymbols([symbolRow()])
    await mounted.stock.resolveSymbols('中际旭创')
    await mounted.stock.resolveSymbols('中际旭创', { assetType: 'fund' })

    expect(mounted.requests).toHaveLength(2)
  })

  it('truncates matches to the caller limit', async () => {
    const { stock } = await mountWithSymbols([symbolRow(), symbolRow({ thscode: '600519.SH' })])
    expect(await stock.resolveSymbols('x', { limit: 1 })).toHaveLength(1)
  })

  it('returns every match when no limit is given', async () => {
    const { stock } = await mountWithSymbols([symbolRow(), symbolRow({ thscode: '600519.SH' })])
    expect(await stock.resolveSymbols('x')).toHaveLength(2)
  })

  it('forwards the asset-type filter only when the caller supplies one', async () => {
    const mounted = await mountWithSymbols([symbolRow()])
    await mounted.stock.resolveSymbols('中际旭创')
    await mounted.stock.resolveSymbols('中际旭创', { assetType: 'fund' })

    expect(mounted.requests.map(request => request.params)).toEqual([
      { q: '中际旭创', limit: DEFAULT_MAX_ROWS },
      { q: '中际旭创', asset_type: 'fund', limit: DEFAULT_MAX_ROWS },
    ])
  })
})
