/**
 * Wire normalization for the Hithink provider. The vendor answers every
 * capability with the same envelope and 82 different row shapes, so this module
 * normalizes the envelope — which rows exist, which batch facts accompany them,
 * and whether a next page exists — and deliberately leaves every row's own field
 * names untouched.
 * @module @deepseek-ai/dsh-stock-hithink/normalize
 */

import { nextPage } from '@deepseek-ai/dsh-stock'
import type { StockEndpoint, StockParams, StockResult, StockRow } from '@deepseek-ai/dsh-stock'
import type { StockEnvelope } from './envelope.ts'

/** Whether a value is a JSON object, the only shape a row may have. */
function isRecord(value: unknown): value is StockRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Extract the business rows from one envelope's `data`.
 *
 * The documented shape is `data.item` as an array. A bare array payload is
 * accepted as the row list too, and a record with no `item` member at all is
 * treated as one row rather than as no data: dropping it would silently discard
 * the whole payload of a capability that answers with a single object. A record
 * whose `item` is present but not an array is not the documented list shape, so
 * it yields no rows. Entries that are not objects are skipped so one malformed
 * element cannot fail a batch.
 *
 * @param data - The envelope's `data` member.
 * @returns The usable rows, in vendor order.
 */
function rowsOf(data: unknown): readonly StockRow[] {
  if (Array.isArray(data)) return data.filter(isRecord)
  if (!isRecord(data)) return []
  if (Array.isArray(data.item)) return data.item.filter(isRecord)
  return 'item' in data ? [] : [data]
}

/** Read a finite number from one envelope member, when it carries one. */
function numberMember(data: unknown, key: string): number | undefined {
  if (!isRecord(data)) return undefined
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Project one parsed envelope onto the seam's result type.
 * @param endpoint - Capability the envelope answered.
 * @param params - Parameters the request was issued with, after defaults.
 * @param envelope - Parsed vendor envelope, already known to be a success.
 * @returns Rows plus the batch facts the vendor reported.
 */
export function normalizeResult(endpoint: StockEndpoint, params: StockParams, envelope: StockEnvelope): StockResult {
  const data = envelope.data
  const asOf = numberMember(data, 'timestamp')
  const total = numberMember(data, 'total')
  const rows = rowsOf(data)
  const next = nextPage(endpoint, params, rows.length, total)
  return {
    endpointId: endpoint.id,
    rows,
    meta: {
      ...asOf === undefined ? {} : { asOf },
      ...total === undefined ? {} : { total },
      ...next === undefined ? {} : { next },
      truncated: false,
    },
  }
}
