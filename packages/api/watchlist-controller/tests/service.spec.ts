/**
 * The durable watchlist over the real storage facility: what each mutation
 * stores, which failure a caller sees, and that a restart reads back the same
 * list.
 */
import { Context } from '@deepseek-ai/cordis'
import type { SymbolMatch, SymbolQueryOptions } from '@deepseek-ai/dsh-stock'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import WatchlistController from '../src/index.ts'
import { watchlistDomainSpec } from '../src/spec.ts'

const SIGNAL = new AbortController().signal

/** A stock seam stub whose disambiguation answer one test scripts. */
interface SeamStub {
  answer: readonly SymbolMatch[] | Error | string
}

/** One booted composition over a shared medium pool. */
interface Booted {
  readonly fiber: { dispose(): Promise<void> }
  readonly controller: WatchlistController
}

/** Boot the storage facility, the stock stub, and the controller over one pool. */
async function boot(pool: MemoryMediaPool, seam: SeamStub, maxEntries = 200): Promise<Booted> {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  ctx.provide('stock', {
    resolveSymbols: async (_query: string, _options: SymbolQueryOptions = {}) => {
      if (seam.answer instanceof Error || typeof seam.answer === 'string') throw seam.answer
      return seam.answer
    },
  } as never)
  const fiber = await ctx.plugin(WatchlistController, { maxEntries })
  return { fiber, controller: ctx.watchlistController }
}

/** One resolved instrument. */
function match(thscode: string, name: string): SymbolMatch {
  return { thscode, ticker: thscode.split('.')[0] ?? thscode, name }
}

/** A seam failure carrying the code the provider would have thrown. */
function stockError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

const disposals: Array<() => Promise<void>> = []

afterEach(async () => {
  while (disposals.length > 0) await disposals.pop()?.()
})

describe('watchlistController.list', () => {
  it('starts empty', async () => {
    const pool = new MemoryMediaPool()
    const booted = await boot(pool, { answer: [] })
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.list(SIGNAL)).resolves.toEqual([])
  })

  it('refuses a mutation whose caller is already gone, without storing anything', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [match('600519.SH', '贵州茅台')] })
    disposals.push(() => booted.fiber.dispose())
    const aborted = new AbortController()
    aborted.abort()
    await expect(booted.controller.add({ thscode: '600519.SH' }, aborted.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
    await expect(booted.controller.remove({ thscode: '600519.SH' }, aborted.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
    await expect(booted.controller.reorder({ thscodes: [] }, aborted.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
    await expect(booted.controller.list(SIGNAL)).resolves.toEqual([])
  })

  it('refuses a read whose caller is already gone', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [] })
    disposals.push(() => booted.fiber.dispose())
    const aborted = new AbortController()
    aborted.abort()
    await expect(booted.controller.list(aborted.signal)).rejects.toMatchObject({ code: 'gateway/cancelled' })
  })
})

describe('watchlistController.add', () => {
  it('resolves the instrument and appends it in display order', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [match('600519.SH', '贵州茅台')] })
    disposals.push(() => booted.fiber.dispose())
    const entries = await booted.controller.add({ thscode: '600519.SH' }, SIGNAL)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ thscode: '600519.SH', name: '贵州茅台' })
    expect(entries[0]?.addedAt).toBeGreaterThan(0)
  })

  it('matches the resolved instrument case-insensitively', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [match('600519.SH', '贵州茅台')] })
    disposals.push(() => booted.fiber.dispose())
    const entries = await booted.controller.add({ thscode: '600519.sh' }, SIGNAL)
    expect(entries[0]?.name).toBe('贵州茅台')
  })

  it('refuses a duplicate without asking the seam again', async () => {
    const seam: SeamStub = { answer: [match('600519.SH', '贵州茅台')] }
    const booted = await boot(new MemoryMediaPool(), seam)
    disposals.push(() => booted.fiber.dispose())
    await booted.controller.add({ thscode: '600519.SH' }, SIGNAL)
    await expect(booted.controller.add({ thscode: '600519.SH' }, SIGNAL))
      .rejects.toMatchObject({ code: 'watchlist/duplicate', details: { thscode: '600519.SH' } })
    expect(await booted.controller.list(SIGNAL)).toHaveLength(1)
  })

  it('refuses a thscode the seam resolves to nothing', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [] })
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.add({ thscode: '000000.XX' }, SIGNAL))
      .rejects.toMatchObject({ code: 'watchlist/unknown-symbol' })
    await expect(booted.controller.list(SIGNAL)).resolves.toEqual([])
  })

  it('reports a seam failure as a lookup failure rather than storing an entry', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: stockError('STOCK_RATE_LIMITED') })
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.add({ thscode: '600519.SH' }, SIGNAL)).rejects.toMatchObject({
      code: 'watchlist/lookup-failed',
      details: { thscode: '600519.SH', reason: 'STOCK_RATE_LIMITED' },
    })
    await expect(booted.controller.list(SIGNAL)).resolves.toEqual([])
  })

  it('propagates a thrown non-object unchanged', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: 'not an error' })
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.add({ thscode: '600519.SH' }, SIGNAL)).rejects.toBe('not an error')
  })

  it('propagates an error that is not a seam failure', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: new Error('programming defect') })
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.add({ thscode: '600519.SH' }, SIGNAL)).rejects.toThrow('programming defect')
  })

  it('refuses a blank thscode and an entry beyond the configured cap', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [match('600519.SH', '贵州茅台')] }, 1)
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.add({ thscode: '  ' }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await booted.controller.add({ thscode: '600519.SH' }, SIGNAL)
    await expect(booted.controller.add({ thscode: '000001.SZ' }, SIGNAL))
      .rejects.toMatchObject({ code: 'watchlist/limit-reached', details: { maxEntries: 1 } })
  })
})

describe('watchlistController.remove and reorder', () => {
  it('drops exactly the named entry and keeps the rest in order', async () => {
    const seam: SeamStub = { answer: [] }
    const booted = await boot(new MemoryMediaPool(), seam)
    disposals.push(() => booted.fiber.dispose())
    for (const [thscode, name] of [['600519.SH', '贵州茅台'], ['000001.SZ', '平安银行']] as const) {
      seam.answer = [match(thscode, name)]
      await booted.controller.add({ thscode }, SIGNAL)
    }
    const remaining = await booted.controller.remove({ thscode: '600519.SH' }, SIGNAL)
    expect(remaining.map(entry => entry.thscode)).toEqual(['000001.SZ'])
    expect(remaining[0]?.name).toBe('平安银行')
    expect(remaining[0]?.addedAt).toBeGreaterThan(0)
  })

  it('refuses to remove an entry that is not on the list', async () => {
    const booted = await boot(new MemoryMediaPool(), { answer: [] })
    disposals.push(() => booted.fiber.dispose())
    await expect(booted.controller.remove({ thscode: '600519.SH' }, SIGNAL))
      .rejects.toMatchObject({ code: 'watchlist/not-found' })
  })

  it('takes the order it is given, and only that order', async () => {
    const seam: SeamStub = { answer: [] }
    const booted = await boot(new MemoryMediaPool(), seam)
    disposals.push(() => booted.fiber.dispose())
    for (const [thscode, name] of [['600519.SH', '贵州茅台'], ['000001.SZ', '平安银行']] as const) {
      seam.answer = [match(thscode, name)]
      await booted.controller.add({ thscode }, SIGNAL)
    }
    const reordered = await booted.controller.reorder({ thscodes: ['000001.SZ', '600519.SH'] }, SIGNAL)
    expect(reordered.map(entry => entry.thscode)).toEqual(['000001.SZ', '600519.SH'])
    await expect(booted.controller.reorder({ thscodes: ['000001.SZ'] }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(booted.controller.reorder({ thscodes: ['000001.SZ', '000001.SZ'] }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(booted.controller.reorder({ thscodes: ['000001.SZ', '999999.SZ'] }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect((await booted.controller.list(SIGNAL)).map(entry => entry.thscode)).toEqual(['000001.SZ', '600519.SH'])
  })
})

describe('watchlist persistence', () => {
  it('reads back the same list, in the same order, from the same medium', async () => {
    const pool = new MemoryMediaPool()
    const seam: SeamStub = { answer: [] }
    const first = await boot(pool, seam)
    for (const [thscode, name] of [['600519.SH', '贵州茅台'], ['000001.SZ', '平安银行']] as const) {
      seam.answer = [match(thscode, name)]
      await first.controller.add({ thscode }, SIGNAL)
    }
    await first.controller.reorder({ thscodes: ['000001.SZ', '600519.SH'] }, SIGNAL)
    const before = await first.controller.list(SIGNAL)
    await first.fiber.dispose()

    const second = await boot(pool, { answer: [] })
    disposals.push(() => second.fiber.dispose())
    await expect(second.controller.list(SIGNAL)).resolves.toEqual(before)
    expect((await second.controller.list(SIGNAL)).map(entry => entry.thscode)).toEqual(['000001.SZ', '600519.SH'])
  })

  it('releases the domain on dispose, so a later boot can open it again', async () => {
    const pool = new MemoryMediaPool()
    const first = await boot(pool, { answer: [] })
    await first.fiber.dispose()
    const second = await boot(pool, { answer: [] })
    disposals.push(() => second.fiber.dispose())
    await expect(second.controller.list(SIGNAL)).resolves.toEqual([])
  })
})

describe('the watchlist domain declaration', () => {
  it('names one domain whose whole value is the ordered list', () => {
    expect(watchlistDomainSpec.name).toBe('watchlist')
    expect(watchlistDomainSpec.version).toBe(1)
    expect(Object.keys(watchlistDomainSpec.tables)).toEqual([])
    expect(watchlistDomainSpec.global?.initial).toEqual({ entries: [] })
  })

  it('refuses a stored value that is not an ordered entry list', () => {
    expect(watchlistDomainSpec.global?.schema.safeParse({ entries: [{ thscode: '600519.SH' }] }).success).toBe(false)
    expect(watchlistDomainSpec.global?.schema.safeParse({
      entries: [{ thscode: '600519.SH', name: '贵州茅台', addedAt: 1 }],
    }).success).toBe(true)
  })
})
