/**
 * Real Loader composition for the stock tool suite.
 *
 * `packages/AGENTS.md` requires a product-visible plugin to be exercised
 * through the Loader rather than only through hand-built `ctx.plugin(...)`
 * calls: this boots a test-only `cordis.yml`, lets the Loader resolve and
 * activate every row, and asserts the assembled model-facing tool plane. The
 * only substituted row is the transport — a provider with the real registry and
 * no network — because a credential and a live vendor are the nondeterministic
 * inputs.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import StockRuntime from '@deepseek-ai/dsh-stock'
import { STOCK_ENDPOINTS } from '@deepseek-ai/dsh-stock-hithink'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolStock from '@deepseek-ai/dsh-tool-stock'

/**
 * Test-only provider row: serves the real registry without a credential or a
 * network, and echoes the capability it was asked for so the assertion can tell
 * which record a call reached.
 */
const backend = {
  name: 'test-stock-backend',
  inject: ['stock'],
  apply(ctx: Context): void {
    ctx.stock.register({
      id: 'test',
      endpoints: STOCK_ENDPOINTS,
      available: () => true,
      execute: request => Promise.resolve({
        endpointId: request.endpoint.id,
        rows: [{ served: request.endpoint.tool, params: request.params }],
        meta: { truncated: false, asOf: 1_700_000_000_000 },
      }),
    })
  },
}

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('tool-stock real Loader composition', () => {
  it('activates the stock toolset through the Loader and dispatches one capability', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-tool-stock-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-session-projection'",
      "- name: '@deepseek-ai/dsh-system-prompt'",
      "- name: '@deepseek-ai/dsh-tools'",
      "- name: '@deepseek-ai/dsh-stock'",
      "- name: '@test/stock-backend'",
      "- name: '@deepseek-ai/dsh-tool-stock'",
      '',
    ].join('\n'))

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-stock', StockRuntime],
      ['@test/stock-backend', backend],
      ['@deepseek-ai/dsh-tool-stock', ToolStock],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const registered = context.tools.schemas().map(schema => schema.name).sort()
    expect(registered).toEqual(STOCK_ENDPOINTS.map(endpoint => endpoint.tool).sort())
    expect(registered).toHaveLength(79)

    const result = await context.tools.execute({
      signal: new AbortController().signal,
      callId: ToolCallId('loader-stock-1'),
      name: 'stock_quote',
      arguments: { thscodes: '300308.SZ' },
    })
    expect(result.isError).toBeFalsy()
    expect(result.value).toMatchObject({
      endpointId: 'a-share.prices.snapshot',
      rows: [{ served: 'stock_quote', params: { thscodes: '300308.SZ' } }],
    })
  })
})
