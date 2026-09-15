/**
 * Model-facing descriptions: vendor-name localization, summary/title
 * composition, instrument-code hints, the near-synonym family clauses that
 * keep the limit pools and the anomaly tools apart, and the pool scope notes
 * that warn off codes the vendor's pool omits.
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_ENDPOINTS, endpoint, param } from './fixtures.ts'
import {
  FAMILY_DISAMBIGUATION,
  POOL_SCOPE_NOTES,
  SYMBOL_HINT_MULTI,
  SYMBOL_HINT_SINGLE,
  buildToolAliases,
  describeEndpoint,
} from '../src/describe.ts'

const aliases = buildToolAliases(FIXTURE_ENDPOINTS)
const byTool = (tool: string) => FIXTURE_ENDPOINTS.find(candidate => candidate.tool === tool)!

describe('vendor tool name localization', () => {
  it('maps each mirrored vendor tool name to the registered tool name', () => {
    expect(aliases.get('get_a_share_prices_snapshot')).toBe('stock_quote')
    expect(aliases.get('get_meta_tickers_search')).toBe('stock_symbol_search')
    expect(aliases.has('get_fund_profile_detail')).toBe(false)
  })

  it('rewrites a vendor tool name that appears in vendor prose', () => {
    const description = describeEndpoint(byTool('stock_quote'), aliases)
    expect(description).toContain('等价于 stock_quote 的语义')
    expect(description).not.toContain('get_a_share_')
  })

  it('rewrites the longest matching vendor name first', () => {
    // A vendor name that is a prefix of another must not consume it: with the
    // shorter alias applied first, `vendor_short` is a prefix of the `_long`
    // name and the tail would survive as literal text.
    const short = endpoint({ id: 'a.short', tool: 'tool_short', mcpTool: 'vendor_short' })
    const long = endpoint({ id: 'a.long', tool: 'tool_long', mcpTool: 'vendor_short_long' })
    const referring = endpoint({ id: 'a.ref', tool: 'tool_ref', summary: '等价于 vendor_short_long 的语义。' })
    const nested = buildToolAliases([short, long, referring])
    expect(describeEndpoint(referring, nested)).toContain('等价于 tool_long 的语义')
  })
})

describe('description composition', () => {
  it('does not repeat a title the summary already opens with', () => {
    const description = describeEndpoint(byTool('stock_quote'), aliases)
    expect(description.startsWith('行情快照。按 thscodes 返回最新行情')).toBe(true)
    expect(description.match(/行情快照/g)).toHaveLength(1)
  })

  it('joins the title when the summary opens differently', () => {
    expect(describeEndpoint(byTool('stock_kline'), aliases)).toContain('历史 K 线。取单只标的的历史 K 线序列。 ')
  })

  it('falls back to the summary when the registry carries no title', () => {
    expect(describeEndpoint(byTool('fund_profile_detail'), aliases))
      .toContain('基金基本资料。')
  })

  it('produces a non-empty description for every record', () => {
    for (const candidate of FIXTURE_ENDPOINTS) {
      expect(describeEndpoint(candidate, aliases).trim().length).toBeGreaterThan(0)
    }
  })
})

describe('instrument-code hints', () => {
  it('names the single-code form and the resolver tool', () => {
    expect(describeEndpoint(byTool('stock_kline'), aliases)).toContain(SYMBOL_HINT_SINGLE)
  })

  it('names the comma-separated form and the resolver tool', () => {
    expect(describeEndpoint(byTool('stock_quote'), aliases)).toContain(SYMBOL_HINT_MULTI)
  })

  it('adds no hint to a capability that takes no thscode', () => {
    const description = describeEndpoint(byTool('stock_limit_up_pool'), aliases)
    expect(description).not.toContain('stock_symbol_search 解析')
  })

  it('prefers the single-code hint when both forms are declared', () => {
    const both = endpoint({
      id: 'a-share.both',
      tool: 'stock_both',
      params: [param({ name: 'thscode', type: 'string' }), param({ name: 'thscodes', type: 'string' })],
    })
    const description = describeEndpoint(both, aliases)
    expect(description).toContain(SYMBOL_HINT_SINGLE)
    expect(description).not.toContain(SYMBOL_HINT_MULTI)
  })
})

describe('near-synonym families', () => {
  const family = ['stock_limit_up_pool', 'stock_limit_down_pool', 'stock_limit_break_pool', 'stock_limit_up_ladder']

  it('states a 口径 clause for every member and names a sibling', () => {
    for (const tool of family) {
      const description = describeEndpoint(byTool(tool), aliases)
      expect(description).toContain('口径：')
      const siblings = family.filter(sibling => sibling !== tool)
      expect(siblings.some(sibling => description.includes(sibling))).toBe(true)
    }
  })

  it('keeps every member description distinct', () => {
    const descriptions = family.map(tool => describeEndpoint(byTool(tool), aliases))
    expect(new Set(descriptions).size).toBe(family.length)
  })

  it('pins the closing-stock clause verbatim', () => {
    expect(FAMILY_DISAMBIGUATION['stock_limit_up_pool']).toBe(
      '口径：当日收盘涨停（封板成功）的股票池。盘中曾涨停而收盘未封住者不在此列，见 stock_limit_break_pool；'
      + '跌停方向见 stock_limit_down_pool；按连板高度分组的矩阵见 stock_limit_up_ladder。',
    )
  })

  it('leaves a capability outside every family without a clause', () => {
    expect(FAMILY_DISAMBIGUATION['stock_quote']).toBeUndefined()
    expect(describeEndpoint(byTool('stock_quote'), aliases)).not.toContain('口径：')
  })
})

describe('pool scope notes', () => {
  it('warms the model off index-pool codes the transport rejects', () => {
    const description = describeEndpoint(byTool('stock_index_quote'), aliases)
    expect(description).toContain('899050.BJ')
    expect(description).toContain('932000.CSI')
    expect(description).toContain('Unknown thscode')
  })

  it('offers an accepted code for the same question', () => {
    const description = describeEndpoint(byTool('stock_index_quote'), aliases)
    expect(description).toContain('000300.SH')
  })

  it('pins the index-pool clause verbatim', () => {
    expect(POOL_SCOPE_NOTES['stock_index_quote']).toBe(
      '指数池不含北证50（899050.BJ）与中证2000（932000.CSI），传入会报 Unknown thscode；'
      + '中证系列已收录的写 .SH 形式（沪深300=000300.SH、中证500=000905.SH、中证1000=000852.SH）。',
    )
  })

  it('confines the note to the capability that carries it', () => {
    // `.BJ` is a valid *stock* code, so the note must never reach a capability
    // whose pool accepts it — the shared `thscodes` hint is the wrong carrier.
    for (const tool of ['stock_quote', 'stock_symbol_search', 'stock_kline']) {
      expect(POOL_SCOPE_NOTES[tool]).toBeUndefined()
      expect(describeEndpoint(byTool(tool), aliases)).not.toContain('Unknown thscode')
    }
  })

  it('stacks the pool note after the instrument hint on a thscodes capability', () => {
    const description = describeEndpoint(byTool('stock_index_quote'), aliases)
    expect(description.indexOf(SYMBOL_HINT_MULTI)).toBeLessThan(description.indexOf('指数池不含'))
  })
})
