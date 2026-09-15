/**
 * Registration of one model-facing tool per capability in the generated
 * registry. Every tool is a thin executor: it forwards validated arguments to
 * `ctx.stock.call` and returns the canonical value. Parameter validation,
 * defaults, row bounds, provider selection, and every vendor error code belong
 * to the seam, so this module never re-implements them — a failure thrown by
 * `ctx.stock` reaches the model as the seam's own `isError` result.
 * @module @deepseek-ai/dsh-tool-stock/register
 */

import type { Context } from '@deepseek-ai/cordis'
import type { StockEndpoint } from '@deepseek-ai/dsh-stock'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import { buildToolAliases, describeEndpoint } from './describe.ts'
import { renderStockResult } from './render.ts'
import { parameterSchema } from './schema.ts'
import { STOCK_TOOL_VALUE_SCHEMA, toStockToolValue } from './value.ts'

/** Everything one registration pass needs. */
export interface StockToolsOptions {
  /** Registry records to expose; one tool is registered per record. */
  readonly endpoints: readonly StockEndpoint[]
  /** Character budget for one rendered result. */
  readonly renderMaxChars: number
  /** Cooperative timeout budget attached to every tool, in milliseconds. */
  readonly timeoutMs: number
}

/** Build one tool definition from its registry record. */
function stockTool(
  ctx: Context,
  endpoint: StockEndpoint,
  aliases: ReadonlyMap<string, string>,
  options: StockToolsOptions,
): ToolDefinition {
  return defineTool({
    name: endpoint.tool,
    description: describeEndpoint(endpoint, aliases),
    parameters: parameterSchema(endpoint),
    timeoutMs: options.timeoutMs,
    output: {
      schema: STOCK_TOOL_VALUE_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: renderStockResult(value, options.renderMaxChars) }],
    },
    async execute(args, exec) {
      return toStockToolValue(await ctx.stock.call(endpoint.id, args, exec.signal))
    },
  })
}

/**
 * Register every capability. Registration is effect-based, so the returned
 * disposers are the same teardown the owning fiber performs.
 * @param ctx - context carrying the `tools` registry and the `stock` seam.
 * @param options - registry records and the per-tool budgets applied to each.
 * @returns one disposer per registered tool, in registry order.
 */
export function registerStockTools(ctx: Context, options: StockToolsOptions): readonly (() => void)[] {
  const aliases = buildToolAliases(options.endpoints)
  return options.endpoints.map(endpoint => ctx.tools.register(stockTool(ctx, endpoint, aliases, options)))
}
