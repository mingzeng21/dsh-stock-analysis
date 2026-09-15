/**
 * The plugin entry: its shape, its configuration, credential precedence, and the
 * one path a caller actually takes — `ctx.stock.call(...)` through the real seam
 * into the real transport against a local gateway fixture.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import StockRuntime, { STOCK_UNAUTHENTICATED, STOCK_UNKNOWN_ENDPOINT } from '@deepseek-ai/dsh-stock'
import type { StockEndpoint, StockProvider } from '@deepseek-ai/dsh-stock'
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import {
  DSH_LAUNCH_ENVIRONMENT_KEY,
  createLaunchEnvironmentSnapshot,
} from '@deepseek-ai/dsh-launch-environment'
import * as iwencai from '../src/index.ts'
import {
  Config,
  DEFAULT_API_KEY_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  IWENCAI_ENDPOINTS,
  IWENCAI_PROVIDER_ID,
  apply,
  inject,
  name,
} from '../src/index.ts'

/** The plugin shape the Loader would instantiate. */
const PLUGIN = { name: 'stock-iwencai', inject: ['stock'], apply }

/** The document-search capability under test. */
const SEARCH = 'iwencai.search.announcement'

/** The natural-language capability under test. */
const QUERY = 'iwencai.research.astock-selector'

let server: Server
let base: string
let handler: (req: IncomingMessage, res: ServerResponse) => void
let seenKeys: Array<string | undefined>

beforeEach(async () => {
  seenKeys = []
  handler = (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status_code: 0, data: [{ title: '公告' }], total: 1 }))
  }
  server = createServer((req, res) => {
    seenKeys.push(header(req, 'authorization'))
    handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
})

/** Read one request header as a plain string. */
function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Mount the seam and the provider with an environment plane carrying no
 * credential unless a test supplies one.
 * @param config - Provider config, already carrying every field a Loader would default.
 * @param environment - Variables the launch environment supplies.
 * @param credentials - Credential value the seam resolves, when a test mounts one.
 * @returns The context and the provider's fiber.
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

/** The seam code of an expected rejection. */
async function rejection(promise: Promise<unknown>): Promise<{ code: string }> {
  try {
    await promise
  } catch (error: unknown) {
    return error as { code: string }
  }
  throw new Error('expected the call to fail')
}

describe('stock-iwencai plugin shape', () => {
  it('publishes the named plugin contract and no default export', () => {
    expect(name).toBe('stock-iwencai')
    expect(inject).toEqual(['stock'])
    expect(typeof apply).toBe('function')
    expect('default' in iwencai).toBe(false)
    expect(IWENCAI_PROVIDER_ID).toBe('iwencai')
  })

  it('supplies every default a deployment omits', () => {
    expect(Config({})).toMatchObject({
      apiKeyEnv: DEFAULT_API_KEY_ENV,
      baseUrl: DEFAULT_BASE_URL,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    })
  })
})

describe('stock-iwencai registration', () => {
  it('registers exactly the generated capabilities on the seam', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    try {
      const registered = ctx.stock.catalog().map(entry => entry.id).sort()
      expect(registered).toEqual(IWENCAI_ENDPOINTS.map(entry => entry.id).sort())
      expect(registered).toHaveLength(15)
    } finally {
      await fiber.dispose()
    }
  })

  it('drops every capability when its fiber is disposed', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    await fiber.dispose()

    expect(ctx.stock.catalog()).toEqual([])
    const failure = await rejection(ctx.stock.call(SEARCH, { query: 'x' }))
    expect(failure.code).toBe(STOCK_UNKNOWN_ENDPOINT)
  })

  it('refuses a gateway origin that is not an absolute HTTP(S) URL', async () => {
    await expect(mount(defaults({ apiKey: 'k', baseUrl: 'ftp://gateway.test' })))
      .rejects.toThrow(/baseUrl must be an absolute HTTP\(S\) URL/)
  })

  it('tolerates a trailing slash on the configured origin', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key', baseUrl: `${base}/` }))
    try {
      await ctx.stock.call(SEARCH, { query: 'x', size: 1 })
      expect(seenKeys).toEqual(['Bearer literal-key'])
    } finally {
      await fiber.dispose()
    }
  })
})

describe('stock-iwencai credential resolution', () => {
  it('prefers a configured literal key over every other source', async () => {
    const { ctx, fiber } = await mount(
      defaults({ apiKey: 'literal-key' }),
      { [DEFAULT_API_KEY_ENV]: 'from-env' },
      'from-credentials',
    )
    try {
      await ctx.stock.call(SEARCH, { query: 'x', size: 1 })
      expect(seenKeys).toEqual(['Bearer literal-key'])
    } finally {
      await fiber.dispose()
    }
  })

  it('resolves the credential seam when no literal key is configured', async () => {
    const { ctx, fiber } = await mount(defaults(), {}, 'from-credentials')
    try {
      await ctx.stock.call(SEARCH, { query: 'x', size: 1 })
      expect(seenKeys).toEqual(['Bearer from-credentials'])
    } finally {
      await fiber.dispose()
    }
  })

  it('falls back to the launch environment when the credential seam is absent', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKeyEnv: 'CUSTOM_KEY' }), { CUSTOM_KEY: 'from-env' })
    try {
      await ctx.stock.call(SEARCH, { query: 'x', size: 1 })
      expect(seenKeys).toEqual(['Bearer from-env'])
    } finally {
      await fiber.dispose()
    }
  })

  it('reports an unauthenticated failure when no source carries a key', async () => {
    const { ctx, fiber } = await mount(defaults())
    try {
      const failure = await rejection(ctx.stock.call(SEARCH, { query: 'x', size: 1 }))
      expect(failure.code).toBe(STOCK_UNAUTHENTICATED)
    } finally {
      await fiber.dispose()
    }
  })

  it('ignores an empty environment value just as it ignores a missing one', async () => {
    const { ctx, fiber } = await mount(defaults({ apiKeyEnv: 'CUSTOM_KEY' }), { CUSTOM_KEY: '' })
    try {
      const failure = await rejection(ctx.stock.call(SEARCH, { query: 'x', size: 1 }))
      expect(failure.code).toBe(STOCK_UNAUTHENTICATED)
      expect(seenKeys).toEqual([])
    } finally {
      await fiber.dispose()
    }
  })
})

describe('stock-iwencai end-to-end calls', () => {
  it('carries a document search from the seam back to the caller', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        status_code: 0,
        status_msg: 'OK',
        total: 42,
        data: [{ title: '中际旭创：海外监管公告', summary: '摘要', url: 'https://example.test/a.pdf' }],
      }))
    }
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    try {
      const result = await ctx.stock.call(SEARCH, { query: '中际旭创 公告', size: 5 })

      expect(result.endpointId).toBe(SEARCH)
      expect(result.rows).toEqual([
        { title: '中际旭创：海外监管公告', summary: '摘要', url: 'https://example.test/a.pdf' },
      ])
      expect(result.meta).toEqual({ total: 42, truncated: false })
      expect(seenKeys).toEqual(['Bearer literal-key'])
    } finally {
      await fiber.dispose()
    }
  })

  it('carries a natural-language query from the seam back to the caller', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        status_code: 0,
        status_msg: 'OK',
        row_count: 28,
        code_count: 1,
        datas: [{ 股票代码: '603353.SH', 股票简称: '和顺石油', '涨停[20260915]': true }],
      }))
    }
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    try {
      const result = await ctx.stock.call(QUERY, { query: '今日涨停的A股', page: 1, limit: 5 })

      expect(result.endpointId).toBe(QUERY)
      expect(result.rows).toEqual([{ 股票代码: '603353.SH', 股票简称: '和顺石油', '涨停[20260915]': true }])
      expect(result.meta).toEqual({ total: 28, truncated: false })
    } finally {
      await fiber.dispose()
    }
  })

  it('reports a gateway version refusal to the caller unchanged', async () => {
    handler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'text/plain' })
      res.end('当前 Skill 版本过低，本次请求无法执行。')
    }
    const { ctx, fiber } = await mount(defaults({ apiKey: 'literal-key' }))
    try {
      const failure = await rejection(ctx.stock.call(SEARCH, { query: 'x', size: 1 }))
      expect(failure.code).toBe(STOCK_UNAUTHENTICATED)
    } finally {
      await fiber.dispose()
    }
  })
})

describe('stock-iwencai identity guard', () => {
  it('refuses a capability the identity table does not cover', async () => {
    // The seam only routes to endpoints a provider publishes, so this guard is
    // reachable only by handing the provider an endpoint directly. A stand-in
    // seam captures the provider the plugin registers; the provider's own code
    // is what runs.
    const ctx = new Context()
    let provider: StockProvider | undefined
    ctx.provide('stock', {
      register: (candidate: StockProvider) => {
        provider = candidate
        return () => undefined
      },
    } as unknown as StockRuntime)
    apply(ctx, defaults({ apiKey: 'literal-key' }))

    const registered = provider
    if (registered === undefined) throw new Error('fixture: the plugin registered no provider')
    const foreign: StockEndpoint = { ...IWENCAI_ENDPOINTS[0]!, id: 'iwencai.search.foreign' }

    await expect(registered.execute({ endpoint: foreign, params: { query: 'x' }, signal: new AbortController().signal }))
      .rejects.toThrow(/no gateway identity is registered for "iwencai\.search\.foreign"/)
  })
})
