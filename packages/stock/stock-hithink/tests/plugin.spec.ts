import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import StockRuntime, { STOCK_UNAUTHENTICATED, STOCK_UNKNOWN_ENDPOINT } from '@deepseek-ai/dsh-stock'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import {
  DSH_LAUNCH_ENVIRONMENT_KEY,
  createLaunchEnvironmentSnapshot,
} from '@deepseek-ai/dsh-launch-environment'
import {
  Config,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  HITHINK_PROVIDER_ID,
  HithinkProvider,
  apply,
} from '../src/index.ts'
import { HithinkTransport } from '../src/http.ts'

/** The plugin shape the Loader would instantiate. */
const PLUGIN = { name: 'stock-hithink', inject: ['stock'], apply }

/** One capability the fixture server answers. */
const SEARCH = 'meta.tickers.search'

/** The vendor's answer for the search endpoint. */
const SEARCH_BODY = {
  code: 0,
  message: 'success',
  request_id: 'req-1',
  data: {
    timestamp: 1_784_275_991_000,
    item: [{ thscode: '300308.SZ', ticker: '300308', name: '中际旭创' }],
  },
}

let server: Server
let base: string
let handler: (req: IncomingMessage, res: ServerResponse) => void
let seenKeys: Array<string | undefined>

beforeEach(async () => {
  seenKeys = []
  handler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(SEARCH_BODY))
  }
  server = createServer((req, res) => {
    const value = req.headers['x-api-key']
    seenKeys.push(Array.isArray(value) ? value[0] : value)
    handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
})

/**
 * Mount the seam and the provider with an environment plane that carries no
 * credential unless a test supplies one.
 * @param config - Provider config, already carrying every field a Loader would default.
 * @param environment - Variables the launch environment supplies.
 * @param credentials - Credential value the seam resolves, when a test mounts one.
 * @returns The context, the provider's fiber, and an optional credentials disposer.
 */
async function mount(
  config: Record<string, unknown>,
  environment: Readonly<Record<string, string>> = {},
  credentials?: string,
): Promise<{ ctx: Context; fiber: Awaited<ReturnType<Context['plugin']>> }> {
  const ctx = new Context()
  await ctx.plugin(StockRuntime)
  ctx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, createLaunchEnvironmentSnapshot([{ source: 'process', values: environment }]))
  if (credentials !== undefined) {
    ctx.provide('credentials', {
      resolve: () => Promise.resolve({ value: credentials, source: 'env' }),
    } as unknown as CredentialProvider)
  }
  const fiber = await ctx.plugin(PLUGIN, config)
  return { ctx, fiber }
}

/** Every field a Loader defaults, for tests that override one of them. */
function defaults(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    baseUrl: base,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    ...overrides,
  }
}

describe('Config', () => {
  it('supplies every default a deployment omits', () => {
    expect(Config({})).toMatchObject({
      apiKeyEnv: DEFAULT_API_KEY_ENV,
      baseUrl: DEFAULT_BASE_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    })
  })

  it('rejects a non-positive attempt or concurrency bound', () => {
    expect(() => Config({ timeoutMs: 0 })).toThrow()
  })
})

describe('stock-hithink provider registration', () => {
  it('registers a provider the seam dispatches to', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    try {
      expect(ctx.stock.catalog()).toHaveLength(79)
      const result = await ctx.stock.call(SEARCH, { q: '中际旭创' })
      expect(result.endpointId).toBe(SEARCH)
      expect(result.rows).toEqual([{ thscode: '300308.SZ', ticker: '300308', name: '中际旭创' }])
      expect(result.meta).toEqual({ asOf: 1_784_275_991_000, truncated: false })
      expect(seenKeys).toEqual(['literal-key'])
    } finally {
      await fiber.dispose()
    }
  })

  it('drops every capability when its fiber is disposed', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    await fiber.dispose()

    // Disposal unregisters the provider itself, so its capabilities leave the
    // catalog and an id it used to serve is unknown rather than unavailable.
    expect(ctx.stock.catalog()).toEqual([])
    const failure = (await ctx.stock.call(SEARCH, { q: 'x' }).catch((error: unknown) => error)) as { code: string }
    expect(failure.code).toBe(STOCK_UNKNOWN_ENDPOINT)
  })
})

describe('stock-hithink credential resolution', () => {
  it('prefers a configured literal key', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }), { [DEFAULT_API_KEY_ENV]: 'from-env' }, 'from-credentials')
    try {
      await ctx.stock.call(SEARCH, { q: 'x' })
      expect(seenKeys).toEqual(['literal-key'])
    } finally {
      await fiber.dispose()
    }
  })

  it('treats an empty literal key as unset', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: '' }), {}, 'from-credentials')
    try {
      await ctx.stock.call(SEARCH, { q: 'x' })
      expect(seenKeys).toEqual(['from-credentials'])
    } finally {
      await fiber.dispose()
    }
  })

  it('resolves through the credential service when one is mounted', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKeyEnv: 'CUSTOM_KEY' }), { CUSTOM_KEY: 'from-env' }, 'from-credentials')
    try {
      await ctx.stock.call(SEARCH, { q: 'x' })
      expect(seenKeys).toEqual(['from-credentials'])
    } finally {
      await fiber.dispose()
    }
  })

  it('falls back to the launch environment without the credential service', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKeyEnv: 'CUSTOM_KEY' }), { CUSTOM_KEY: 'from-env' })
    try {
      await ctx.stock.call(SEARCH, { q: 'x' })
      expect(seenKeys).toEqual(['from-env'])
    } finally {
      await fiber.dispose()
    }
  })

  it('ignores an empty environment value and reports an unauthenticated failure', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKeyEnv: 'CUSTOM_KEY' }), { CUSTOM_KEY: '' })
    try {
      const failure = (await ctx.stock.call(SEARCH, { q: 'x' }).catch((error: unknown) => error)) as { code: string }
      expect(failure.code).toBe(STOCK_UNAUTHENTICATED)
      expect(seenKeys).toEqual([])
    } finally {
      await fiber.dispose()
    }
  })
})

describe('stock-hithink configuration failures', () => {
  it('refuses to mount with a base URL that is not absolute HTTP(S)', async () => {
    const ctx = new Context()
    await ctx.plugin(StockRuntime)
    await expect(ctx.plugin(PLUGIN, defaults({ baseUrl: 'not-a-url' })))
      .rejects.toThrow(/not an absolute HTTP\(S\) URL/)
  })
})

describe('HithinkProvider', () => {
  it('reports its id, registry, and availability from its transport', () => {
    const transport = new HithinkTransport({
      baseUrl: DEFAULT_BASE_URL,
      resolveApiKey: () => Promise.resolve(undefined),
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    })
    const provider = new HithinkProvider(transport)
    expect(provider.id).toBe(HITHINK_PROVIDER_ID)
    expect(provider.endpoints).toHaveLength(79)
    expect(provider.available()).toBe(true)
  })
})
