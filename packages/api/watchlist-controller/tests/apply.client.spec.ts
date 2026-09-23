/**
 * The browser watchlist model: what `apply` publishes, that disposal removes
 * it, and that every command replaces the published snapshot with the Host's
 * list while a failure leaves it alone.
 */
import { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { WatchlistEntry } from '../src/types.ts'

const MAOTAI: WatchlistEntry = { thscode: '600519.SH', name: '贵州茅台', addedAt: 1 }
const PINGAN: WatchlistEntry = { thscode: '000001.SZ', name: '平安银行', addedAt: 2 }
const BOTH: readonly WatchlistEntry[] = [MAOTAI, PINGAN]

/** Arguments one call reached the fake namespace with. */
interface Recorded {
  readonly list: unknown[][]
  readonly add: unknown[][]
  readonly remove: unknown[][]
  readonly reorder: unknown[][]
}

/** A scripted `watchlist` namespace answering every call with the same list, or one failure. */
function namespace(recorded: Recorded, answers: { readonly failure?: RemoteError } = {}) {
  const reply = () => answers.failure === undefined
    ? Promise.resolve({ ok: true as const, value: BOTH })
    : Promise.resolve({ ok: false as const, error: answers.failure })
  return {
    list: (...args: unknown[]) => { recorded.list.push(args); return reply() },
    add: (...args: unknown[]) => { recorded.add.push(args); return reply() },
    remove: (...args: unknown[]) => { recorded.remove.push(args); return reply() },
    reorder: (...args: unknown[]) => { recorded.reorder.push(args); return reply() },
  }
}

/** One booted client plugin over a scripted Remote face. */
function boot(answers: { readonly failure?: RemoteError } = {}) {
  const recorded: Recorded = { list: [], add: [], remove: [], reorder: [] }
  const watchlist = namespace(recorded, answers)
  const ctx = new Context()
  ctx.provide('remote', { watchlist } as never)
  ctx.provide('remote.watchlist', watchlist as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return { ctx, recorded, fiber }
}

describe('watchlist client apply', () => {
  it('publishes the model and removes it with the fiber', async () => {
    const { ctx, fiber } = boot()
    await fiber.await()
    expect(ctx.watchlist).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('watchlist')).toBeUndefined()
  })

  it('starts with an empty list, without reading the Host on construction', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    expect(ctx.watchlist.entries.getSnapshot()).toEqual([])
    expect(recorded.list).toEqual([])
  })
})

describe('watchlist client commands', () => {
  it('publishes the list the Host returned from a refresh', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    let notified = 0
    const off = ctx.watchlist.entries.subscribe(() => { notified += 1 })
    await expect(ctx.watchlist.refresh()).resolves.toEqual(BOTH)
    expect(ctx.watchlist.entries.getSnapshot()).toBe(BOTH)
    expect(notified).toBe(1)
    off()
    expect(recorded.list).toHaveLength(1)
  })

  it('forwards one thscode to add and to remove, and a copied order to reorder', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    await ctx.watchlist.add('600519.SH')
    await ctx.watchlist.remove('600519.SH')
    const order = ['000001.SZ', '600519.SH']
    await ctx.watchlist.reorder(order)
    expect(recorded.add[0]?.[0]).toEqual({ thscode: '600519.SH' })
    expect(recorded.remove[0]?.[0]).toEqual({ thscode: '600519.SH' })
    expect(recorded.reorder[0]?.[0]).toEqual({ thscodes: ['000001.SZ', '600519.SH'] })
    expect((recorded.reorder[0]?.[0] as { thscodes: string[] }).thscodes).not.toBe(order)
  })

  it('keeps the last published list when a command fails, and throws the failure', async () => {
    const failure = new RemoteError('watchlist/duplicate', 'already on the watchlist', { thscode: '600519.SH' })
    // The model binds its namespace at construction, so the scripted namespace
    // itself is the only thing that can change its answer mid-test.
    const answers: { failure?: RemoteError } = {}
    const { ctx, fiber } = boot(answers)
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    await ctx.watchlist.refresh()
    answers.failure = failure
    await expect(ctx.watchlist.add('600519.SH')).rejects.toBe(failure)
    expect(ctx.watchlist.entries.getSnapshot()).toBe(BOTH)
  })
})
