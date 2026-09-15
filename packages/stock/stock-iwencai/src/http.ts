/**
 * Transport for the 问财 gateway.
 *
 * Every request carries the gateway's skill identity headers. The gateway
 * refuses a request without `X-Claw-Skill-Id` outright — measured: it answers
 * `401` with "当前 Skill 版本过低" for a request with no identity header at all,
 * while any value of that header is accepted, including a skill the store does
 * not publish. The provider therefore sends the identity that matches the
 * capability, which is both the documented contract and what survives the
 * gateway tightening the rule.
 * @module @deepseek-ai/dsh-stock-iwencai/http
 */

import { randomBytes } from 'node:crypto'
import type { StockEndpoint, StockParams } from '@deepseek-ai/dsh-stock'
import { StockError, STOCK_CANCELLED, STOCK_UNAUTHENTICATED, STOCK_UPSTREAM } from '@deepseek-ai/dsh-stock'
import type { IwencaiCapability } from './catalog/generated.ts'
import { isRetryable, readEnvelope, type IwencaiPayload } from './envelope.ts'

/** Application identity the vendor's own skills send. */
const APP_ID = 'AIME_SKILL'

/**
 * Value of the vendor's cache switch. Its own skill client always sends `1`, and
 * the gateway documents nothing further, so it is a protocol constant rather
 * than a deployment setting.
 */
const IS_CACHE = '1'

/** Transport configuration resolved once at plugin activation. */
export interface IwencaiTransportOptions {
  /** Gateway origin, without a trailing slash. */
  readonly baseUrl: string
  /** Per-attempt deadline in milliseconds. */
  readonly timeoutMs: number
  /** Total attempts for one call, including the first. */
  readonly maxAttempts: number
  /** Cap on in-flight requests. */
  readonly maxConcurrency: number
  /** Resolve the credential for one call; `undefined` means it is not configured. */
  readonly resolveApiKey: () => Promise<string | undefined>
}

/** Build the request body one capability's family expects. */
function requestBody(capability: IwencaiCapability, params: StockParams): Record<string, unknown> {
  if (capability.family === 'search') {
    return {
      query: params.query,
      channels: [capability.channel],
      app_id: APP_ID,
      size: params.size,
    }
  }
  return { query: params.query, page: params.page, limit: params.limit, is_cache: IS_CACHE }
}

/** Wait for a backoff interval, aborting early when the call is cancelled. */
async function backoff(attempt: number, signal: AbortSignal): Promise<void> {
  const delay = Math.min(250 * 2 ** (attempt - 1), 4_000) + Math.floor(Math.random() * 100)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new StockError('问财 request was cancelled during backoff', STOCK_CANCELLED))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Sends 问财 gateway requests under a per-call deadline, a concurrency cap, and
 * a bounded retry policy.
 */
export class IwencaiTransport {
  /** In-flight request count, bounded by {@link IwencaiTransportOptions.maxConcurrency}. */
  private active = 0

  /** Callers parked until an in-flight slot frees, in arrival order. */
  private readonly waiting = new Set<() => void>()

  /**
   * @param options - resolved transport policy; see {@link IwencaiTransportOptions}.
   */
  constructor(private readonly options: IwencaiTransportOptions) {}

  /**
   * Send one capability request.
   * @param endpoint - Capability being called.
   * @param params - Validated parameters, after defaults.
   * @param capability - Gateway identity and request family for that capability.
   * @param signal - Caller cancellation.
   * @returns the parsed gateway payload.
   */
  async post(
    endpoint: StockEndpoint,
    params: StockParams,
    capability: IwencaiCapability,
    signal: AbortSignal,
  ): Promise<IwencaiPayload> {
    const apiKey = await this.options.resolveApiKey()
    if (apiKey === undefined) {
      throw new StockError('问财 gateway has no API key; configure IWENCAI_API_KEY', STOCK_UNAUTHENTICATED)
    }
    const body = JSON.stringify(requestBody(capability, params))
    // Every iteration either returns, throws, or continues with a higher
    // attempt, and the final attempt always returns or throws, so the loop
    // cannot fall through.
    for (let attempt = 1; ; attempt += 1) {
      if (signal.aborted) {
        throw new StockError('问财 request was cancelled before dispatch', STOCK_CANCELLED)
      }
      const last = attempt >= this.options.maxAttempts
      let httpStatus: number
      let text: string
      try {
        const response = await this.attempt(endpoint, body, capability, apiKey, signal)
        httpStatus = response.status
        text = await response.text()
      } catch (error: unknown) {
        if (!last && !(error instanceof StockError)) {
          await backoff(attempt, signal)
          continue
        }
        if (error instanceof StockError) throw error
        const message = error instanceof Error ? error.message : String(error)
        throw new StockError(`问财 gateway request failed: ${message}`, STOCK_UPSTREAM, { cause: error })
      }
      if (isRetryable(httpStatus) && !last) {
        await backoff(attempt, signal)
        continue
      }
      return readEnvelope(httpStatus, text)
    }
  }

  /** Run one HTTP attempt under a slot and a deadline. */
  private async attempt(
    endpoint: StockEndpoint,
    body: string,
    capability: IwencaiCapability,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const release = await this.acquire(signal)
    try {
      const deadline = AbortSignal.timeout(this.options.timeoutMs)
      const combined = AbortSignal.any([signal, deadline])
      return await fetch(`${this.options.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Claw-Call-Type': 'normal',
          'X-Claw-Skill-Id': capability.skillId,
          'X-Claw-Skill-Version': capability.skillVersion,
          'X-Claw-Plugin-Id': 'none',
          'X-Claw-Plugin-Version': 'none',
          'X-Claw-Trace-Id': randomBytes(32).toString('hex'),
        },
        body,
        // The request carries a credential, so a redirect must never forward it.
        redirect: 'error',
        signal: combined,
      })
    } finally {
      release()
    }
  }

  /**
   * Wait for a concurrency slot; rejects when the call is cancelled first.
   *
   * The caller checks `signal.aborted` immediately before this runs and awaits
   * nothing in between, so an already-aborted signal cannot reach here: the only
   * cancellation this handles is one that arrives while parked.
   */
  private async acquire(signal: AbortSignal): Promise<() => void> {
    if (this.active < this.options.maxConcurrency) {
      this.active += 1
      return () => {
        this.release()
      }
    }
    await new Promise<void>((resolve, reject) => {
      const grant = (): void => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }
      const onAbort = (): void => {
        // `grant` is still parked: it removes this listener before returning,
        // and the listener fires at most once, so an abort that reaches this
        // handler is one that ran first.
        this.waiting.delete(grant)
        reject(new StockError('问财 request was cancelled while waiting for a slot', STOCK_CANCELLED))
      }
      this.waiting.add(grant)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    this.active += 1
    return () => {
      this.release()
    }
  }

  /** Release one slot and hand it to the oldest waiter. */
  private release(): void {
    this.active -= 1
    const next = this.waiting.values().next()
    if (next.done === true) return
    this.waiting.delete(next.value)
    next.value()
  }
}
