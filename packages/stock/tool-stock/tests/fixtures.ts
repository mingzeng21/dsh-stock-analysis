/**
 * Fixtures for the stock tool suite: registry records shaped like the generated
 * ones, and a provider that answers from memory. They keep the pure layers
 * (schema, description, rendering, registration) testable without the generated
 * registry, which only the package entry point reads.
 * @module @deepseek-ai/dsh-tool-stock/tests/fixtures
 */

import type { StockEndpoint, StockParam, StockParams, StockProvider, StockProviderRequest, StockResult } from '@deepseek-ai/dsh-stock'

/** One parameter with fixture defaults for everything the caller omits. */
export function param(spec: Partial<StockParam> & Pick<StockParam, 'name' | 'type'>): StockParam {
  return { required: false, description: `${spec.name} 的说明`, ...spec }
}

/** One registry record with fixture defaults for everything the caller omits. */
export function endpoint(spec: Partial<StockEndpoint> & Pick<StockEndpoint, 'id' | 'tool'>): StockEndpoint {
  return {
    universe: 'a-share',
    method: 'GET',
    path: `/api/${spec.id.split('.').join('/')}`,
    title: spec.tool,
    summary: `${spec.tool} 的用途。`,
    params: [],
    availability: 'open',
    paging: 'none',
    window: 'none',
    dateEncoding: 'none',
    source: 'mcp',
    ...spec,
  }
}

/** Records covering every parameter type, both summary branches, and each hint, family clause, and pool scope note. */
export const FIXTURE_ENDPOINTS: readonly StockEndpoint[] = [
  endpoint({
    id: 'meta.tickers.search',
    tool: 'stock_symbol_search',
    universe: 'meta',
    title: '标的检索',
    summary: '标的检索：按公司名或代码片段解析为标准 thscode。',
    params: [
      param({ name: 'q', type: 'string', required: true, description: '检索词' }),
      param({ name: 'asset_type', type: 'string', enum: ['stock', 'fund'], default: 'stock', description: '资产类型' }),
      param({ name: 'limit', type: 'integer', default: 10, description: '返回条数' }),
      param({ name: 'weight', type: 'number', description: '相似度权重' }),
      param({ name: 'strict', type: 'boolean', description: '是否精确匹配' }),
      param({ name: 'filters', type: 'object', description: 'JSON 过滤条件' }),
      param({ name: 'fields', type: 'array', description: 'JSON 字段列表' }),
    ],
    mcpTool: 'get_meta_tickers_search',
  }),
  endpoint({
    id: 'a-share.prices.snapshot',
    tool: 'stock_quote',
    title: '行情快照',
    summary: '按 thscodes 返回最新行情，等价于 get_a_share_prices_snapshot 的语义。',
    params: [param({ name: 'thscodes', type: 'string' })],
    mcpTool: 'get_a_share_prices_snapshot',
  }),
  endpoint({
    id: 'a-share.prices.historical',
    tool: 'stock_kline',
    title: '历史 K 线',
    summary: '取单只标的的历史 K 线序列。',
    params: [param({ name: 'thscode', type: 'string', required: true })],
    source: 'manual',
  }),
  endpoint({ id: 'a-share.special-data.limit-up-pool', tool: 'stock_limit_up_pool', title: '涨停池', summary: '涨停池。' }),
  endpoint({ id: 'a-share.special-data.limit-down-pool', tool: 'stock_limit_down_pool', title: '跌停池', summary: '跌停池。' }),
  endpoint({ id: 'a-share.special-data.limit-break-pool', tool: 'stock_limit_break_pool', title: '炸板池', summary: '炸板池。' }),
  endpoint({ id: 'a-share.special-data.limit-up-ladder', tool: 'stock_limit_up_ladder', title: '涨停天梯', summary: '涨停天梯。' }),
  endpoint({ id: 'fund.profile.detail', tool: 'fund_profile_detail', title: '', summary: '基金基本资料。' }),
  endpoint({
    id: 'a-share-index.prices.snapshot',
    tool: 'stock_index_quote',
    universe: 'a-share-index',
    title: '指数行情快照',
    summary: '按 thscodes 返回指数最新行情。',
    params: [param({ name: 'thscodes', type: 'string' })],
    mcpTool: 'get_a_share_index_prices_snapshot',
  }),
]

/** One recorded provider call. */
export interface RecordedCall {
  /** Capability the tool asked for. */
  readonly endpointId: string
  /** Parameters the seam validated and defaulted before dispatch. */
  readonly params: StockParams
  /** Cancellation the tool forwarded. */
  readonly signal: AbortSignal
}

/** A provider that answers from a caller-supplied function and records every call. */
export interface FixtureProvider {
  /** The provider to register on the seam. */
  readonly provider: StockProvider
  /** Calls received so far, in dispatch order. */
  readonly calls: RecordedCall[]
}

/**
 * Build a provider over fixture records.
 * @param endpoints - records the provider serves.
 * @param respond - produces one result per call.
 * @returns the provider plus its recorded call log.
 */
export function fixtureProvider(
  endpoints: readonly StockEndpoint[],
  respond: (request: StockProviderRequest) => StockResult | Promise<StockResult>,
): FixtureProvider {
  const calls: RecordedCall[] = []
  return {
    calls,
    provider: {
      id: 'fixture',
      endpoints,
      available: () => true,
      execute: async (request) => {
        calls.push({ endpointId: request.endpoint.id, params: request.params, signal: request.signal })
        return await respond(request)
      },
    },
  }
}
