/**
 * HTTP transport for the Hithink provider: one credentialed, bounded, retrying
 * GET per capability call. It owns the wire policy the seam deliberately leaves
 * to a provider — API-key header placement, per-attempt deadline, redirect
 * rejection, a concurrency gate, and the backoff schedule — and hands back a
 * parsed envelope for {@link module:@deepseek-ai/dsh-stock-hithink/envelope} to
 * classify.
 * @module @deepseek-ai/dsh-stock-hithink/http
 */

import {
  STOCK_CANCELLED,
  STOCK_UNAUTHENTICATED,
  STOCK_UPSTREAM,
  StockError,
} from '@deepseek-ai/dsh-stock'
import type { StockEndpoint, StockParams } from '@deepseek-ai/dsh-stock'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { classify, isRetryable, readEnvelope, type StockEnvelope } from './envelope.ts'
import { buildQuery } from './query.ts'

/** Deadline code that separates this transport's timeout from an outer cancellation. */
export const STOCK_TIMEOUT_CODE = 'STOCK_TIMEOUT'

/** First retry delay in milliseconds; each further retry doubles it. */
export const BACKOFF_BASE_MS = 250

/** Ceiling on any single retry delay, including a vendor-requested one. */
export const BACKOFF_MAX_MS = 5_000

/** One completed HTTP round trip, before the vendor's business code is judged. */
interface Attempt {
  /** HTTP status. */
  readonly status: number
  /** Parsed vendor envelope. */
  readonly envelope: StockEnvelope
  /** Vendor-requested delay, when the response carried a usable `Retry-After`. */
  readonly retryAfterMs: number | undefined
}

/** Resolved transport policy. Every value comes from plugin config or a caller's signal. */
export interface HithinkTransportOptions {
  /** Vendor origin, without a trailing slash requirement. */
  readonly baseUrl: string
  /** Resolve the API key for one call; `undefined` fails the call as unauthenticated. */
  readonly resolveApiKey: () => Promise<string | undefined>
  /** Per-attempt deadline in milliseconds. */
  readonly timeoutMs: number
  /** Total attempts for one call, including the first. */
  readonly maxAttempts: number
  /** Maximum requests this transport keeps in flight. */
  readonly maxConcurrency: number
  /**
   * Delay seam. Omitted, the transport waits on the real clock; tests supply a
   * resolved promise so backoff costs no wall time.
   */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

/** The seam error for a cancelled call. */
function cancelled(): StockError {
  return new StockError('hithink: request cancelled', STOCK_CANCELLED)
}

/**
 * Await one delay, stopping early when the caller cancels.
 * @param ms - Delay in milliseconds.
 * @param signal - Cancellation; an already-aborted signal rejects immediately.
 * @returns A promise that settles after the delay.
 * @throws StockError `STOCK_CANCELLED` when the signal fires first.
 */
export async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw cancelled()
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(cancelled())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Compute the delay before one retry.
 * @param attempt - 1-based number of the attempt that just failed.
 * @param retryAfterMs - Vendor-requested delay, when the response carried one.
 * @param random - Jitter source in `[0, 1)`.
 * @returns Delay in milliseconds, never above {@link BACKOFF_MAX_MS} before jitter.
 */
export function backoffMs(attempt: number, retryAfterMs: number | undefined, random: () => number): number {
  if (retryAfterMs !== undefined) return Math.min(retryAfterMs, BACKOFF_MAX_MS)
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS)
  return exponential + Math.floor(random() * BACKOFF_BASE_MS)
}

/**
 * Read the delay a response asks the client to wait.
 *
 * The vendor does not document `Retry-After`, so this is a courtesy: a numeric
 * header is read as seconds, any other parsable value as an HTTP date, and
 * anything unparsable is ignored in favor of the local backoff schedule.
 *
 * @param headers - Response headers.
 * @returns Delay in milliseconds, or `undefined` when the header is absent or unusable.
 */
export function retryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get('retry-after')
  if (raw === null) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const at = Date.parse(raw)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

/** Parse a response body as JSON, or `undefined` when the text is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    // The vendor answers every documented outcome with JSON, so a body that
    // does not parse cannot be an envelope; the reader reports it as malformed.
    return undefined
  }
}

/** Whether a configured base URL is an absolute HTTP(S) URL. */
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    // `new URL` throws only for a relative or malformed value, which is exactly
    // the configuration this check exists to reject.
    return false
  }
}

/**
 * Classify a thrown transport error.
 * @param error - The value the transport caught.
 * @param signal - The caller's signal, which distinguishes cancellation.
 * @param deadlineSignal - This attempt's signal, which carries the local timeout reason.
 * @returns The seam error to raise.
 */
function transportFailure(error: unknown, signal: AbortSignal, deadlineSignal: AbortSignal): StockError {
  if (signal.aborted) return cancelled()
  if (timeoutOf(deadlineSignal, STOCK_TIMEOUT_CODE) !== undefined) {
    return new StockError('hithink: request exceeded its deadline', STOCK_UPSTREAM)
  }
  const detail = error instanceof Error ? error.message : String(error)
  return new StockError(`hithink: request failed: ${detail}`, STOCK_UPSTREAM)
}

/** Counting gate that bounds in-flight requests and hands each freed slot to the next waiter. */
class Semaphore {
  private active = 0
  private readonly waiting: Array<() => void> = []

  /** @param limit - Maximum concurrent holders; must be at least one. */
  constructor(private readonly limit: number) {}

  /**
   * Take one slot.
   * @param signal - Cancellation; a queued waiter that aborts leaves the queue.
   * @returns The release function for the acquired slot.
   * @throws StockError `STOCK_CANCELLED` when the signal fires before a slot is granted.
   */
  async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw cancelled()
    if (this.active < this.limit) {
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
        this.waiting.splice(this.waiting.indexOf(grant), 1)
        reject(cancelled())
      }
      this.waiting.push(grant)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    return () => {
      this.release()
    }
  }

  /** Free one slot, transferring it to the oldest waiter when one is queued. */
  private release(): void {
    const next = this.waiting.shift()
    if (next === undefined) {
      this.active -= 1
      return
    }
    next()
  }
}

/**
 * Credentialed transport for the Hithink REST API.
 *
 * One `get` resolves the API key, waits for a concurrency slot, and then runs
 * the attempt loop: each attempt fetches under its own deadline, and a
 * throttled or transiently failed response is retried after a backoff until
 * `maxAttempts` is spent. A caller cancellation observed at any point becomes
 * `STOCK_CANCELLED` rather than an upstream failure.
 */
export class HithinkTransport {
  private readonly gate: Semaphore
  private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>

  /** @param options - Resolved transport policy. */
  constructor(private readonly options: HithinkTransportOptions) {
    this.gate = new Semaphore(options.maxConcurrency)
    this.sleep = options.sleep ?? sleepWithSignal
  }

  /**
   * Cheap local usability check; it never touches the network.
   *
   * Credential presence is deliberately not part of it: the credential plane
   * resolves asynchronously, so a missing key would otherwise hide a registered
   * provider from the seam instead of reporting an actionable
   * `STOCK_UNAUTHENTICATED` at execution time.
   *
   * @returns True when the configured base URL is an absolute HTTP(S) URL.
   */
  available(): boolean {
    return isAbsoluteHttpUrl(this.options.baseUrl)
  }

  /**
   * Execute one capability call.
   * @param endpoint - Registry record naming the request path.
   * @param params - Validated wire parameters.
   * @param signal - Caller cancellation, honored across the whole attempt loop.
   * @returns The parsed success envelope.
   * @throws StockError `STOCK_UNAUTHENTICATED` without a key, `STOCK_CANCELLED` on cancellation, or the classified response failure.
   */
  async get(endpoint: StockEndpoint, params: StockParams, signal: AbortSignal): Promise<StockEnvelope> {
    const apiKey = await this.options.resolveApiKey()
    if (apiKey === undefined || apiKey === '') {
      throw new StockError(
        'hithink: no API key is configured for the hithink provider; set HITHINK_FINANCE_API_KEY or the apiKey option',
        STOCK_UNAUTHENTICATED,
      )
    }
    const release = await this.gate.acquire(signal)
    try {
      return await this.run(this.url(endpoint, params), apiKey, signal)
    } finally {
      release()
    }
  }

  /** Run the attempt loop for one request. */
  private async run(url: string, apiKey: string, signal: AbortSignal): Promise<StockEnvelope> {
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.once(url, apiKey, signal)
      const failure = classify(outcome.status, outcome.envelope)
      if (failure === undefined) return outcome.envelope
      if (!isRetryable(outcome.status, outcome.envelope) || attempt >= this.options.maxAttempts) throw failure
      await this.sleep(backoffMs(attempt, outcome.retryAfterMs, Math.random), signal)
    }
  }

  /** Perform one HTTP round trip under its own deadline. */
  private async once(url: string, apiKey: string, signal: AbortSignal): Promise<Attempt> {
    using deadlineScope = deadline(signal, this.options.timeoutMs, STOCK_TIMEOUT_CODE)
    let status: number
    let headers: Headers
    let text: string
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', 'x-api-key': apiKey },
        // The request carries a credential, so a redirect must never forward it.
        redirect: 'error',
        signal: deadlineScope.signal,
      })
      status = response.status
      headers = response.headers
      text = await response.text()
    } catch (error: unknown) {
      throw transportFailure(error, signal, deadlineScope.signal)
    }
    return { status, envelope: readEnvelope(parseJson(text)), retryAfterMs: retryAfterMs(headers) }
  }

  /** Build the absolute request URL for one call. */
  private url(endpoint: StockEndpoint, params: StockParams): string {
    const base = this.options.baseUrl.replace(/\/+$/, '')
    const query = buildQuery(params)
    return query === '' ? `${base}${endpoint.path}` : `${base}${endpoint.path}?${query}`
  }
}
