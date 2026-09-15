/**
 * Canonical-value projection from a seam result: optional batch facts appear
 * only when the seam reported them, and rows are republished unchanged.
 */

import { describe, expect, it } from 'vitest'
import { toStockToolValue } from '../src/value.ts'

describe('canonical value projection', () => {
  it('carries only the batch facts the seam reported', () => {
    expect(toStockToolValue({
      endpointId: 'a-share.prices.snapshot',
      rows: [{ thscode: '600519.SH' }],
      meta: { truncated: false },
    })).toEqual({
      endpointId: 'a-share.prices.snapshot',
      count: 1,
      truncated: false,
      rows: [{ thscode: '600519.SH' }],
    })
  })

  it('carries every batch fact the seam reported', () => {
    expect(toStockToolValue({
      endpointId: 'a-share.prices.snapshot',
      rows: [],
      meta: { truncated: true, asOf: 1_784_275_991_000, total: 5123, next: { offset: 100 } },
    })).toEqual({
      endpointId: 'a-share.prices.snapshot',
      count: 0,
      truncated: true,
      asOf: 1_784_275_991_000,
      total: 5123,
      next: { offset: 100 },
      rows: [],
    })
  })
})
