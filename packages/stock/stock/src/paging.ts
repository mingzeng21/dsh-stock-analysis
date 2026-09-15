/**
 * Paging continuation, shared by every provider.
 *
 * Two vendors already express paging with the same two shapes — an offset with
 * a limit, or a page number with a page size — and both face the same question:
 * when does a response prove another page exists? Answering it once keeps the
 * continuation a caller reads identical across providers.
 * @module @deepseek-ai/dsh-stock/paging
 */

import type { StockEndpoint } from './registry.ts'
import type { StockParams } from './types.ts'

/**
 * Conventional parameter names per paging model, used when the endpoint's own
 * registry record does not declare one.
 */
const DEFAULT_PAGING_NAMES: Readonly<Record<'offset' | 'page', { readonly position: string; readonly size: string }>> = {
  offset: { position: 'offset', size: 'limit' },
  page: { position: 'page', size: 'size' },
}

/**
 * The names a vendor uses for the page position and the page size.
 *
 * Vendors pair them freely — `offset`/`limit`, `page`/`size`, and `page`/`limit`
 * all occur across the two providers this seam serves — so the pair is read from
 * the endpoint's own declared parameters rather than assumed from the paging
 * model. The model still decides the arithmetic: a `page` advances by one, an
 * `offset` by the rows returned.
 */
const POSITION_NAMES: Readonly<Record<'offset' | 'page', readonly string[]>> = {
  page: ['page'],
  offset: ['offset'],
}

/** Names vendors use for the page size, whichever model they page with. */
const SIZE_NAMES: readonly string[] = ['size', 'limit']

/** Resolve the position and size parameter names for one endpoint. */
function pagingNames(endpoint: StockEndpoint, model: 'offset' | 'page'): { position: string; size: string } {
  const declared = new Set(endpoint.params.map(param => param.name))
  const conventional = DEFAULT_PAGING_NAMES[model]
  return {
    position: POSITION_NAMES[model].find(name => declared.has(name)) ?? conventional.position,
    size: SIZE_NAMES.find(name => declared.has(name)) ?? conventional.size,
  }
}

/** Read one integer parameter, which `resolveParams` has already validated. */
function integerParam(params: StockParams, name: string): number | undefined {
  const value = params[name]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

/**
 * Continuation arguments for the next page, when this response was a full page.
 *
 * A full page is the only signal a vendor that reports no total leaves, so it is
 * the trigger; when the total IS reported it decides instead, because that is
 * exact. Two cases deliberately produce nothing: an endpoint that does not page,
 * and a page smaller than its size, which is necessarily the last one.
 *
 * The continuation carries the request's own parameters, so a caller re-issues
 * the same query with only the page position advanced.
 *
 * @param endpoint - Capability that answered; its `paging` model selects the parameter names.
 * @param params - Parameters the request was issued with, after defaults.
 * @param rows - Number of rows the response carried.
 * @param total - Vendor-reported total, when it reported one.
 * @returns Parameters for the next page, or `undefined` when this was the last.
 */
export function nextPage(
  endpoint: StockEndpoint,
  params: StockParams,
  rows: number,
  total: number | undefined,
): StockParams | undefined {
  if (endpoint.paging !== 'offset' && endpoint.paging !== 'page') return undefined
  const names = pagingNames(endpoint, endpoint.paging)
  const position = integerParam(params, names.position) ?? (endpoint.paging === 'page' ? 1 : 0)
  const size = integerParam(params, names.size)
  if (size === undefined || size <= 0 || rows < size) return undefined
  if (total !== undefined && position + rows >= total) return undefined
  const advanced = endpoint.paging === 'page' ? position + 1 : position + rows
  return { ...params, [names.position]: advanced }
}
