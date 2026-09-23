/**
 * The Host service over a scripted stock seam: which capability each read
 * calls, what the vendor's rows become, and which failure a caller sees.
 */
import { Context } from '@deepseek-ai/cordis'
import type { StockResult, StockRow, SymbolMatch, SymbolQueryOptions } from '@deepseek-ai/dsh-stock'
import { describe, expect, it } from 'vitest'
import StockController, { type Config } from '../src/index.ts'

const SIGNAL = new AbortController().signal

/** One recorded seam call. */
interface Recorded {
  readonly endpointId: string
  readonly params: Readonly<Record<string, unknown>>
}

/** A context serving a scripted seam and the controller under test. */
interface Harness {
  readonly controller: StockController
  readonly calls: Recorded[]
  readonly symbolQueries: Array<{ query: string; options: SymbolQueryOptions }>
  /** Answer the next endpoint call with a result, or throw the given error. */
  answer(next: unknown): void
  /** Answer the next symbol resolution with matches, or throw the given error. */
  answerSymbols(next: readonly SymbolMatch[] | Error): void
}

/** Build the controller over a seam that records calls and replays one scripted answer. */
function harness(overrides: Partial<Config> = {}): Harness {
  let next: unknown = { endpointId: '', rows: [], meta: { truncated: false } }
  let nextSymbols: readonly SymbolMatch[] | Error = []
  const calls: Recorded[] = []
  const symbolQueries: Array<{ query: string; options: SymbolQueryOptions }> = []
  const ctx = new Context()
  ctx.provide('stock', {
    call: async (endpointId: string, params: Readonly<Record<string, unknown>> = {}) => {
      calls.push({ endpointId, params })
      // A scripted result is served; anything else is thrown, so a test can pin
      // how a non-Error and a code-carrying non-Error both classify.
      if (typeof next === 'object' && next !== null && 'rows' in next && 'meta' in next) return next as StockResult
      throw next
    },
    resolveSymbols: async (query: string, options: SymbolQueryOptions = {}) => {
      symbolQueries.push({ query, options })
      if (nextSymbols instanceof Error) throw nextSymbols
      return nextSymbols
    },
  } as never)
  return {
    controller: new StockController(ctx, {
      maxQuotes: 50,
      maxDocuments: 30,
      maxSummaryChars: 400,
      maxSymbolMatches: 20,
      ...overrides,
    }),
    calls,
    symbolQueries,
    answer: (value) => { next = value },
    answerSymbols: (value) => { nextSymbols = value },
  }
}

/** One seam result with the batch facts a test cares about. */
function result(endpointId: string, rows: StockRow[], extra: { asOf?: number; truncated?: boolean } = {}): StockResult {
  return {
    endpointId,
    rows,
    meta: {
      truncated: extra.truncated ?? false,
      ...extra.asOf === undefined ? {} : { asOf: extra.asOf },
    },
  }
}

/** A seam failure carrying the code the provider would have thrown. */
function stockError(code: string, message = code): Error {
  return Object.assign(new Error(message), { code })
}

/** One complete quote row, overridable per test. */
function quoteRow(overrides: Record<string, unknown> = {}): StockRow {
  return {
    thscode: '600519.SH',
    last_price: 1252.57,
    price_change: -4.55,
    price_change_ratio_pct: -0.361938,
    open_price: 1259,
    high_price: 1259.95,
    low_price: 1250.8,
    prev_price: 1257.12,
    volume: 2501689,
    turnover: 3135910000,
    ...overrides,
  }
}

/** One complete candle row, overridable per test. */
function candleRow(overrides: Record<string, unknown> = {}): StockRow {
  return {
    date_ms: 1755792000000,
    open_price: 1396.89877,
    high_price: 1412.01877,
    low_price: 1392.78877,
    close_price: 1411.96877,
    volume: 4497058,
    ...overrides,
  }
}

describe('stockController.searchSymbols', () => {
  it('resolves through the seam, filters to the read surface\'s universe, and projects every field', async () => {
    const h = harness()
    h.answerSymbols([{
      thscode: '600519.SH',
      ticker: '600519',
      name: '贵州茅台',
      assetType: 'a-share',
      exchange: 'SH',
    }])
    await expect(h.controller.searchSymbols('贵州茅台', 5, SIGNAL)).resolves.toEqual([
      { thscode: '600519.SH', ticker: '600519', name: '贵州茅台', assetType: 'a-share', exchange: 'SH' },
    ])
    expect(h.symbolQueries).toEqual([{ query: '贵州茅台', options: { assetType: 'a-share', limit: 5 } }])
  })

  it('omits an optional field the seam did not resolve', async () => {
    const h = harness()
    h.answerSymbols([{ thscode: '000001.SZ', ticker: '000001', name: '平安银行' }])
    await expect(h.controller.searchSymbols('平安银行', 5, SIGNAL)).resolves.toEqual([
      { thscode: '000001.SZ', ticker: '000001', name: '平安银行' },
    ])
  })

  it('caps the desired count instead of forwarding it', async () => {
    const h = harness({ maxSymbolMatches: 3 })
    h.answerSymbols([])
    await h.controller.searchSymbols('平安', 500, SIGNAL)
    expect(h.symbolQueries[0]?.options.limit).toBe(3)
  })

  it('refuses a blank query before reaching the seam', async () => {
    const h = harness()
    await expect(h.controller.searchSymbols('   ', 5, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect(h.symbolQueries).toEqual([])
  })

  it('refuses a non-positive limit', async () => {
    const h = harness()
    await expect(h.controller.searchSymbols('平安', 0, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
  })

  it('refuses a call whose caller is already gone, without reaching the seam', async () => {
    const h = harness()
    const aborted = new AbortController()
    aborted.abort()
    await expect(h.controller.searchSymbols('平安', 5, aborted.signal))
      .rejects.toMatchObject({ code: 'stock/cancelled' })
    expect(h.symbolQueries).toEqual([])
  })
})

describe('stockController.quotes', () => {
  it('batches every code into one call and normalizes the row', async () => {
    const h = harness()
    h.answer(result('a-share.prices.snapshot', [quoteRow()], { asOf: 1789560797000 }))
    await expect(h.controller.quotes(['600519.SH', '000001.SZ'], SIGNAL)).resolves.toEqual({
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
    })
    expect(h.calls).toEqual([{
      endpointId: 'a-share.prices.snapshot',
      params: { thscodes: '600519.SH,000001.SZ' },
    }])
  })

  it('drops blanks and duplicates before the vendor sees them', async () => {
    const h = harness()
    h.answer(result('a-share.prices.snapshot', []))
    await h.controller.quotes(['600519.SH', ' 600519.SH ', '', '000001.SZ'], SIGNAL)
    expect(h.calls[0]?.params).toEqual({ thscodes: '600519.SH,000001.SZ' })
  })

  it('omits the timestamp when the vendor reports none', async () => {
    const h = harness()
    h.answer(result('a-share.prices.snapshot', []))
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).resolves.toEqual({ quotes: [] })
  })

  it('refuses an empty batch and one above the configured cap', async () => {
    const h = harness({ maxQuotes: 1 })
    await expect(h.controller.quotes([], SIGNAL)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(h.controller.quotes(['600519.SH', '000001.SZ'], SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect(h.calls).toEqual([])
  })

  it('accepts a numeric string, because the vendor is inconsistent about JSON number encoding', async () => {
    const h = harness()
    h.answer(result('a-share.prices.snapshot', [quoteRow({ last_price: '1252.57' })]))
    const batch = await h.controller.quotes(['600519.SH'], SIGNAL)
    expect(batch.quotes[0]?.last).toBe(1252.57)
  })

  it('fails the read when a row cannot produce a value the surface needs', async () => {
    const h = harness()
    h.answer(result('a-share.prices.snapshot', [quoteRow({ last_price: null })]))
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toMatchObject({
      code: 'stock/malformed-row',
      details: { endpoint: 'a-share.prices.snapshot', field: 'last_price' },
    })
  })
})

describe('stockController.candles', () => {
  it('passes the vendor\'s own interval and normalizes every bar', async () => {
    const h = harness()
    h.answer(result('a-share.prices.historical', [candleRow()], { asOf: 1758211200000 }))
    await expect(h.controller.candles({
      thscode: '600519.SH',
      interval: '1w',
      start: 1755792000000,
      end: 1758384000000,
    }, SIGNAL)).resolves.toEqual({
      thscode: '600519.SH',
      interval: '1w',
      asOf: 1758211200000,
      truncated: false,
      candles: [{
        time: 1755792000000,
        open: 1396.89877,
        high: 1412.01877,
        low: 1392.78877,
        close: 1411.96877,
        volume: 4497058,
      }],
    })
    expect(h.calls[0]).toEqual({
      endpointId: 'a-share.prices.historical',
      params: {
        thscode: '600519.SH',
        interval: '1w',
        adjust: 'forward',
        start: 1755792000000,
        end: 1758384000000,
      },
    })
  })

  it('carries the seam\'s truncation fact instead of hiding a capped series', async () => {
    const h = harness()
    h.answer(result('a-share.prices.historical', [], { truncated: true }))
    const series = await h.controller.candles({
      thscode: '600519.SH',
      interval: '1d',
      start: 0,
      end: 1,
    }, SIGNAL)
    expect(series.truncated).toBe(true)
  })

  it('refuses a blank thscode, a reversed window, and a window past ten years', async () => {
    const h = harness()
    const base = { thscode: '600519.SH', interval: '1d' } as const
    await expect(h.controller.candles({ ...base, thscode: ' ', start: 0, end: 1 }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(h.controller.candles({ ...base, start: 10, end: 5 }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(h.controller.candles({ ...base, start: 1.5, end: 2 }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(h.controller.candles({
      ...base,
      start: Date.UTC(2015, 0, 1),
      end: Date.UTC(2026, 0, 2),
    }, SIGNAL)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect(h.calls).toEqual([])
  })

  it('accepts a window that ends exactly ten years after its start', async () => {
    const h = harness()
    h.answer(result('a-share.prices.historical', []))
    const start = Date.UTC(2016, 0, 1)
    const limit = new Date(start)
    limit.setFullYear(limit.getFullYear() + 10)
    await expect(h.controller.candles({
      thscode: '600519.SH',
      interval: '1d',
      start,
      end: limit.getTime(),
    }, SIGNAL)).resolves.toMatchObject({ truncated: false })
  })
})

describe('stockController.documents', () => {
  it('names the channel in the query and projects the row', async () => {
    const h = harness()
    h.answer(result('iwencai.search.report', [{
      title: '贵州茅台（600519）：公司跟踪报告',
      summary: '估值与投资建议',
      url: 'https://ms.10jqka.com.cn/report/1',
      publish_time: 1789660800,
      extra: JSON.stringify({ organization: '诚通证券', author: '陈文倩' }),
    }]))
    await expect(h.controller.documents({ name: '贵州茅台', kind: 'report', size: 10 }, SIGNAL)).resolves.toEqual([{
      kind: 'report',
      title: '贵州茅台（600519）：公司跟踪报告',
      source: '诚通证券',
      publishedAt: 1789660800000,
      summary: '估值与投资建议',
      summaryTruncated: false,
      url: 'https://ms.10jqka.com.cn/report/1',
    }])
    expect(h.calls[0]).toEqual({
      endpointId: 'iwencai.search.report',
      params: { query: '贵州茅台 研报', size: 10 },
    })
  })

  it('reads the outlet a news row reports and the channel\'s own query word', async () => {
    const h = harness()
    h.answer(result('iwencai.search.news', [{
      title: '贵州茅台被执行158万元？茅台最新回应！',
      publish_time: 1789560216,
      extra: JSON.stringify({ publish_source: '微信公众平台', real_publish_source: '国酒财经' }),
    }]))
    const rows = await h.controller.documents({ name: '贵州茅台', kind: 'news', size: 5 }, SIGNAL)
    expect(rows[0]?.source).toBe('国酒财经')
    expect(h.calls[0]?.params).toEqual({ query: '贵州茅台 新闻', size: 5 })
  })

  it('leaves the source absent for an announcement, whose channel has none', async () => {
    const h = harness()
    h.answer(result('iwencai.search.announcement', [{
      title: '贵州茅台重大事项公告',
      summary: '正文',
      publish_time: 1784304000,
      extra: JSON.stringify({ publish_source: '公告' }),
    }]))
    const rows = await h.controller.documents({ name: '贵州茅台', kind: 'announcement', size: 5 }, SIGNAL)
    expect(rows[0]).toEqual({
      kind: 'announcement',
      title: '贵州茅台重大事项公告',
      publishedAt: 1784304000000,
      summary: '正文',
      summaryTruncated: false,
    })
    expect(h.calls[0]?.params).toEqual({ query: '贵州茅台 公告', size: 5 })
  })

  it('cuts an over-long excerpt to the configured cap and says so', async () => {
    const h = harness({ maxSummaryChars: 4 })
    h.answer(result('iwencai.search.report', [{
      title: '标题',
      summary: '一二三四五六',
      publish_time: 1,
    }]))
    const rows = await h.controller.documents({ name: '贵州茅台', kind: 'report', size: 1 }, SIGNAL)
    expect(rows[0]).toMatchObject({ summary: '一二三四', summaryTruncated: true })
  })

  it('keeps a row whose vendor metadata is unreadable', async () => {
    const h = harness()
    h.answer(result('iwencai.search.report', [{
      title: '标题',
      summary: '摘要',
      publish_time: 1,
      extra: 'not json',
    }]))
    const rows = await h.controller.documents({ name: '贵州茅台', kind: 'report', size: 1 }, SIGNAL)
    expect(rows[0]).toMatchObject({ title: '标题' })
    expect(rows[0]?.source).toBeUndefined()
  })

  it('caps the row count and refuses a blank instrument name', async () => {
    const h = harness({ maxDocuments: 2 })
    h.answer(result('iwencai.search.report', []))
    await h.controller.documents({ name: '贵州茅台', kind: 'report', size: 99 }, SIGNAL)
    expect(h.calls[0]?.params).toEqual({ query: '贵州茅台 研报', size: 2 })
    await expect(h.controller.documents({ name: ' ', kind: 'report', size: 1 }, SIGNAL))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
  })
})

describe('stockController seam failures', () => {
  it('maps each seam code onto its Remote code and keeps the read in the details', async () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['STOCK_RATE_LIMITED', 'stock/rate-limited'],
      ['STOCK_UNAUTHENTICATED', 'stock/unauthenticated'],
      ['STOCK_FORBIDDEN', 'stock/forbidden'],
      ['STOCK_NOT_FOUND', 'stock/not-found'],
      ['STOCK_NO_DATA', 'stock/no-data'],
      ['STOCK_UNSUPPORTED_ASSET', 'stock/unsupported-asset'],
      ['STOCK_CAPABILITY_CLOSED', 'stock/capability-closed'],
      ['STOCK_CANCELLED', 'stock/cancelled'],
      ['STOCK_INVALID_PARAMS', 'stock/invalid-params'],
      ['STOCK_UNKNOWN_ENDPOINT', 'stock/unavailable-capability'],
      ['STOCK_PROVIDER_UNAVAILABLE', 'stock/provider-unavailable'],
      ['STOCK_PROVIDER_CONFIGURED_MISSING', 'stock/provider-unavailable'],
      ['STOCK_PROVIDER_AMBIGUOUS', 'stock/provider-unavailable'],
      ['STOCK_UPSTREAM', 'stock/upstream'],
      ['STOCK_MALFORMED_RESPONSE', 'stock/upstream'],
    ]
    for (const [seamCode, remoteCode] of cases) {
      const h = harness()
      h.answer(stockError(seamCode, 'vendor said no'))
      await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toMatchObject({
        code: remoteCode,
        details: { endpoint: 'a-share.prices.snapshot' },
      })
    }
  })

  it('names the instrument a per-instrument read failed on', async () => {
    const h = harness()
    h.answer(stockError('STOCK_NO_DATA'))
    await expect(h.controller.candles({
      thscode: '600519.SH',
      interval: '1d',
      start: 0,
      end: 1,
    }, SIGNAL)).rejects.toMatchObject({
      code: 'stock/no-data',
      details: { endpoint: 'a-share.prices.historical', thscode: '600519.SH' },
    })
  })

  it('propagates an error that is not a seam failure, rather than folding it into a stock code', async () => {
    const h = harness()
    h.answer(new Error('programming defect'))
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toThrow('programming defect')
  })

  it('propagates a thrown non-object unchanged', async () => {
    const h = harness()
    h.answer('not an error')
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toBe('not an error')
  })

  it('classifies a thrown value that carries a stock code without being an Error', async () => {
    const h = harness()
    h.answer({ code: 'STOCK_UPSTREAM', message: 'vendor failed' })
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toMatchObject({ code: 'stock/upstream' })
  })

  it('folds a stock code this build does not know onto the upstream failure', async () => {
    const h = harness()
    h.answer(stockError('STOCK_SOMETHING_NEW'))
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toMatchObject({ code: 'stock/upstream' })
  })

  it('ignores an unrelated code on a thrown error', async () => {
    const h = harness()
    h.answer(stockError('ENOENT'))
    await expect(h.controller.quotes(['600519.SH'], SIGNAL)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
