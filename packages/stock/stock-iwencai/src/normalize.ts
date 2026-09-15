/**
 * Wire normalization for the 问财 provider.
 *
 * The gateway's two families carry their rows in different members — a document
 * search under `data`, a natural-language query under `datas` — and report their
 * size under different names. A natural-language query reports two counts:
 * `row_count`, the rows the query can return, and `code_count`, the securities it
 * matched. Those differ whenever one security contributes several rows (a rating
 * history is several rows for one stock), and only `row_count` is a row total, so
 * it is the one the seam's `total` carries. Everything else about a result is the
 * seam's: rows keep the vendor's own field names, including the query-dependent
 * Chinese column names a natural-language query returns.
 * @module @deepseek-ai/dsh-stock-iwencai/normalize
 */

import { nextPage } from '@deepseek-ai/dsh-stock'
import type { StockEndpoint, StockParams, StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import { IWENCAI_CAPABILITIES } from './catalog/generated.ts'
import type { IwencaiPayload } from './envelope.ts'

/** Whether a value is a JSON object, the only shape a row may have. */
function isRecord(value: unknown): value is StockRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read the object rows from one body member, dropping anything else. */
function rowsFrom(value: unknown): readonly StockRow[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord)
}

/** Read a finite number from one body member, when it carries one. */
function numberMember(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Project one gateway payload onto the seam's result type.
 * @param endpoint - Capability the payload answered.
 * @param params - Parameters the request was issued with, after defaults.
 * @param payload - Parsed gateway payload, already known to have succeeded.
 * @returns Rows plus the batch facts the vendor reported.
 */
export function normalizeResult(endpoint: StockEndpoint, params: StockParams, payload: IwencaiPayload): StockResult {
  const capability = IWENCAI_CAPABILITIES.get(endpoint.id)
  if (capability === undefined) {
    // The registry and the identity table are generated together, so a gap is a
    // build defect rather than anything a caller can fix.
    throw new Error(`stock-iwencai: no gateway identity is registered for capability "${endpoint.id}"`)
  }
  const search = capability.family === 'search'
  const rows = rowsFrom(search ? payload.body.data : payload.body.datas)
  const total = numberMember(payload.body, search ? 'total' : 'row_count')
  const next = nextPage(endpoint, params, rows.length, total)
  return {
    endpointId: endpoint.id,
    rows,
    meta: {
      ...total === undefined ? {} : { total },
      ...next === undefined ? {} : { next },
      truncated: false,
    },
  }
}
