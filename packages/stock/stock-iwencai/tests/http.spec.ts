/**
 * The gateway transport: the skill identity headers it must send, the two
 * request bodies, its retry and concurrency policy, and the cancellation and
 * redirect rules that keep a credentialed request from being forwarded.
 *
 * Everything here runs against a local fixture server bound to an ephemeral
 * port, so the suite is keyless and cannot collide with a concurrently running
 * spec.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STOCK_CANCELLED,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UPSTREAM,
} from '@deepseek-ai/dsh-stock'
import type { StockEndpoint } from '@deepseek-ai/dsh-stock'
import { IWENCAI_CAPABILITIES, IWENCAI_ENDPOINTS_BY_ID } from '../src/catalog/generated.ts'
import type { IwencaiCapability } from '../src/catalog/generated.ts'
import { IwencaiTransport, type IwencaiTransportOptions } from '../src/http.ts'
import { Config } from '../src/index.ts'

/** One capability plus the registry record it belongs to. */
interface Pair {
  readonly endpoint: StockEndpoint
  readonly capability: IwencaiCapability
}

/** Look one capability up in both generated tables. */
function pair(id: string): Pair {
  const endpoint = IWENCAI_ENDPOINTS_BY_ID.get(id)
  const capability = IWENCAI_CAPABILITIES.get(id)
  if (endpoint === undefined || capability === undefined) throw new Error(`fixture: no capability "${id}"`)
  return { endpoint, capability }
}

const SEARCH = pair('iwencai.search.announcement')
const QUERY = pair('iwencai.research.astock-selector')

/** One request as the fixture server observed it. */
interface SeenRequest {
  readonly url: string
  readonly method: string | undefined
  readonly authorization: string | undefined
  readonly contentType: string | undefined
  readonly callType: string | undefined
  readonly skillId: string | undefined
  readonly skillVersion: string | undefined
  readonly pluginId: string | undefined
  readonly pluginVersion: string | undefined
  readonly traceId: string | undefined
  readonly body: string
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void

let server: Server
let base: string
let handler: Handler
let seen: SeenRequest[]
let delayMs: number
let inFlight: number
let maxInFlight: number

beforeEach(async () => {
  seen = []
  delayMs = 0
  inFlight = 0
  maxInFlight = 0
  handler = (_req, res) => { sendJson(res, 200, { status_code: 0, data: [{ ok: true }], total: 1 }) }
  server = createServer((req, res) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      seen.push({
        url: req.url ?? '',
        method: req.method,
        authorization: header(req, 'authorization'),
        contentType: header(req, 'content-type'),
        callType: header(req, 'x-claw-call-type'),
        skillId: header(req, 'x-claw-skill-id'),
        skillVersion: header(req, 'x-claw-skill-version'),
        pluginId: header(req, 'x-claw-plugin-id'),
        pluginVersion: header(req, 'x-claw-plugin-version'),
        traceId: header(req, 'x-claw-trace-id'),
        body: Buffer.concat(chunks).toString('utf8'),
      })
      const respond = (): void => {
        try {
          handler(req, res)
        } finally {
          inFlight -= 1
        }
      }
      if (delayMs > 0) setTimeout(respond, delayMs)
      else respond()
    })
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

/** Write one JSON response. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Build a transport against the fixture server. */
function transport(overrides: Partial<IwencaiTransportOptions> = {}): IwencaiTransport {
  return new IwencaiTransport({
    baseUrl: base,
    timeoutMs: 5_000,
    maxAttempts: 3,
    maxConcurrency: 4,
    resolveApiKey: () => Promise.resolve('test-key'),
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

/** A port nothing is listening on, so a connection is refused. */
async function deadBase(): Promise<string> {
  const probe = createServer()
  await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
  const port = (probe.address() as AddressInfo).port
  probe.closeAllConnections()
  await new Promise<void>((resolve) => { probe.close(() => { resolve() }) })
  return `http://127.0.0.1:${String(port)}`
}

describe('IwencaiTransport request building', () => {
  it('sends the skill identity headers and the document-search body', async () => {
    await transport().post(SEARCH.endpoint, { query: '贵州茅台 分红公告', size: 5 }, SEARCH.capability, live())

    expect(seen).toHaveLength(1)
    const request = seen[0]!
    expect(request.url).toBe('/v1/comprehensive/search')
    expect(request.method).toBe('POST')
    expect(request.authorization).toBe('Bearer test-key')
    expect(request.contentType).toBe('application/json')
    expect(request.callType).toBe('normal')
    expect(request.skillId).toBe('announcement-search')
    expect(request.skillVersion).toBe('1.0.0')
    expect(request.pluginId).toBe('none')
    expect(request.pluginVersion).toBe('none')
    expect(request.traceId).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.parse(request.body)).toEqual({
      query: '贵州茅台 分红公告',
      channels: ['announcement'],
      app_id: 'AIME_SKILL',
      size: 5,
    })
  })

  it('sends the natural-language body and that capability own identity', async () => {
    await transport().post(QUERY.endpoint, { query: '今日涨幅居前的A股', page: 2, limit: 5 }, QUERY.capability, live())

    const request = seen[0]!
    expect(request.url).toBe('/v1/query2data')
    expect(request.skillId).toBe('hithink-astock-selector')
    expect(JSON.parse(request.body)).toEqual({
      query: '今日涨幅居前的A股',
      page: 2,
      limit: 5,
      is_cache: '1',
    })
  })

  it('mints a fresh trace id per request', async () => {
    await transport().post(SEARCH.endpoint, { query: 'a', size: 1 }, SEARCH.capability, live())
    await transport().post(SEARCH.endpoint, { query: 'b', size: 1 }, SEARCH.capability, live())

    expect(seen).toHaveLength(2)
    expect(seen[0]!.traceId).toMatch(/^[0-9a-f]{64}$/)
    expect(seen[0]!.traceId).not.toBe(seen[1]!.traceId)
  })

  it('fails as unauthenticated without a resolved key, before any request', async () => {
    const missing = await rejection(
      transport({ resolveApiKey: () => Promise.resolve(undefined) })
        .post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
    )

    expect(missing.code).toBe(STOCK_UNAUTHENTICATED)
    expect(seen).toEqual([])
  })
})

describe('IwencaiTransport retry policy', () => {
  it('retries a throttled attempt and returns the recovered payload', async () => {
    let calls = 0
    handler = (_req, res) => {
      calls += 1
      if (calls === 1) {
        res.writeHead(429, { 'content-type': 'text/plain' })
        res.end('slow down')
        return
      }
      sendJson(res, 200, { status_code: 0, datas: [{ recovered: true }], code_count: 1 })
    }

    const payload = await transport({ maxAttempts: 2 })
      .post(QUERY.endpoint, { query: 'x', page: 1, limit: 1 }, QUERY.capability, live())

    expect(payload.statusCode).toBe(0)
    expect(seen).toHaveLength(2)
  })

  it('reports throttling when the attempts run out', async () => {
    handler = (_req, res) => {
      res.writeHead(429, { 'content-type': 'text/plain' })
      res.end('slow down')
    }

    const failure = await rejection(
      transport({ maxAttempts: 2 }).post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
    )

    expect(failure.code).toBe(STOCK_RATE_LIMITED)
    expect(seen).toHaveLength(2)
  })

  it('retries a server fault and reports it as upstream when it persists', async () => {
    handler = (_req, res) => {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('gateway exploded')
    }

    const failure = await rejection(
      transport({ maxAttempts: 2 }).post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
    )

    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(failure.message).toContain('gateway exploded')
    expect(seen).toHaveLength(2)
  })

  it('does not retry a credential refusal', async () => {
    handler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'text/plain' })
      res.end('当前 Skill 版本过低')
    }

    const failure = await rejection(
      transport().post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
    )

    expect(failure.code).toBe(STOCK_UNAUTHENTICATED)
    expect(failure.message).toContain('当前 Skill 版本过低')
    expect(seen).toHaveLength(1)
  })

  it('wraps an unreachable gateway as upstream without retrying when the budget is one', async () => {
    const failure = await rejection(
      transport({ baseUrl: await deadBase(), maxAttempts: 1 })
        .post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
    )

    expect(failure.code).toBe(STOCK_UPSTREAM)
    expect(failure.message).toContain('问财 gateway request failed')
  })

  it('repeats a transport failure until the attempt budget is spent', async () => {
    const failure = await rejection(
      transport({ baseUrl: await deadBase(), maxAttempts: 2 })
        .post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
    )

    expect(failure.code).toBe(STOCK_UPSTREAM)
  })

  it('rejects a non-positive or fractional transport budget at activation', () => {
    expect(() => Config({ maxAttempts: 0 })).toThrow()
    expect(() => Config({ timeoutMs: 0 })).toThrow()
    expect(() => Config({ maxConcurrency: 1.5 })).toThrow()
  })

  it('describes a non-Error rejection reason', async () => {
    // A transport failure that is not an Error is exactly the case the message
    // builder guards; a runtime dependency can produce one.
    // eslint-disable-next-line typescript/prefer-promise-reject-errors
    vi.stubGlobal('fetch', () => Promise.reject('socket exploded'))
    try {
      const failure = await rejection(
        transport({ maxAttempts: 1 }).post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
      )

      expect(failure.code).toBe(STOCK_UPSTREAM)
      expect(failure.message).toContain('socket exploded')
    } finally {
      vi.unstubAllGlobals()
    }
  })

})

describe('IwencaiTransport cancellation', () => {
  it('fails as cancelled when the signal is already aborted, before any request', async () => {
    const controller = new AbortController()
    controller.abort()

    const failure = await rejection(
      transport().post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, controller.signal),
    )

    expect(failure.code).toBe(STOCK_CANCELLED)
    expect(seen).toEqual([])
  })

  it('fails as cancelled when the signal aborts during the retry backoff', async () => {
    handler = (_req, res) => {
      res.writeHead(429, { 'content-type': 'text/plain' })
      res.end('slow down')
    }
    const controller = new AbortController()
    const call = transport({ maxAttempts: 2 })
      .post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, controller.signal)

    // The first attempt has answered, so the transport is inside its backoff.
    await vi.waitFor(() => { expect(seen).toHaveLength(1) })
    await new Promise(resolve => setTimeout(resolve, 50))
    controller.abort()

    const failure = await rejection(call)
    expect(failure.code).toBe(STOCK_CANCELLED)
    expect(seen).toHaveLength(1)
  })

  it('fails as cancelled when the signal aborts while waiting for a slot', async () => {
    delayMs = 200
    const transportUnderTest = transport({ maxConcurrency: 1, maxAttempts: 1 })
    const occupying = transportUnderTest
      .post(SEARCH.endpoint, { query: 'first', size: 1 }, SEARCH.capability, live())
    await vi.waitFor(() => { expect(seen).toHaveLength(1) })

    const controller = new AbortController()
    const queued = transportUnderTest
      .post(QUERY.endpoint, { query: 'second', page: 1, limit: 1 }, QUERY.capability, controller.signal)
    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort()

    const failure = await rejection(queued)
    expect(failure.code).toBe(STOCK_CANCELLED)
    // The queued call never reached the gateway.
    expect(seen).toHaveLength(1)

    await occupying
  })
})

describe('IwencaiTransport concurrency and redirects', () => {
  it('never exceeds the configured in-flight cap', async () => {
    delayMs = 25
    const transportUnderTest = transport({ maxConcurrency: 1 })

    await Promise.all([
      transportUnderTest.post(SEARCH.endpoint, { query: 'a', size: 1 }, SEARCH.capability, live()),
      transportUnderTest.post(SEARCH.endpoint, { query: 'b', size: 1 }, SEARCH.capability, live()),
    ])

    expect(seen).toHaveLength(2)
    expect(maxInFlight).toBe(1)
  })

  it('does let a wider cap overlap, which is what the fixture measures', async () => {
    delayMs = 25
    const transportUnderTest = transport({ maxConcurrency: 4 })

    await Promise.all([
      transportUnderTest.post(SEARCH.endpoint, { query: 'a', size: 1 }, SEARCH.capability, live()),
      transportUnderTest.post(SEARCH.endpoint, { query: 'b', size: 1 }, SEARCH.capability, live()),
    ])

    expect(maxInFlight).toBe(2)
  })

  it('does not follow a redirect away from the credentialed origin', async () => {
    let targetHits = 0
    const target = createServer((_req, res) => {
      targetHits += 1
      res.end('should never be reached')
    })
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
    const targetBase = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
    handler = (_req, res) => {
      res.writeHead(302, { location: `${targetBase}/exfiltrate` })
      res.end()
    }

    try {
      const failure = await rejection(
        transport({ maxAttempts: 1 }).post(SEARCH.endpoint, { query: 'x', size: 1 }, SEARCH.capability, live()),
      )

      expect(failure.code).toBe(STOCK_UPSTREAM)
      expect(targetHits).toBe(0)
    } finally {
      target.closeAllConnections()
      await new Promise<void>((resolve) => { target.close(() => { resolve() }) })
    }
  })
})
