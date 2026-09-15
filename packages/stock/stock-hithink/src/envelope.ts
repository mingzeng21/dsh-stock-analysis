/**
 * Vendor response envelope for the Hithink financial-data API. Every business
 * response, including business failures, arrives as
 * `{ code, message, request_id, data }` under HTTP 200; throttling may instead
 * arrive as HTTP 429 with a shortened body. This module is the one place that
 * turns either form into the seam's {@link StockError} taxonomy, so no caller
 * needs the vendor's numeric table.
 * @module @deepseek-ai/dsh-stock-hithink/envelope
 */

import {
  STOCK_FORBIDDEN,
  STOCK_INVALID_PARAMS,
  STOCK_MALFORMED_RESPONSE,
  STOCK_NO_DATA,
  STOCK_NOT_FOUND,
  STOCK_RATE_LIMITED,
  STOCK_UNAUTHENTICATED,
  STOCK_UNSUPPORTED_ASSET,
  STOCK_UPSTREAM,
  StockError,
} from '@deepseek-ai/dsh-stock'

/** One parsed vendor envelope, tolerant of the fields throttling omits. */
export interface StockEnvelope {
  /** Vendor business code; `0` means success. */
  readonly code: number
  /** Vendor result description, empty when the body omits it. */
  readonly message: string
  /** Vendor request id for support escalation; absent on throttled responses. */
  readonly requestId?: string
  /** Business payload; `null` or absent on failures. */
  readonly data: unknown
}

/** Vendor business code that means "success". */
const CODE_SUCCESS = 0

/** The HTTP status the vendor uses for throttling. */
const HTTP_TOO_MANY_REQUESTS = 429

/** Vendor business codes that are caller-side parameter failures. */
const PARAM_CODES: ReadonlySet<number> = new Set([1001, 1002, 1003, 1004])

/** Vendor business code to seam error code, for every code the documented table names. */
const CODE_MAP: ReadonlyMap<number, string> = new Map([
  [2001, STOCK_UNAUTHENTICATED],
  [2003, STOCK_FORBIDDEN],
  [3001, STOCK_NOT_FOUND],
  [3002, STOCK_NO_DATA],
  [3004, STOCK_UNSUPPORTED_ASSET],
  // 429 is not in the published table: throttling sometimes arrives as a
  // shortened body whose `code` restates the HTTP status.
  [HTTP_TOO_MANY_REQUESTS, STOCK_RATE_LIMITED],
  [4001, STOCK_RATE_LIMITED],
  [5001, STOCK_UPSTREAM],
  [5002, STOCK_UPSTREAM],
  [5003, STOCK_UPSTREAM],
])

/** Vendor business codes that justify one more attempt after a backoff. */
const RETRYABLE_CODES: ReadonlySet<number> = new Set([HTTP_TOO_MANY_REQUESTS, 4001, 5002, 5003])

/** Whether a value is a JSON object, which is the only usable envelope shape. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Map one vendor business code onto a seam error code.
 * @param code - Vendor code from the response envelope.
 * @returns The seam error code, or `undefined` for a code this provider does not know.
 */
export function mapVendorCode(code: number): string | undefined {
  if (PARAM_CODES.has(code)) return STOCK_INVALID_PARAMS
  return CODE_MAP.get(code)
}

/**
 * Read one response body as a vendor envelope.
 *
 * Tolerates the shortened throttling body, which carries no `request_id` and a
 * `null` `data`. A body that is not an object, or that carries no numeric
 * `code`, is not an envelope at all and fails as a malformed response.
 *
 * @param body - Parsed JSON body, or `undefined` when the body was not JSON.
 * @returns The parsed envelope.
 * @throws StockError `STOCK_MALFORMED_RESPONSE` when the body is not an envelope.
 */
export function readEnvelope(body: unknown): StockEnvelope {
  if (!isRecord(body) || typeof body.code !== 'number' || !Number.isFinite(body.code)) {
    throw new StockError(
      'hithink: response body is not a { code, message, data } envelope',
      STOCK_MALFORMED_RESPONSE,
    )
  }
  const requestId = typeof body.request_id === 'string' ? body.request_id : undefined
  return {
    code: body.code,
    message: typeof body.message === 'string' ? body.message : '',
    ...requestId === undefined ? {} : { requestId },
    data: body.data ?? null,
  }
}

/**
 * Whether this response justifies another attempt.
 *
 * Only throttling and the two transient upstream codes are retried. A vendor
 * outage reported as an HTTP failure without an envelope is not in that set, so
 * a hard failure is reported to the caller instead of being amplified.
 *
 * @param status - HTTP status of the response.
 * @param envelope - Parsed envelope.
 * @returns True when the caller should retry after a backoff.
 */
export function isRetryable(status: number, envelope: StockEnvelope): boolean {
  return status === HTTP_TOO_MANY_REQUESTS || RETRYABLE_CODES.has(envelope.code)
}

/** Build the failure for one classified response, keeping the vendor request id. */
function failure(envelope: StockEnvelope, code: string): StockError {
  const suffix = envelope.requestId === undefined ? '' : ` (request_id ${envelope.requestId})`
  const detail = envelope.message === '' ? 'request failed' : envelope.message
  return new StockError(`hithink: ${detail}${suffix}`, code)
}

/**
 * Classify one response against the seam's failure taxonomy.
 * @param status - HTTP status of the response.
 * @param envelope - Parsed envelope.
 * @returns The failure to throw, or `undefined` when the response succeeded.
 */
export function classify(status: number, envelope: StockEnvelope): StockError | undefined {
  if (status === HTTP_TOO_MANY_REQUESTS) return failure(envelope, STOCK_RATE_LIMITED)
  if (envelope.code === CODE_SUCCESS) {
    return status === 200 ? undefined : failure(envelope, STOCK_UPSTREAM)
  }
  return failure(envelope, mapVendorCode(envelope.code) ?? STOCK_UPSTREAM)
}
