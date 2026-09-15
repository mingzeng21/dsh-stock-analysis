/**
 * Response handling for the 问财 gateway.
 *
 * The gateway answers two shapes — a document search returns `data`, a
 * natural-language query returns `datas` and `columns` — but both carry the same
 * `status_code` business result, and both can fail before that with an HTTP
 * status whose body may not be JSON at all. This module classifies all of it
 * onto the seam's failure taxonomy, keeping the vendor's own message so a
 * version or entitlement refusal is readable rather than paraphrased.
 * @module @deepseek-ai/dsh-stock-iwencai/envelope
 */

import {
  STOCK_FORBIDDEN,
  STOCK_MALFORMED_RESPONSE,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UPSTREAM,
  StockError,
} from '@deepseek-ai/dsh-stock'

/** The business result code that means success. */
const STATUS_OK = 0

/** A parsed gateway body, whatever shape it carried. */
export interface IwencaiPayload {
  /** Business result code; `0` means success. */
  readonly statusCode: number
  /** Vendor message accompanying the code, when it sent one. */
  readonly statusMessage?: string
  /** The whole parsed body, which the normalizer reads rows and totals from. */
  readonly body: Record<string, unknown>
}

/** Truncate a non-JSON error body so a vendor HTML page cannot flood a message. */
function short(body: string): string {
  const trimmed = body.trim()
  return trimmed.length <= 300 ? trimmed : `${trimmed.slice(0, 300)}…`
}

/**
 * Classify one raw gateway response.
 *
 * HTTP status is judged first: the gateway refuses a request without the skill
 * identity headers with `401` and a plain-text message, which is not JSON and
 * must still reach the caller verbatim. Only then is the business `status_code`
 * read.
 *
 * @param httpStatus - HTTP response status.
 * @param body - Response body text, before any parsing.
 * @returns The parsed business payload when the call succeeded.
 * @throws StockError carrying the seam code for the failure class.
 */
export function readEnvelope(httpStatus: number, body: string): IwencaiPayload {
  if (httpStatus === 401) {
    throw new StockError(`问财 gateway refused the credential: ${short(body)}`, STOCK_UNAUTHENTICATED)
  }
  if (httpStatus === 403) {
    throw new StockError(`问财 gateway refused the request: ${short(body)}`, STOCK_FORBIDDEN)
  }
  if (httpStatus === 429) {
    throw new StockError(`问财 gateway throttled the request: ${short(body)}`, STOCK_RATE_LIMITED)
  }
  if (httpStatus >= 500) {
    throw new StockError(`问财 gateway failed with HTTP ${String(httpStatus)}: ${short(body)}`, STOCK_UPSTREAM)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    // A success status with an unparsable body is the vendor breaking its own
    // contract, not an upstream outage.
    throw new StockError(`问财 gateway returned a non-JSON body: ${short(body)}`, STOCK_MALFORMED_RESPONSE)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new StockError('问财 gateway returned a body that is not an object', STOCK_MALFORMED_RESPONSE)
  }

  const record = parsed as Record<string, unknown>
  const code = record.status_code
  if (typeof code !== 'number') {
    throw new StockError('问财 gateway response has no numeric status_code', STOCK_MALFORMED_RESPONSE)
  }
  if (code !== STATUS_OK) {
    // The vendor documents no code table, so the message is the only detail a
    // caller can act on; a guessed code would be worse than none.
    const message = typeof record.status_msg === 'string' ? record.status_msg : 'no status_msg'
    throw new StockError(`问财 gateway reported status_code ${String(code)}: ${message}`, STOCK_UPSTREAM)
  }

  const statusMessage = typeof record.status_msg === 'string' ? record.status_msg : undefined
  return {
    statusCode: code,
    ...statusMessage === undefined ? {} : { statusMessage },
    body: record,
  }
}

/**
 * Whether one failed HTTP status is worth retrying. Only throttling and server
 * faults are: a refusal for credentials, entitlement, or a malformed request
 * repeats identically.
 *
 * @param httpStatus - HTTP response status of the failed attempt.
 * @returns True when another attempt may succeed.
 */
export function isRetryable(httpStatus: number): boolean {
  return httpStatus === 429 || httpStatus >= 500
}
