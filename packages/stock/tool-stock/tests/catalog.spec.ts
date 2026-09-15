/**
 * The shipped surface: the package entry point registers exactly the generated
 * registry, with model-visible names, descriptions, and parameter schemas that
 * agree with the vendor contract.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import StockRuntime, { type StockProvider } from '@deepseek-ai/dsh-stock'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolStock from '../src/index.ts'
import { STOCK_ENDPOINTS } from '@deepseek-ai/dsh-stock-hithink'

const LIMIT_FAMILY = ['stock_limit_up_pool', 'stock_limit_down_pool', 'stock_limit_break_pool', 'stock_limit_up_ladder']

/**
 * A transport-free provider serving the generated registry.
 *
 * The plugin registers exactly what `ctx.stock.catalog()` reports, so the suite
 * has to give the seam a provider before applying it; this stands in for the
 * vendor package without a credential or a network call.
 */
function registryProvider(): StockProvider {
  return {
    id: 'catalog-fixture',
    endpoints: STOCK_ENDPOINTS,
    available: () => true,
    execute: request => Promise.resolve({ endpointId: request.endpoint.id, rows: [], meta: { truncated: false } }),
  }
}

/** Mount the real tool registry, the real seam, and one provider, then apply the plugin. */
async function mount(config: ToolStock.Config = {}): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(StockRuntime, {})
  ctx.stock.register(registryProvider())
  await ctx.plugin(ToolStock, config)
  return ctx
}

describe('plugin contract', () => {
  it('is a named-export function plugin', () => {
    expect(ToolStock.name).toBe('tool-stock')
    expect(ToolStock.inject).toEqual(['tools', 'stock'])
    expect('default' in ToolStock).toBe(false)
  })

  it('defaults both budgets', () => {
    expect(ToolStock.Config({})).toMatchObject({
      renderMaxChars: ToolStock.DEFAULT_RENDER_MAX_CHARS,
      timeoutMs: ToolStock.DEFAULT_TIMEOUT_MS,
    })
  })

  it('rejects a non-positive budget', async () => {
    await expect(mount({ renderMaxChars: 0 })).rejects.toThrow('renderMaxChars must be a positive integer')
    await expect(mount({ timeoutMs: -1 })).rejects.toThrow('timeoutMs must be a positive integer')
  })

  it('accepts a deployment override', async () => {
    const ctx = await mount({ renderMaxChars: 500, timeoutMs: 1000 })
    expect(ctx.tools.get('stock_quote')?.timeoutMs).toBe(1000)
  })

  it('refuses to mount when the seam serves no capability', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(StockRuntime, {})

    // Registering nothing would look like a deployment that simply has no stock
    // tools, and the model would silently lose every market-data capability.
    await expect(ctx.plugin(ToolStock, {})).rejects.toThrow('no stock capability is registered')
  })

  it('unregisters the whole catalog when the plugin fiber is disposed', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(StockRuntime, {})
    ctx.stock.register(registryProvider())
    const fiber = await ctx.plugin(ToolStock, {})
    expect(ctx.tools.schemas()).toHaveLength(STOCK_ENDPOINTS.length)

    await fiber.dispose()

    expect(ctx.tools.get('stock_quote')).toBeUndefined()
    expect(ctx.tools.schemas()).toHaveLength(0)
  })
})

describe('registered surface', () => {
  it('registers one tool per registry record, in registry order', async () => {
    const ctx = await mount()
    const registered = ctx.tools.schemas().map(schema => schema.name)
    expect(registered).toHaveLength(STOCK_ENDPOINTS.length)
    expect(registered).toEqual(STOCK_ENDPOINTS.map(record => record.tool))
  })

  it('keeps every tool name unique', () => {
    const names = STOCK_ENDPOINTS.map(record => record.tool)
    expect(new Set(names).size).toBe(names.length)
  })

  it('gives every tool a non-empty description', async () => {
    const ctx = await mount()
    for (const record of STOCK_ENDPOINTS) {
      expect(ctx.tools.get(record.tool)?.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('never names a vendor tool the model cannot call', async () => {
    const ctx = await mount()
    for (const record of STOCK_ENDPOINTS) {
      const description = ctx.tools.get(record.tool)?.description ?? ''
      expect(description).not.toMatch(/\bget_(a_share|a_share_index|fund|futures|options|meta)_/)
    }
  })

  it('rewrites a vendor tool name the vendor prose refers to', async () => {
    const ctx = await mount()
    expect(ctx.tools.get('stock_index_catalog')?.description).toContain('stock_index_constituents')
  })

  it('states the instrument-code rule on every capability that takes one', async () => {
    const ctx = await mount()
    for (const record of STOCK_ENDPOINTS) {
      const takesCode = record.params.some(param => param.name === 'thscode' || param.name === 'thscodes')
      if (!takesCode) continue
      expect(ctx.tools.get(record.tool)?.description).toContain('stock_symbol_search 解析')
    }
  })

  it('declares exactly the registry parameters of each record', async () => {
    const ctx = await mount()
    for (const record of STOCK_ENDPOINTS) {
      const parameters = ctx.tools.get(record.tool)?.parameters as {
        properties: Record<string, unknown>
        required?: string[]
      }
      expect(Object.keys(parameters.properties)).toEqual(record.params.map(param => param.name))
      const required = record.params.filter(param => param.required).map(param => param.name)
      expect(parameters.required ?? []).toEqual(required)
    }
  })

  it('declares a cooperative timeout on every tool', async () => {
    const ctx = await mount()
    for (const record of STOCK_ENDPOINTS) {
      expect(ctx.tools.get(record.tool)?.timeoutMs).toBe(30_000)
    }
  })
})

describe('disambiguation of the limit family', () => {
  it('states a 口径 clause naming a sibling for every member', async () => {
    const ctx = await mount()
    for (const tool of LIMIT_FAMILY) {
      const description = ctx.tools.get(tool)?.description ?? ''
      expect(description).toContain('口径：')
      expect(LIMIT_FAMILY.filter(sibling => sibling !== tool).some(sibling => description.includes(sibling))).toBe(true)
    }
  })

  it('keeps the four descriptions distinct', async () => {
    const ctx = await mount()
    const descriptions = LIMIT_FAMILY.map(tool => ctx.tools.get(tool)?.description ?? '')
    expect(new Set(descriptions).size).toBe(LIMIT_FAMILY.length)
  })
})
