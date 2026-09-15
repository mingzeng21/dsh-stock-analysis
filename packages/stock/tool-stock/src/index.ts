/**
 * Model-facing stock-market data tools. One tool is registered per capability
 * in the generated vendor registry, and each one forwards its arguments to the
 * `ctx.stock` seam unchanged: the seam owns parameter validation, defaults, row
 * bounds, provider selection, and the vendor error taxonomy, while this package
 * owns only what the model sees — tool names, descriptions, parameter schemas,
 * and the rendered result.
 *
 * The whole registry is registered on activation, so the tool catalog is a
 * function of the generated registry alone and never of the live provider.
 * @module @deepseek-ai/dsh-tool-stock
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { registerStockTools } from './register.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-stock'

/** Services required by the stock tool suite. */
export const inject = ['tools', 'stock']

/** Default character budget for one rendered result. */
export const DEFAULT_RENDER_MAX_CHARS = 20_000

/** Default cooperative timeout budget for one stock call, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000

/** Deployment config for the stock tool suite. */
export interface Config {
  /** Character budget for one rendered result; the batch-fact header is always kept. */
  renderMaxChars?: number
  /** Cooperative timeout budget attached to every tool, in milliseconds. */
  timeoutMs?: number
}

/** Schemastery configuration for the stock tool suite. */
export const Config: z<Config> = z.object({
  renderMaxChars: z.number().default(DEFAULT_RENDER_MAX_CHARS),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** A configured budget must be a positive integer. */
function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`tool-stock: ${field} must be a positive integer`)
  }
}

/**
 * Register every capability the seam currently serves as a model-facing tool.
 *
 * The list comes from `ctx.stock.catalog()`, the union across every usable
 * provider, so mounting a provider is what adds its tools: this package never
 * names a vendor, and two providers cannot contribute the same tool because the
 * seam rejects a duplicated capability id at registration.
 *
 * The host composition mounts providers before any agent preset mounts this
 * package, so activation sees the complete registry.
 *
 * @param ctx - context carrying the `tools` registry and the `stock` seam.
 * @param config - deployment budgets; every field is defaulted by {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  assertPositiveInteger('renderMaxChars', resolved.renderMaxChars)
  assertPositiveInteger('timeoutMs', resolved.timeoutMs)
  const endpoints = ctx.stock.catalog()
  if (endpoints.length === 0) {
    // Registering nothing would look like a working deployment that simply has
    // no tools, and the model would silently lose every market-data capability.
    throw new Error(
      'tool-stock: no stock capability is registered; mount a provider (for example @deepseek-ai/dsh-stock-hithink) before this package',
    )
  }
  registerStockTools(ctx, {
    endpoints,
    renderMaxChars: resolved.renderMaxChars,
    timeoutMs: resolved.timeoutMs,
  })
}
