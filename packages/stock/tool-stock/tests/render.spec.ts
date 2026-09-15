/**
 * Native rendering: batch facts always lead, row formatting is total over the
 * vendor's JSON, and the character budget drops rows with an explicit note
 * rather than silently shortening the answer.
 */

import { describe, expect, it } from 'vitest'
import { renderStockResult } from '../src/render.ts'
import { toStockToolValue } from '../src/value.ts'
import type { StockResult } from '@deepseek-ai/dsh-stock'

/** One seam result with fixture defaults for the batch facts. */
function result(partial: Partial<StockResult> & Pick<StockResult, 'rows'>): StockResult {
  return { endpointId: 'a-share.prices.snapshot', meta: { truncated: false }, ...partial }
}

const BUDGET = 100_000

describe('batch facts', () => {
  it('leads with the capability and the row count', () => {
    const text = renderStockResult(toStockToolValue(result({ rows: [{ a: 1 }] })), BUDGET)
    expect(text.split('\n')[0]).toBe('a-share.prices.snapshot: 1 行')
  })

  it('renders the vendor timestamp as a Shanghai wall clock', () => {
    const text = renderStockResult(
      toStockToolValue(result({ rows: [], meta: { truncated: false, asOf: Date.UTC(2026, 8, 14, 7, 32, 26) } })),
      BUDGET,
    )
    expect(text).toContain('asOf: 2026-09-14 15:32:26 +08:00')
  })

  it('reports an upstream total, a local truncation, and a continuation', () => {
    const text = renderStockResult(
      toStockToolValue(result({ rows: [], meta: { truncated: true, total: 5123, next: { offset: 100 } } })),
      BUDGET,
    )
    expect(text).toContain('上游总行数: 5123')
    expect(text).toContain('已截断: 本地只保留了前若干行')
    expect(text).toContain('next: {"offset":100}（本页已满，可能还有更多）')
  })

  it('does not tell the model to continue when the seam reported no continuation', () => {
    const text = renderStockResult(
      toStockToolValue(result({ rows: [{ a: 1 }], meta: { truncated: true } })),
      BUDGET,
    )
    expect(text).toContain('已截断: 本地只保留了前若干行')
    expect(text).not.toContain('next:')
  })

  it('says so when the capability returned nothing', () => {
    const text = renderStockResult(toStockToolValue(result({ rows: [] })), BUDGET)
    expect(text).toContain('（本次返回 0 行）')
  })

  it('omits facts the seam did not report', () => {
    const text = renderStockResult(toStockToolValue(result({ rows: [{ a: 1 }] })), BUDGET)
    expect(text).not.toContain('asOf:')
    expect(text).not.toContain('上游总行数:')
    expect(text).not.toContain('已截断:')
    expect(text).not.toContain('next:')
    expect(text).not.toContain('（本次返回 0 行）')
  })
})

describe('row rendering', () => {
  it('renders a record as key=value pairs in vendor field order', () => {
    const text = renderStockResult(
      toStockToolValue(result({ rows: [{ thscode: '600519.SH', last_price: 1277.8, halted: false, note: null }] })),
      BUDGET,
    )
    expect(text).toContain('1. thscode=600519.SH last_price=1277.8 halted=false note=null')
  })

  it('renders nested values as JSON and missing values as null', () => {
    const text = renderStockResult(
      toStockToolValue(result({ rows: [{ extra: { a: [1, 2] }, absent: undefined }] })),
      BUDGET,
    )
    expect(text).toContain('extra={"a":[1,2]} absent=null')
  })

  it('renders a row that is not a record as a single cell', () => {
    // A non-record row is the defensive case over untrusted vendor JSON, which
    // the seam's row type cannot express; the assertion is the point of the test.
    const text = renderStockResult(toStockToolValue(result({ rows: ['600519.SH', 42] as unknown as StockResult['rows'] })), BUDGET)
    expect(text).toContain('1. 600519.SH')
    expect(text).toContain('2. 42')
  })

  it('renders a record with no fields as an empty row', () => {
    expect(renderStockResult(toStockToolValue(result({ rows: [{}] })), BUDGET)).toContain('1. （空行）')
  })
})

describe('render budget', () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ thscode: `60051${index}.SH` }))

  it('keeps every row that fits', () => {
    const text = renderStockResult(toStockToolValue(result({ rows })), BUDGET)
    expect(text).toContain('5. thscode=600514.SH')
    expect(text).not.toContain('仅显示')
  })

  it('drops rows past the budget and reports how many were shown', () => {
    const text = renderStockResult(toStockToolValue(result({ rows })), 60)
    expect(text).toContain('a-share.prices.snapshot: 5 行')
    expect(text).toContain('…（仅显示 1/5 行：渲染上限 60 字符）')
    expect(text).not.toContain('5. thscode=600514.SH')
  })

  it('keeps the batch facts even when the budget excludes every row', () => {
    const text = renderStockResult(
      toStockToolValue(result({ rows, meta: { truncated: false, asOf: 0, total: 5 } })),
      1,
    )
    expect(text).toContain('a-share.prices.snapshot: 5 行')
    expect(text).toContain('asOf: 1970-01-01 08:00:00 +08:00')
    expect(text).toContain('上游总行数: 5')
    expect(text).toContain('…（仅显示 0/5 行：渲染上限 1 字符）')
  })
})
