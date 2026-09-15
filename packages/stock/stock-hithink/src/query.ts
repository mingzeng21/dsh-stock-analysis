/**
 * Query-string serialization for the Hithink provider. The seam hands the
 * provider a validated parameter map keyed by wire name, and every published
 * capability is a GET, so this module is the only place a parameter value
 * becomes URL text.
 * @module @deepseek-ai/dsh-stock-hithink/query
 */

import type { StockParams } from '@deepseek-ai/dsh-stock'

/**
 * Serialize validated parameters into a query string.
 *
 * Parameters keep the order the registry declares, which is the vendor's
 * documentation order, so a recorded request stays diffable across runs.
 * Values are percent-encoded; a boolean becomes `true`/`false` and a number
 * keeps its exact decimal text. An empty map produces an empty string, and the
 * caller then appends no `?`.
 *
 * @param params - Validated parameters keyed by wire name.
 * @returns The encoded query string, without a leading `?`.
 */
export function buildQuery(params: StockParams): string {
  const search = new URLSearchParams()
  for (const [wireName, value] of Object.entries(params)) {
    search.set(wireName, String(value))
  }
  return search.toString()
}
