/**
 * The panel's data layer: what one read publishes, which failure reaches the
 * surface, and that a superseded read never publishes over a newer one.
 */
import type {
  Candle, DocumentRow, DocumentsRequest, IStockClient, Quote, QuoteBatch,
} from '@deepseek-ai/dsh-api-stock-controller/client'
import type { IWatchlist, WatchlistEntry } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it } from 'vitest'
import { candleWindow, WatchlistSurface } from '../src/client/controller.ts'
import type { CandlesSnapshot, DocumentsSnapshot, ListSnapshot, QuotesSnapshot } from '../src/client/controller.ts'

const MAOTAI: WatchlistEntry = { thscode: '600519.SH', name: '贵州茅台', addedAt: 1 }
const PINGAN: WatchlistEntry = { thscode: '000001.SZ', name: '平安银行', addedAt: 2 }

/** The failure code a snapshot carries, when it is the failed arm. */
function failureOf(
  snapshot: QuotesSnapshot | ListSnapshot | CandlesSnapshot | DocumentsSnapshot,
): string | undefined {
  return snapshot.phase === 'failed' ? snapshot.failure : undefined
}

/** One document row, overridable per test. */
function documentRow(kind: DocumentRow['kind'], title: string, publishedAt = 1_789_660_800_000): DocumentRow {
  return { kind, title, publishedAt, summary: '摘要', summaryTruncated: false }
}

/** A stock face that answers candle reads from a scripted series. */
function candleStock(candles: readonly Candle[], truncated = false): IStockClient {
  return {
    ...stockStub(),
    candles: async () => ({ thscode: '600519.SH', interval: '1d', truncated, candles }),
  }
}

/** One candle, overridable per test. */
function candle(time: number, close: number): Candle {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 10 }
}

/** One externally settled promise, for pinning read ordering. */
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve = (): void => {}
  const promise = new Promise<void>((settle) => { resolve = settle })
  return { promise, resolve }
}

/** One quote row, overridable per test. */
function quote(thscode: string, last: number): Quote {
  return {
    thscode,
    last,
    change: 0,
    changePct: 0,
    open: last,
    high: last,
    low: last,
    prevClose: last,
    volume: 1,
    turnover: 1,
  }
}

/** A scripted durable list. */
function watchlistStub(initial: readonly WatchlistEntry[] = []): IWatchlist {
  const store = createSnapshotStore<readonly WatchlistEntry[]>(initial)
  return {
    entries: store,
    refresh: async () => store.getSnapshot(),
    add: async (thscode: string) => {
      if (thscode === '600519.SH') store.set([MAOTAI])
      return store.getSnapshot()
    },
    remove: async () => {
      store.set([])
      return store.getSnapshot()
    },
    reorder: async () => store.getSnapshot(),
  }
}

/** A scripted market-data face whose batch answers from a set of quotes. */
function stockStub(quotes: readonly Quote[] = [], asOf?: number): IStockClient {
  return {
    searchSymbols: async () => [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }],
    quotes: async (): Promise<QuoteBatch> => ({
      quotes,
      ...asOf === undefined ? {} : { asOf },
    }),
    candles: async () => { throw new Error('this spec never reads candles') },
    documents: async () => [],
  }
}

describe('WatchlistSurface.load', () => {
  it('publishes the list phase and a quote per instrument, keyed by thscode', async () => {
    const surface = new WatchlistSurface(
      watchlistStub([MAOTAI, PINGAN]),
      stockStub([quote('600519.SH', 1252.57), quote('000001.SZ', 11.73)], 1789560797000),
    )
    expect(surface.quotes.getSnapshot()).toEqual({ phase: 'idle', byCode: {} })
    await surface.load()
    expect(surface.list.getSnapshot()).toEqual({ phase: 'ready' })
    expect(surface.quotes.getSnapshot()).toMatchObject({ phase: 'ready', asOf: 1789560797000 })
    expect(surface.quotes.getSnapshot().byCode['600519.SH']?.last).toBe(1252.57)
    expect(surface.quotes.getSnapshot().byCode['000001.SZ']?.last).toBe(11.73)
  })

  it('omits the readiness stamp when the vendor reports none', async () => {
    const surface = new WatchlistSurface(watchlistStub([MAOTAI]), stockStub([quote('600519.SH', 1)]))
    await surface.load()
    expect(surface.quotes.getSnapshot().asOf).toBeUndefined()
  })

  it('settles an empty list without asking for a batch', async () => {
    const stock = stockStub()
    let calls = 0
    const surface = new WatchlistSurface(watchlistStub(), {
      ...stock,
      quotes: async () => { calls += 1; return { quotes: [] } },
    })
    await surface.load()
    expect(calls).toBe(0)
    expect(surface.quotes.getSnapshot()).toEqual({ phase: 'ready', byCode: {} })
    expect(surface.list.getSnapshot()).toEqual({ phase: 'ready' })
  })

  it('publishes a failed list read as its Remote code and reads no quotes', async () => {
    const failing: IWatchlist = {
      ...watchlistStub(),
      refresh: async () => { throw new RemoteError('gateway/internal', 'host down', {}) },
    }
    let calls = 0
    const surface = new WatchlistSurface(failing, {
      ...stockStub(),
      quotes: async () => { calls += 1; return { quotes: [] } },
    })
    await surface.load()
    expect(surface.list.getSnapshot()).toEqual({ phase: 'failed', failure: 'gateway/internal' })
    expect(calls).toBe(0)
    expect(surface.quotes.getSnapshot().phase).toBe('idle')
  })

  it('publishes a failed quote batch as its Remote code while the list stays ready', async () => {
    const surface = new WatchlistSurface(watchlistStub([MAOTAI]), {
      ...stockStub(),
      quotes: async () => { throw new RemoteError('stock/rate-limited', 'throttled', { endpoint: 'a-share.prices.snapshot' }) },
    })
    await surface.load()
    expect(surface.list.getSnapshot()).toEqual({ phase: 'ready' })
    expect(surface.quotes.getSnapshot()).toMatchObject({ phase: 'failed', failure: 'stock/rate-limited' })
  })

  it('reports a thrown value with no code as unknown rather than dropping the failure', async () => {
    const surface = new WatchlistSurface(watchlistStub([MAOTAI]), {
      ...stockStub(),
      quotes: async () => { throw new Error('no code here') },
    })
    await surface.load()
    expect(failureOf(surface.quotes.getSnapshot())).toBe('unknown')
  })

  it('never publishes a superseded read over a newer one', async () => {
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    let first = true
    const watchlist = watchlistStub([PINGAN])
    const slow: IWatchlist = {
      ...watchlist,
      refresh: async () => {
        if (first) {
          first = false
          await gate
        }
        return watchlist.entries.getSnapshot()
      },
    }
    const surface = new WatchlistSurface(slow, stockStub([quote('000001.SZ', 11.73)]))
    const superseded = surface.load()
    await surface.load()
    expect(surface.list.getSnapshot()).toEqual({ phase: 'ready' })
    release()
    await superseded
    expect(surface.list.getSnapshot()).toEqual({ phase: 'ready' })
    expect(surface.quotes.getSnapshot().byCode['000001.SZ']?.last).toBe(11.73)
  })
})

describe('WatchlistSurface superseded reads', () => {
  it('publishes nothing when a superseded list read then fails', async () => {
    let fail = (): void => {}
    const gate = new Promise<void>((resolve) => { fail = resolve })
    let first = true
    const watchlist = watchlistStub([MAOTAI])
    const slow: IWatchlist = {
      ...watchlist,
      refresh: async () => {
        if (!first) return watchlist.entries.getSnapshot()
        first = false
        await gate
        throw new RemoteError('gateway/internal', 'too late', {})
      },
    }
    const surface = new WatchlistSurface(slow, stockStub([quote('600519.SH', 1252.57)]))
    const superseded = surface.load()
    await surface.load()
    fail()
    await superseded
    expect(surface.list.getSnapshot()).toEqual({ phase: 'ready' })
    expect(surface.quotes.getSnapshot().byCode['600519.SH']?.last).toBe(1252.57)
  })

  it('publishes nothing when a superseded quote batch then succeeds', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      quotes: async (): Promise<QuoteBatch> => {
        if (!first) return { quotes: [quote('600519.SH', 2)] }
        first = false
        entered.resolve()
        await gate.promise
        return { quotes: [quote('600519.SH', 999)] }
      },
    }
    const surface = new WatchlistSurface(watchlistStub([MAOTAI]), stock)
    const superseded = surface.load()
    await entered.promise
    const current = surface.load()
    gate.resolve()
    await superseded
    await current
    expect(surface.quotes.getSnapshot().byCode['600519.SH']?.last).toBe(2)
  })

  it('publishes nothing when a superseded quote batch then fails', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      quotes: async (): Promise<QuoteBatch> => {
        if (!first) return { quotes: [quote('600519.SH', 2)] }
        first = false
        entered.resolve()
        await gate.promise
        throw new RemoteError('stock/upstream', 'too late', { endpoint: 'a-share.prices.snapshot' })
      },
    }
    const surface = new WatchlistSurface(watchlistStub([MAOTAI]), stock)
    const superseded = surface.load()
    await entered.promise
    const current = surface.load()
    gate.resolve()
    await superseded
    await current
    expect(surface.quotes.getSnapshot()).toMatchObject({ phase: 'ready' })
  })
})

describe('WatchlistSurface mutations', () => {
  it('refreshes the batch after a successful add', async () => {
    const watchlist = watchlistStub()
    const surface = new WatchlistSurface(watchlist, stockStub([quote('600519.SH', 1252.57)]))
    await expect(surface.add('600519.SH')).resolves.toEqual({ ok: true })
    expect(watchlist.entries.getSnapshot()).toEqual([MAOTAI])
    expect(surface.quotes.getSnapshot().byCode['600519.SH']?.last).toBe(1252.57)
  })

  it('answers a refused add with its Remote code and leaves the batch alone', async () => {
    const refusing: IWatchlist = {
      ...watchlistStub(),
      add: async () => { throw new RemoteError('watchlist/duplicate', 'already listed', { thscode: '600519.SH' }) },
    }
    const surface = new WatchlistSurface(refusing, stockStub([quote('600519.SH', 1)]))
    await expect(surface.add('600519.SH')).resolves.toEqual({ ok: false, code: 'watchlist/duplicate' })
    expect(surface.quotes.getSnapshot().phase).toBe('idle')
  })

  it('refreshes the batch after a successful removal and answers a refused one', async () => {
    const watchlist = watchlistStub([MAOTAI])
    const surface = new WatchlistSurface(watchlist, stockStub([quote('600519.SH', 1252.57)]))
    await surface.load()
    await expect(surface.remove('600519.SH')).resolves.toEqual({ ok: true })
    expect(watchlist.entries.getSnapshot()).toEqual([])
    expect(surface.quotes.getSnapshot()).toEqual({ phase: 'ready', byCode: {} })

    const refusing: WatchlistSurface = new WatchlistSurface({
      ...watchlist,
      remove: async () => { throw new RemoteError('watchlist/not-found', 'absent', { thscode: '600519.SH' }) },
    }, stockStub())
    await expect(refusing.remove('600519.SH')).resolves.toEqual({ ok: false, code: 'watchlist/not-found' })
  })
})

describe('candleWindow', () => {
  it('asks each period for its own history length', () => {
    const now = Date.UTC(2026, 0, 1)
    const day = 24 * 60 * 60 * 1000
    expect(candleWindow('1d', now)).toEqual({ start: now - 365 * day, end: now })
    expect(candleWindow('1w', now)).toEqual({ start: now - 1095 * day, end: now })
    expect(candleWindow('1mo', now)).toEqual({ start: now - 3650 * day, end: now })
  })
})

describe('WatchlistSurface.loadCandles', () => {
  it('publishes the series, its period, and the seam\u2019s truncation fact', async () => {
    const surface = new WatchlistSurface(watchlistStub(), candleStock([candle(1, 10), candle(2, 11)], true))
    await surface.loadCandles('600519.SH', '1w', 2_000_000)
    expect(surface.candles.getSnapshot()).toEqual({
      phase: 'ready',
      interval: '1w',
      truncated: true,
      bars: [
        { time: 1, open: 10, high: 11, low: 9, close: 10, volume: 10 },
        { time: 2, open: 11, high: 12, low: 10, close: 11, volume: 10 },
      ],
    })
  })

  it('keeps the last series drawn while the next read is in flight', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      candles: async () => {
        if (first) {
          first = false
          return { thscode: '600519.SH', interval: '1d', truncated: false, candles: [candle(1, 10)] }
        }
        entered.resolve()
        await gate.promise
        return { thscode: '600519.SH', interval: '1d', truncated: false, candles: [candle(2, 22)] }
      },
    }
    const surface = new WatchlistSurface(watchlistStub(), stock)
    await surface.loadCandles('600519.SH', '1d', 0)
    const pending = surface.loadCandles('600519.SH', '1d', 0)
    await entered.promise
    expect(surface.candles.getSnapshot()).toMatchObject({ phase: 'loading' })
    expect(surface.candles.getSnapshot().bars).toHaveLength(1)
    gate.resolve()
    await pending
    expect(surface.candles.getSnapshot().bars).toHaveLength(1)
    expect(surface.candles.getSnapshot().bars[0]?.close).toBe(22)
  })

  it('publishes a failed read as its Remote code while the last series stays', async () => {
    const surface = new WatchlistSurface(watchlistStub(), candleStock([candle(1, 10)]))
    await surface.loadCandles('600519.SH', '1d', 0)
    const failing = new WatchlistSurface(watchlistStub(), {
      ...stockStub(),
      candles: async () => { throw new RemoteError('stock/no-data', 'no bars', { endpoint: 'a-share.prices.historical' }) },
    })
    await failing.loadCandles('600519.SH', '1mo', 0)
    expect(failureOf(failing.candles.getSnapshot())).toBe('stock/no-data')
    expect(failing.candles.getSnapshot().interval).toBe('1mo')
    expect(failing.candles.getSnapshot().bars).toEqual([])
    expect(surface.candles.getSnapshot().bars).toHaveLength(1)
  })

  it('publishes nothing when a superseded candle read then succeeds', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      candles: async () => {
        if (!first) return { thscode: '600519.SH', interval: '1d', truncated: false, candles: [candle(2, 22)] }
        first = false
        entered.resolve()
        await gate.promise
        return { thscode: '600519.SH', interval: '1d', truncated: false, candles: [candle(999, 999)] }
      },
    }
    const surface = new WatchlistSurface(watchlistStub(), stock)
    const superseded = surface.loadCandles('600519.SH', '1d', 0)
    await entered.promise
    const current = surface.loadCandles('600519.SH', '1d', 0)
    gate.resolve()
    await superseded
    await current
    expect(surface.candles.getSnapshot().bars).toEqual([
      { time: 2, open: 22, high: 23, low: 21, close: 22, volume: 10 },
    ])
  })
})

describe('WatchlistSurface superseded candle reads', () => {
  it('publishes nothing when a superseded candle read then fails', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      candles: async () => {
        if (!first) return { thscode: '600519.SH', interval: '1d', truncated: false, candles: [candle(2, 22)] }
        first = false
        entered.resolve()
        await gate.promise
        throw new RemoteError('stock/upstream', 'too late', { endpoint: 'a-share.prices.historical' })
      },
    }
    const surface = new WatchlistSurface(watchlistStub(), stock)
    const superseded = surface.loadCandles('600519.SH', '1d', 0)
    await entered.promise
    const current = surface.loadCandles('600519.SH', '1d', 0)
    gate.resolve()
    await superseded
    await current
    expect(surface.candles.getSnapshot()).toMatchObject({ phase: 'ready' })
    expect(failureOf(surface.candles.getSnapshot())).toBeUndefined()
  })
})

describe('WatchlistSurface.loadDocuments', () => {
  it('publishes the rows under the channel it read, asking for the panel\u2019s row count', async () => {
    const requested: DocumentsRequest[] = []
    const rows = [documentRow('news', '公司新闻')]
    const surface = new WatchlistSurface(watchlistStub(), {
      ...stockStub(),
      documents: async (request) => { requested.push(request); return rows },
    })
    expect(surface.documents.getSnapshot()).toEqual({ phase: 'idle' })
    await surface.loadDocuments('贵州茅台', 'news')
    expect(requested).toEqual([{ name: '贵州茅台', kind: 'news', size: 10 }])
    expect(surface.documents.getSnapshot()).toEqual({ phase: 'ready', kind: 'news', rows })
  })

  it('publishes a failed read as its Remote code, naming the channel it was for', async () => {
    const surface = new WatchlistSurface(watchlistStub(), {
      ...stockStub(),
      documents: async () => {
        throw new RemoteError('stock/rate-limited', 'vendor throttled', { endpoint: 'iwencai.search.report' })
      },
    })
    await surface.loadDocuments('贵州茅台', 'report')
    expect(failureOf(surface.documents.getSnapshot())).toBe('stock/rate-limited')
    expect(surface.documents.getSnapshot()).toMatchObject({ phase: 'failed', kind: 'report' })
  })

  it('publishes nothing when a superseded channel read then succeeds', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      documents: async (_request: DocumentsRequest): Promise<readonly DocumentRow[]> => {
        if (!first) return [documentRow('announcement', '公告')]
        first = false
        entered.resolve()
        await gate.promise
        return [documentRow('report', '研报')]
      },
    }
    const surface = new WatchlistSurface(watchlistStub(), stock)
    const superseded = surface.loadDocuments('贵州茅台', 'report')
    await entered.promise
    const current = surface.loadDocuments('贵州茅台', 'announcement')
    gate.resolve()
    await superseded
    await current
    expect(surface.documents.getSnapshot()).toEqual({
      phase: 'ready',
      kind: 'announcement',
      rows: [documentRow('announcement', '公告')],
    })
  })
})

describe('WatchlistSurface superseded document reads', () => {
  it('publishes nothing when a superseded channel read then fails', async () => {
    const entered = deferred()
    const gate = deferred()
    let first = true
    const stock: IStockClient = {
      ...stockStub(),
      documents: async (): Promise<readonly DocumentRow[]> => {
        if (!first) return [documentRow('announcement', '公告')]
        first = false
        entered.resolve()
        await gate.promise
        throw new RemoteError('stock/upstream', 'too late', { endpoint: 'iwencai.search.report' })
      },
    }
    const surface = new WatchlistSurface(watchlistStub(), stock)
    const superseded = surface.loadDocuments('贵州茅台', 'report')
    await entered.promise
    const current = surface.loadDocuments('贵州茅台', 'announcement')
    gate.resolve()
    await superseded
    await current
    expect(surface.documents.getSnapshot()).toMatchObject({ phase: 'ready', kind: 'announcement' })
    expect(failureOf(surface.documents.getSnapshot())).toBeUndefined()
  })
})

describe('WatchlistSurface.search', () => {
  it('returns the candidates the Host resolved', async () => {
    const surface = new WatchlistSurface(watchlistStub(), stockStub())
    await expect(surface.search('茅台')).resolves.toEqual({
      ok: true,
      matches: [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }],
    })
  })

  it('answers a failed search with its Remote code', async () => {
    const surface = new WatchlistSurface(watchlistStub(), {
      ...stockStub(),
      searchSymbols: async () => { throw new RemoteError('stock/provider-unavailable', 'no provider', { endpoint: 'meta.tickers.search' }) },
    })
    await expect(surface.search('茅台')).resolves.toEqual({ ok: false, code: 'stock/provider-unavailable' })
  })
})
