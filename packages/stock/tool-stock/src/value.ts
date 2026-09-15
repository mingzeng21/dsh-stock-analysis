/**
 * Canonical value of one stock tool call: the bounded row set plus the batch
 * facts a model needs to read it correctly (`asOf`, `truncated`, `total`, and
 * the continuation arguments for the next page). Rows keep the vendor's field
 * names — 82 capabilities return 82 row layouts, and the seam's provider owns
 * their normalization — so this module re-publishes them as lossless JSON and
 * declares nothing about their interior.
 * @module @deepseek-ai/dsh-tool-stock/value
 */

import type { StockResult } from '@deepseek-ai/dsh-stock'
import type { InferValue } from '@deepseek-ai/dsh-tools'

/**
 * Output contract of every stock tool. `rows` items are unconstrained JSON
 * because the row layout belongs to the capability, not to this consumer;
 * `additionalProperties: false` keeps every declared batch fact honest.
 */
export const STOCK_TOOL_VALUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    endpointId: { type: 'string', required: true },
    count: { type: 'integer', required: true },
    truncated: { type: 'boolean', required: true },
    asOf: { type: 'integer' },
    total: { type: 'integer' },
    next: { type: 'json' },
    rows: { type: 'array', required: true, items: { type: 'json' } },
  },
} as const

/** Canonical value of one stock tool call, derived from {@link STOCK_TOOL_VALUE_SCHEMA}. */
export type StockToolValue = InferValue<typeof STOCK_TOOL_VALUE_SCHEMA>

/**
 * Project one seam result onto the canonical value.
 *
 * The seam declares rows as `Record<string, unknown>` because it does not
 * police provider normalization; the tool registry re-validates every returned
 * value as lossless JSON before it reaches a model, so the row cast records a
 * guarantee this boundary does not itself establish.
 * @param result - normalized result from `ctx.stock.call`.
 * @returns the canonical value declared by {@link STOCK_TOOL_VALUE_SCHEMA}.
 */
export function toStockToolValue(result: StockResult): StockToolValue {
  return {
    endpointId: result.endpointId,
    count: result.rows.length,
    truncated: result.meta.truncated,
    ...(result.meta.asOf === undefined ? {} : { asOf: result.meta.asOf }),
    ...(result.meta.total === undefined ? {} : { total: result.meta.total }),
    ...(result.meta.next === undefined ? {} : { next: result.meta.next }),
    rows: result.rows as unknown as StockToolValue['rows'],
  }
}
