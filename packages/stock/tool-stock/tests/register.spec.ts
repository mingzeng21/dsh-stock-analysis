/**
 * Registration and dispatch through the real tool registry and the real stock
 * seam: one tool per registry record, forwarded parameters, canonical values,
 * seam-owned failures, and effect-based teardown.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import StockRuntime from '@deepseek-ai/dsh-stock'
import type { StockResult } from '@deepseek-ai/dsh-stock'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { FIXTURE_ENDPOINTS, endpoint, fixtureProvider } from './fixtures.ts'
import { registerStockTools } from '../src/register.ts'

const testSignal = new AbortController().signal

/** One successful fixture result carrying a single row. */
function ok(endpointId: string, row: Record<string, unknown> = { thscode: '600519.SH' }): StockResult {
  return { endpointId, rows: [row], meta: { truncated: false, asOf: 1_700_000_000_000 } }
}

/** Mount the real registry and seam, then register the fixture records as tools. */
async function mount(
  respond: (endpointId: string) => StockResult | Promise<StockResult> = request => ok(request),
  endpoints = FIXTURE_ENDPOINTS,
): Promise<{
  ctx: Context
  calls: ReturnType<typeof fixtureProvider>['calls']
  disposeTools: () => void
  call: (name: string, args: unknown) => Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(StockRuntime, {})
  const fixture = fixtureProvider(endpoints, request => respond(request.endpoint.id))
  ctx.stock.register(fixture.provider)
  const disposers = registerStockTools(ctx, { endpoints, renderMaxChars: 20_000, timeoutMs: 30_000 })
  let counter = 0
  return {
    ctx,
    calls: fixture.calls,
    disposeTools: () => {
      for (const dispose of disposers) dispose()
    },
    call: (name, args) => ctx.tools.execute({
      signal: testSignal,
      callId: ToolCallId(`call-${++counter}`),
      name,
      arguments: args,
    }),
  }
}

/** The text one execution result carries. */
function textOf(result: ToolExecutionResult): string {
  return result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
}

describe('registration', () => {
  it('registers one tool per record with the registered tool name', async () => {
    const { ctx } = await mount()
    for (const record of FIXTURE_ENDPOINTS) {
      expect(ctx.tools.get(record.tool)?.name).toBe(record.tool)
    }
    expect(ctx.tools.schemas().filter(schema => FIXTURE_ENDPOINTS.some(r => r.tool === schema.name)))
      .toHaveLength(FIXTURE_ENDPOINTS.length)
  })

  it('publishes the record parameters, with requiredness, to the model', async () => {
    const { ctx } = await mount()
    const parameters = ctx.tools.get('stock_symbol_search')?.parameters as {
      properties: Record<string, unknown>
      required?: string[]
    }
    expect(Object.keys(parameters.properties)).toEqual([
      'q', 'asset_type', 'limit', 'weight', 'strict', 'filters', 'fields',
    ])
    expect(parameters.required).toEqual(['q'])
  })

  it('attaches the configured cooperative timeout to every tool', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.get('stock_quote')?.timeoutMs).toBe(30_000)
  })

  it('removes every tool when its registration is disposed', async () => {
    const { ctx, disposeTools } = await mount()
    disposeTools()
    for (const record of FIXTURE_ENDPOINTS) expect(ctx.tools.get(record.tool)).toBeUndefined()
  })
})

describe('dispatch', () => {
  it('forwards registry defaults and returns the canonical value', async () => {
    const { call, calls } = await mount()
    const result = await call('stock_symbol_search', { q: '贵州茅台' })

    expect(result.isError).toBe(false)
    expect(result.value).toEqual({
      endpointId: 'meta.tickers.search',
      count: 1,
      truncated: false,
      asOf: 1_700_000_000_000,
      rows: [{ thscode: '600519.SH' }],
    })
    expect(calls[0]?.endpointId).toBe('meta.tickers.search')
    expect(calls[0]?.params).toMatchObject({ q: '贵州茅台', asset_type: 'stock', limit: 10 })
  })

  it('renders the canonical value as the model-facing content', async () => {
    const { call } = await mount()
    const result = await call('stock_quote', { thscodes: '600519.SH' })
    expect(textOf(result)).toContain('a-share.prices.snapshot: 1 行')
  })

  it('forwards the execution signal to the seam', async () => {
    const { call, calls } = await mount()
    await call('stock_quote', { thscodes: '600519.SH' })
    expect(calls[0]?.signal).toBe(testSignal)
  })

  it('rejects a parameter the record does not declare', async () => {
    const { call } = await mount()
    const result = await call('stock_quote', { thscodes: '600519.SH', bogus: 1 })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('unknown parameter "bogus"')
  })

  it('surfaces a provider failure as an error result', async () => {
    const { call } = await mount(() => {
      throw new Error('upstream exploded')
    })
    const result = await call('stock_quote', { thscodes: '600519.SH' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('upstream exploded')
  })

  it('reports a capability the vendor does not open to external access', async () => {
    const closed = endpoint({ id: 'a-share.capital-flow.snapshot', tool: 'stock_capital_flow_snapshot', availability: 'unavailable' })
    const { call } = await mount(() => ok(closed.id), [closed])
    const result = await call('stock_capital_flow_snapshot', {})
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('not open to external access')
  })
})
