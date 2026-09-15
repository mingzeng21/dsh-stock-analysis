import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STOCK_CANCELLED,
  STOCK_MALFORMED_RESPONSE,
  STOCK_NOT_FOUND,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UPSTREAM,
} from '@deepseek-ai/dsh-stock'
import type { StockEndpoint } from '@deepseek-ai/dsh-stock'
import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  HithinkTransport,
  backoffMs,
  retryAfterMs,
  sleepWithSignal,
} from '../src/http.ts'
import type { HithinkTransportOptions } from '../src/http.ts'

const ENDPOINT: StockEndpoint = {
  id: 'a-share.prices.snapshot',
  universe: 'a-share',
  tool: 'stock_quote',
  method: 'GET',
  path: '/api/a-share/prices/snapshot',
  title: 'A股行情快照',
  summary: 'A 股行情快照。',
  params: [],
  availability: 'open',
  paging: 'none',
  window: 'none',
  dateEncoding: 'none',
  source: 'mcp',
}

interface SeenRequest {
  readonly url: string
  readonly apiKey: string | undefined
  readonly accept: string | undefined
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void

let server: Server
let base: string
let handler: Handler
let seen: SeenRequest[]

beforeEach(async () => {
  seen = []
  handler = (_req, res) => { sendJson(res, 200, okBody()) }
  server = createServer((req, res) => {
    seen.push({
      url: req.url ?? '',
      apiKey: header(req, 'x-api-key'),
      accept: header(req, 'accept'),
    })
    handler(req, res)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  base = `http://127.0.0.1:${port}`
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

/** Write one JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** A success envelope body. */
function okBody(): unknown {
  return { code: 0, message: 'success', request_id: 'r-1', data: { timestamp: 1, item: [{ a: 1 }] } }
}

/** Build a transport against the fixture server. */
function transport(overrides: Partial<HithinkTransportOptions> = {}): HithinkTransport {
  return new HithinkTransport({
    baseUrl: base,
    resolveApiKey: () => Promise.resolve('test-key'),
    timeoutMs: 5_000,
    maxAttempts: 3,
    maxConcurrency: 4,
    sleep: () => Promise.resolve(),
    ...overrides,
  })
}

/** The seam code and message of an expected rejection. */
async function rejection(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise
  } catch (error: unknown) {
    return error as { code: string; message: string }
  }
  throw new Error('expected the call to fail')
}

/** A signal that never fires on its own. */
function live(): AbortSignal {
  return new AbortController().signal
}

describe('HithinkTransport request building', () => {
  it('sends the credential header, the accept header, and the built query', async () => {
    const result = await transport().get(ENDPOINT, { thscode: '600519.SH', limit: 100 }, live())
    expect(result.requestId).toBe('r-1')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('/api/a-share/prices/snapshot?thscode=600519.SH&limit=100')
    expect(seen[0]?.apiKey).toBe('test-key')
    expect(seen[0]?.accept).toBe('application/json')
  })

  it('appends no query string when the endpoint declares no argument', async () => {
    await transport().get(ENDPOINT, {}, live())
    expect(seen[0]?.url).toBe('/api/a-share/prices/snapshot')
  })

  it('tolerates a trailing slash on the configured base URL', async () => {
    await transport({ baseUrl: `${base}/` }).get(ENDPOINT, {}, live())
    expect(seen[0]?.url).toBe('/api/a-share/prices/snapshot')
  })

  it('fails as unauthenticated without a resolved API key, before any request', async () => {
    const missing = await rejection(transport({ resolveApiKey: () => Promise.resolve(undefined) }).get(ENDPOINT, {}, live()))
    expect(missing.code).toBe(STOCK_UNAUTHENTICATED)
    const empty = await rejection(transport({ resolveApiKey: () => Promise.resolve('') }).get(ENDPOINT, {}, live()))
    expect(empty.code).toBe(STOCK_UNAUTHENTICATED)
    expect(seen).toHaveLength(0)
  })
})

describe('HithinkTransport availability', () => {
  it('reports an absolute HTTP(S) base URL as usable', () => {
    expect(transport().available()).toBe(true)
    expect(transport({ baseUrl: 'http://example.test' }).available()).toBe(true)
  })

  it('reports a malformed or non-HTTP base URL as unusable', () => {
    expect(transport({ baseUrl: 'not-a-url' }).available()).toBe(false)
    expect(transport({ baseUrl: 'ftp://example.test' }).available()).toBe(false)
  })
})

describe('HithinkTransport retry policy', () => {
  it('retries a business rate-limit code and returns the later success', async () => {
    let calls = 0
    handler = (_req, res) => {
      calls += 1
      if (calls === 1) sendJson(res, 200, { code: 4001, message: 'slow down', data: null })
      else sendJson(res, 200, okBody())
    }
    const sleeps: number[] = []
    const result = await transport({ sleep: (ms) => { sleeps.push(ms); return Promise.resolve() } })
      .get(ENDPOINT, {}, live())
    expect(result.code).toBe(0)
    expect(calls).toBe(2)
    expect(sleeps).toHaveLength(1)
    expect(sleeps[0]).toBeGreaterThanOrEqual(BACKOFF_BASE_MS)
  })

  it('retries an HTTP 429 and honors the Retry-After header', async () => {
    let calls = 0
    handler = (_req, res) => {
      calls += 1
      if (calls === 1) {
        res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '2' })
        res.end(JSON.stringify({ code: 429, message: 'request limit exceeded', data: null }))
      } else sendJson(res, 200, okBody())
    }
    const sleeps: number[] = []
    const result = await transport({ sleep: (ms) => { sleeps.push(ms); return Promise.resolve() } })
      .get(ENDPOINT, {}, live())
    expect(result.code).toBe(0)
    expect(sleeps).toEqual([2_000])
  })

  it('retries both transient upstream codes', async () => {
    for (const code of [5002, 5003]) {
      seen = []
      let calls = 0
      handler = (_req, res) => {
        calls += 1
        if (calls === 1) sendJson(res, 200, { code, message: 'upstream', data: null })
        else sendJson(res, 200, okBody())
      }
      const result = await transport().get(ENDPOINT, {}, live())
      expect(result.code).toBe(0)
      expect(seen).toHaveLength(2)
    }
  })

  it('stops after maxAttempts and reports the last failure', async () => {
    handler = (_req, res) => { sendJson(res, 200, { code: 4001, message: 'slow down', data: null }) }
    const failure = await rejection(transport({ maxAttempts: 2 }).get(ENDPOINT, {}, live()))
    expect(failure.code).toBe(STOCK_RATE_LIMITED)
    expect(seen).toHaveLength(2)
  })

  it('does not retry a hard business failure', async () => {
    handler = (_req, res) => { sendJson(res, 200, { code: 3001, message: 'no such instrument', data: null }) }
    const failure = await rejection(transport().get(ENDPOINT, {}, live()))
    expect(failure.code).toBe(STOCK_NOT_FOUND)
    expect(seen).toHaveLength(1)
  })

  it('does not retry an HTTP failure that carries a success envelope', async () => {
    handler = (_req, res) => { sendJson(res, 503, { code: 0, message: 'success', data: null }) }
    const failure = await rejection(transport().get(ENDPOINT, {}, live()))
    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(seen).toHaveLength(1)
  })
})

describe('HithinkTransport transport failures', () => {
  it('reports a non-JSON body as a malformed response', async () => {
    handler = (_req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('boom') }
    const failure = await rejection(transport().get(ENDPOINT, {}, live()))
    expect(failure.code).toBe(STOCK_MALFORMED_RESPONSE)
    expect(seen).toHaveLength(1)
  })

  it('reports a refused connection as an upstream failure', async () => {
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const { port } = closed.address() as AddressInfo
    await new Promise<void>((resolve) => { closed.close(() => { resolve() }) })
    const failure = await rejection(transport({ baseUrl: `http://127.0.0.1:${String(port)}` }).get(ENDPOINT, {}, live()))
    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(failure.message).toContain('request failed')
  })

  it('describes a non-Error rejection reason', async () => {
    // The subject of this test IS a non-Error rejection reason, which a runtime
    // dependency can produce even though the rule prefers an Error.
    // eslint-disable-next-line typescript/prefer-promise-reject-errors
    vi.stubGlobal('fetch', () => Promise.reject('socket exploded'))
    try {
      const failure = await rejection(transport().get(ENDPOINT, {}, live()))
      expect(failure.code).toBe(STOCK_UPSTREAM)
      expect(failure.message).toContain('socket exploded')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports an exceeded deadline as an upstream failure', async () => {
    handler = () => { /* never respond; the deadline must end the attempt */ }
    const failure = await rejection(transport({ timeoutMs: 30 }).get(ENDPOINT, {}, live()))
    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(failure.message).toContain('deadline')
  })

  it('does not follow a redirect away from the credentialed origin', async () => {
    let targetCalls = 0
    const target = createServer((_req, res) => { targetCalls += 1; sendJson(res, 200, okBody()) })
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
    const targetPort = (target.address() as AddressInfo).port
    try {
      handler = (_req, res) => {
        res.writeHead(302, { location: `http://127.0.0.1:${String(targetPort)}/stolen` })
        res.end()
      }
      const failure = await rejection(transport().get(ENDPOINT, {}, live()))
      expect(failure.code).toBe(STOCK_UPSTREAM)
      expect(targetCalls).toBe(0)
    } finally {
      target.closeAllConnections()
      await new Promise<void>((resolve) => { target.close(() => { resolve() }) })
    }
  })
})

describe('HithinkTransport cancellation', () => {
  it('fails as cancelled when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const failure = await rejection(transport().get(ENDPOINT, {}, controller.signal))
    expect(failure.code).toBe(STOCK_CANCELLED)
    expect(seen).toHaveLength(0)
  })

  it('fails as cancelled when the caller aborts mid-flight', async () => {
    handler = () => { /* hold the response open until the caller gives up */ }
    const controller = new AbortController()
    const pending = rejection(transport().get(ENDPOINT, {}, controller.signal))
    setTimeout(() => { controller.abort() }, 20)
    expect((await pending).code).toBe(STOCK_CANCELLED)
  })
})

describe('HithinkTransport concurrency gate', () => {
  it('keeps at most maxConcurrency requests in flight', async () => {
    let active = 0
    let peak = 0
    handler = (_req, res) => {
      active += 1
      peak = Math.max(peak, active)
      setTimeout(() => {
        active -= 1
        sendJson(res, 200, okBody())
      }, 20)
    }
    const subject = transport({ maxConcurrency: 1 })
    await Promise.all([
      subject.get(ENDPOINT, {}, live()),
      subject.get(ENDPOINT, {}, live()),
    ])
    expect(peak).toBe(1)
    expect(seen).toHaveLength(2)
  })

  it('fails a queued waiter that aborts before it is granted a slot', async () => {
    handler = (_req, res) => {
      setTimeout(() => { sendJson(res, 200, okBody()) }, 60)
    }
    const subject = transport({ maxConcurrency: 1 })
    const first = subject.get(ENDPOINT, {}, live())
    await vi.waitFor(() => { expect(seen).toHaveLength(1) })
    const controller = new AbortController()
    const queued = rejection(subject.get(ENDPOINT, {}, controller.signal))
    // Let the second call pass credential resolution and reach the full gate
    // before aborting, so the abort exercises the queued-waiter path.
    await new Promise<void>((resolve) => { setTimeout(resolve, 10) })
    expect(seen).toHaveLength(1)
    controller.abort()
    expect((await queued).code).toBe(STOCK_CANCELLED)
    expect((await first).code).toBe(0)
  })
})

describe('backoffMs', () => {
  it('honors a vendor-requested delay, capped', () => {
    expect(backoffMs(1, 1_000, () => 0)).toBe(1_000)
    expect(backoffMs(1, BACKOFF_MAX_MS * 2, () => 0)).toBe(BACKOFF_MAX_MS)
  })

  it('doubles the local delay and caps it', () => {
    expect(backoffMs(1, undefined, () => 0)).toBe(BACKOFF_BASE_MS)
    expect(backoffMs(2, undefined, () => 0)).toBe(BACKOFF_BASE_MS * 2)
    expect(backoffMs(9, undefined, () => 0)).toBe(BACKOFF_MAX_MS)
  })

  it('adds jitter below one base delay', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    try {
      expect(backoffMs(1, undefined, Math.random)).toBe(BACKOFF_BASE_MS + Math.floor(0.5 * BACKOFF_BASE_MS))
    } finally {
      spy.mockRestore()
    }
  })
})

describe('retryAfterMs', () => {
  it('reads a numeric header as seconds', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '3' }))).toBe(3_000)
    expect(retryAfterMs(new Headers({ 'retry-after': '0' }))).toBe(0)
  })

  it('reads an HTTP date as a delay from now', () => {
    const value = retryAfterMs(new Headers({ 'retry-after': new Date(Date.now() + 5_000).toUTCString() }))
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(5_000)
  })

  it('ignores an absent or unusable header', () => {
    expect(retryAfterMs(new Headers())).toBeUndefined()
    expect(retryAfterMs(new Headers({ 'retry-after': 'soon' }))).toBeUndefined()
    expect(retryAfterMs(new Headers({ 'retry-after': new Date(Date.now() - 5_000).toUTCString() }))).toBe(0)
  })
})

describe('sleepWithSignal', () => {
  it('resolves after the delay', async () => {
    await expect(sleepWithSignal(1, live())).resolves.toBeUndefined()
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sleepWithSignal(1, controller.signal)).rejects.toMatchObject({ code: STOCK_CANCELLED })
  })

  it('rejects when the signal fires during the delay', async () => {
    const controller = new AbortController()
    const pending = sleepWithSignal(5_000, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: STOCK_CANCELLED })
  })
})
