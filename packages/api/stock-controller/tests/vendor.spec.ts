/**
 * The vendor-row readers on their own: which vendor field each wire field comes
 * from, what a row that cannot supply one produces, and how optional document
 * metadata degrades.
 */
import type { StockRow } from '@deepseek-ai/dsh-stock'
import { describe, expect, it } from 'vitest'
import {
  readNumber, readOptionalString, readString, toCandle, toDocument, toQuote, type RowContext,
} from '../src/vendor.ts'

const CONTEXT: RowContext = { endpoint: 'a-share.prices.snapshot' }
const INSTRUMENT: RowContext = { endpoint: 'a-share.prices.historical', thscode: '600519.SH' }

describe('the scalar readers', () => {
  it('reads a number, and a numeric string the vendor stringified', () => {
    expect(readNumber({ last_price: 1252.57 }, 'last_price', CONTEXT)).toBe(1252.57)
    expect(readNumber({ last_price: '1252.57' }, 'last_price', CONTEXT)).toBe(1252.57)
  })

  it('treats a blank string as no number rather than as zero', () => {
    expect(() => readNumber({ last_price: '   ' }, 'last_price', CONTEXT))
      .toThrow(/no usable "last_price"/)
  })

  it('refuses a value that is neither a number nor a numeric string', () => {
    expect(() => readNumber({ last_price: null }, 'last_price', CONTEXT)).toThrow()
    expect(() => readNumber({ last_price: {} }, 'last_price', CONTEXT)).toThrow()
    expect(() => readNumber({}, 'last_price', CONTEXT)).toThrow()
  })

  it('names the value it refused, including a value JSON cannot carry', () => {
    expect(() => readNumber({ last_price: null }, 'last_price', CONTEXT)).toThrow(/null/)
    expect(() => readNumber({}, 'last_price', CONTEXT)).toThrow(/undefined/)
  })

  it('refuses a value that is not finite', () => {
    expect(() => readNumber({ last_price: 'not-a-number' }, 'last_price', CONTEXT)).toThrow()
    expect(() => readNumber({ last_price: Number.POSITIVE_INFINITY }, 'last_price', CONTEXT)).toThrow()
  })

  it('reads a required string and refuses an empty or non-string one', () => {
    expect(readString({ thscode: '600519.SH' }, 'thscode', CONTEXT)).toBe('600519.SH')
    expect(() => readString({ thscode: '' }, 'thscode', CONTEXT)).toThrow(/no usable "thscode"/)
    expect(() => readString({ thscode: 600519 }, 'thscode', CONTEXT)).toThrow(/no usable "thscode"/)
  })

  it('reports an absent optional string as absent, not as an empty one', () => {
    expect(readOptionalString({ url: 'https://example.test/a' }, 'url')).toBe('https://example.test/a')
    expect(readOptionalString({ url: '' }, 'url')).toBeUndefined()
    expect(readOptionalString({}, 'url')).toBeUndefined()
  })

  it('names the instrument when the read was issued for one', () => {
    expect(() => readNumber({}, 'volume', INSTRUMENT)).toThrow(/for 600519\.SH/)
    expect(() => readNumber({}, 'volume', INSTRUMENT)).toThrow()
  })
})

describe('quote and candle projection', () => {
  it('maps every vendor field onto the wire field it becomes', () => {
    expect(toQuote({
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
    }, CONTEXT)).toEqual({
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
    })
  })

  it('maps the bar timestamp from the vendor\'s millisecond field', () => {
    expect(toCandle({
      date_ms: 1755792000000,
      open_price: 1396.89877,
      high_price: 1412.01877,
      low_price: 1392.78877,
      close_price: 1411.96877,
      volume: 4497058,
    }, INSTRUMENT)).toEqual({
      time: 1755792000000,
      open: 1396.89877,
      high: 1412.01877,
      low: 1392.78877,
      close: 1411.96877,
      volume: 4497058,
    })
  })
})

describe('document projection', () => {
  /** One gateway row with only the fields a test cares about. */
  function row(overrides: StockRow = {}): StockRow {
    return { title: '标题', publish_time: 1789660800, ...overrides }
  }

  it('reads the brokerage from a report\'s extra block', () => {
    expect(toDocument(row({ extra: JSON.stringify({ organization: '诚通证券' }) }), 'report', CONTEXT, 400))
      .toMatchObject({ kind: 'report', source: '诚通证券', publishedAt: 1789660800000 })
  })

  it('prefers the real outlet a news row reports over the platform that carried it', () => {
    expect(toDocument(
      row({ extra: JSON.stringify({ publish_source: '微信公众平台', real_publish_source: '国酒财经' }) }),
      'news',
      CONTEXT,
      400,
    )).toMatchObject({ source: '国酒财经' })
  })

  it('falls back to the platform when the row reports no real outlet', () => {
    expect(toDocument(
      row({ extra: JSON.stringify({ publish_source: '微信公众平台' }) }),
      'news',
      CONTEXT,
      400,
    )).toMatchObject({ source: '微信公众平台' })
  })

  it('leaves an announcement without a source, whatever its extra block says', () => {
    const projected = toDocument(
      row({ extra: JSON.stringify({ publish_source: '公告', organization: '某公司' }) }),
      'announcement',
      CONTEXT,
      400,
    )
    expect(projected.source).toBeUndefined()
  })

  it('treats non-object JSON, an absent block, and unreadable JSON alike', () => {
    for (const extra of ['"a string"', '42', 'not json', undefined, '']) {
      const projected = toDocument(extra === undefined ? row() : row({ extra }), 'report', CONTEXT, 400)
      expect(projected.source).toBeUndefined()
      expect(projected.title).toBe('标题')
    }
  })

  it('ignores an extra member that is not a non-empty string', () => {
    expect(toDocument(
      row({ extra: JSON.stringify({ organization: '' }) }),
      'report',
      CONTEXT,
      400,
    ).source).toBeUndefined()
    expect(toDocument(
      row({ extra: JSON.stringify({ organization: 42 }) }),
      'report',
      CONTEXT,
      400,
    ).source).toBeUndefined()
  })

  it('carries a link when the row has one and omits it otherwise', () => {
    expect(toDocument(row({ url: 'https://example.test/a' }), 'report', CONTEXT, 400).url)
      .toBe('https://example.test/a')
    expect(toDocument(row(), 'report', CONTEXT, 400).url).toBeUndefined()
  })

  it('reports an absent excerpt as empty rather than failing the row', () => {
    expect(toDocument(row(), 'report', CONTEXT, 400)).toMatchObject({ summary: '', summaryTruncated: false })
  })

  it('fails a row whose title the vendor did not supply', () => {
    expect(() => toDocument({ publish_time: 1 }, 'report', CONTEXT, 400)).toThrow(/no usable "title"/)
  })

  it('fails a row with no publication time rather than dating it to the epoch', () => {
    expect(() => toDocument({ title: '标题' }, 'report', CONTEXT, 400)).toThrow(/no usable "publish_time"/)
  })
})
