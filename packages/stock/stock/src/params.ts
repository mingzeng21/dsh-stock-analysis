/**
 * Parameter resolution for the stock seam. The endpoint registry carries the
 * vendor's parameter contract, but the model-facing tool DSL cannot express
 * required-key, type, enum, or range constraints, so this module is the one
 * place that turns untrusted arguments into a validated wire parameter map.
 * @module @deepseek-ai/dsh-stock/params
 */

import { STOCK_INVALID_PARAMS, StockError } from './error.ts'
import type { StockEndpoint, StockParam } from './registry.ts'
import type { StockParams, StockParamValue } from './types.ts'

/** Reject one call with the seam's parameter-failure code. */
function invalid(message: string): never {
  throw new StockError(message, STOCK_INVALID_PARAMS)
}

/** Whether a value is one of the scalars the query string can carry. */
function isParamValue(value: unknown): value is StockParamValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** Whether a value satisfies the declared wire type. */
function matchesType(value: StockParamValue, type: StockParam['type']): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    // Object and array parameters travel as JSON strings in the vendor contract.
    case 'object':
    case 'array':
      return typeof value === 'string'
  }
}

/** Coerce numeric strings for numeric parameters, which models emit routinely. */
function coerce(value: StockParamValue, param: StockParam): StockParamValue {
  if (typeof value !== 'string') return value
  if (param.type === 'number' || param.type === 'integer') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  if (param.type === 'boolean') {
    if (value === 'true') return true
    if (value === 'false') return false
  }
  return value
}

/**
 * Validate one argument map against an endpoint and apply its declared defaults.
 *
 * Rejects unknown keys instead of forwarding them: the vendor answers an
 * unrecognized query parameter with a business error the model cannot act on,
 * and silently dropping it would hide a model mistake.
 *
 * @param endpoint - Registry record whose `params` defines the accepted contract.
 * @param input - Untrusted arguments, normally model-authored.
 * @returns Wire parameters with required keys present, defaults applied, and no unknown keys.
 */
export function resolveParams(
  endpoint: StockEndpoint,
  input: Readonly<Record<string, unknown>>,
): StockParams {
  const declared = new Map(endpoint.params.map(param => [param.name, param]))
  const resolved: Record<string, StockParamValue> = {}

  for (const [name, raw] of Object.entries(input)) {
    if (raw === undefined || raw === null) continue
    const param = declared.get(name)
    if (param === undefined) {
      invalid(`${endpoint.id}: unknown parameter "${name}"`)
    }
    if (!isParamValue(raw)) invalid(`${endpoint.id}: parameter "${name}" must be a string, number, or boolean`)
    const value = coerce(raw, param)
    if (!matchesType(value, param.type)) {
      invalid(`${endpoint.id}: parameter "${name}" must be ${param.type}`)
    }
    if (param.enum !== undefined && typeof value === 'string' && !param.enum.includes(value)) {
      invalid(`${endpoint.id}: parameter "${name}" must be one of ${param.enum.join(', ')}`)
    }
    resolved[name] = value
  }

  for (const param of endpoint.params) {
    if (resolved[param.name] !== undefined) continue
    if (param.default !== undefined) resolved[param.name] = param.default
    else if (param.required) invalid(`${endpoint.id}: missing required parameter "${param.name}"`)
  }

  return resolved
}
