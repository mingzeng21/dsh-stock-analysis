/**
 * The browser read face: what `apply` publishes, that disposal removes it, and
 * that each read forwards its arguments and either returns the value or throws
 * the Gateway's failure.
 */
import { Context } from '@deepseek-ai/cordis'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { CandleRequest, DocumentRow, InstrumentMatch, QuoteBatch } from '../src/types.ts'

const MATCHES: readonly InstrumentMatch[] = [
  { thscode: '600519.SH', ticker: '600519', name: '贵州茅台', assetType: 'a-share', exchange: 'SH' },
]

const BATCH: QuoteBatch = {
  asOf: 1789560797000,
  quotes: [{
    thscode: '600519.SH',
    last: 1252.57,
    change: -4.55,
    changePct: -0.361938,
    open: 1259,
    high: 1259.95,
    low: 1250.8,
    prevClose: 1257.12,
    volume: 2501689,
    turnover: 3135910000,
  }],
}

const DOCUMENTS: readonly DocumentRow[] = [{
  kind: 'report',
  title: '公司跟踪报告',
  source: '诚通证券',
  publishedAt: 1789660800000,
  summary: '估值与投资建议',
  summaryTruncated: false,
}]

/** Arguments one call reached the fake namespace with. */
interface Recorded {
  readonly searchSymbols: unknown[][]
  readonly quotes: unknown[][]
  readonly candles: unknown[][]
  readonly documents: unknown[][]
}

/** A scripted `stock` namespace: it records arguments and answers with one fixed outcome. */
function namespace(recorded: Recorded, answers: { readonly failure?: RemoteError } = {}) {
  const reply = <T>(value: T) => answers.failure === undefined
    ? Promise.resolve({ ok: true as const, value })
    : Promise.resolve({ ok: false as const, error: answers.failure })
  return {
    searchSymbols: (...args: unknown[]) => { recorded.searchSymbols.push(args); return reply(MATCHES) },
    quotes: (...args: unknown[]) => { recorded.quotes.push(args); return reply(BATCH) },
    candles: (...args: unknown[]) => {
      recorded.candles.push(args)
      const request = args[0] as CandleRequest
      return reply({ thscode: request.thscode, interval: request.interval, truncated: false, candles: [] })
    },
    documents: (...args: unknown[]) => { recorded.documents.push(args); return reply(DOCUMENTS) },
  }
}

/** One booted client plugin over a scripted Remote face. */
function boot(answers: { readonly failure?: RemoteError } = {}) {
  const recorded: Recorded = { searchSymbols: [], quotes: [], candles: [], documents: [] }
  const stock = namespace(recorded, answers)
  const ctx = new Context()
  ctx.provide('remote', { stock } as never)
  ctx.provide('remote.stock', stock as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  return { ctx, recorded, fiber }
}

describe('stock client apply', () => {
  it('publishes the read face and removes it with the fiber', async () => {
    const { ctx, fiber } = boot()
    await fiber.await()
    expect(ctx.stockClient).toBeDefined()
    await fiber.dispose()
    expect(ctx.get('stockClient')).toBeUndefined()
  })

})

describe('stock client reads', () => {
  it('forwards a symbol search and returns the candidates', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    await expect(ctx.stockClient.searchSymbols('贵州茅台', 5)).resolves.toEqual(MATCHES)
    expect(recorded.searchSymbols[0]?.slice(0, 2)).toEqual(['贵州茅台', 5])
  })

  it('copies the thscode list it forwards, so the caller keeps its own array', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    const thscodes = ['600519.SH']
    await expect(ctx.stockClient.quotes(thscodes)).resolves.toEqual(BATCH)
    expect(recorded.quotes[0]?.[0]).toEqual(['600519.SH'])
    expect(recorded.quotes[0]?.[0]).not.toBe(thscodes)
  })

  it('forwards a candle window unchanged', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    const request: CandleRequest = { thscode: '600519.SH', interval: '1w', start: 1, end: 2 }
    await expect(ctx.stockClient.candles(request)).resolves.toMatchObject({ thscode: '600519.SH', interval: '1w' })
    expect(recorded.candles[0]?.[0]).toBe(request)
  })

  it('forwards a document search and returns its rows', async () => {
    const { ctx, recorded, fiber } = boot()
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    await expect(ctx.stockClient.documents({ name: '贵州茅台', kind: 'report', size: 10 })).resolves.toEqual(DOCUMENTS)
    expect(recorded.documents[0]?.[0]).toEqual({ name: '贵州茅台', kind: 'report', size: 10 })
  })

  it('throws the Gateway failure so a caller branches on its code', async () => {
    const failure = new RemoteError('stock/rate-limited', 'vendor throttled', { endpoint: 'a-share.prices.snapshot' })
    const { ctx, fiber } = boot({ failure })
    await fiber.await()
    onTestFinished(async () => { await fiber.dispose() })
    await expect(ctx.stockClient.quotes(['600519.SH'])).rejects.toBe(failure)
  })
})
