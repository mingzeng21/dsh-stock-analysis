/**
 * Generate the stock endpoint registry from the vendor's published contracts.
 *
 * Inputs are checked-in snapshots under
 * `packages/stock/stock-hithink/contracts/` — the six MCP `tools/list`
 * responses (parameter schemas), the CLI package's `schemas/capabilities.json`
 * (REST paths, paging models, history windows), and the MCP tool to REST path
 * table from the vendor documentation. The vendor publishes no OpenAPI
 * document, so this join is the machine-readable contract.
 *
 * `--check` re-derives the module and compares it with the committed artifact
 * without touching the network or requiring an API key.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  StockDateEncoding,
  StockEndpoint,
  StockPaging,
  StockParam,
  StockParamType,
  StockUniverse,
  StockWindow,
} from '@deepseek-ai/dsh-stock'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACTS = join(ROOT, 'packages/stock/stock-hithink/contracts')
const OUTPUT = join(ROOT, 'packages/stock/stock-hithink/src/catalog/generated.ts')

/** Shape of one MCP tool as the vendor lists it. */
interface McpTool {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    required?: string[]
    properties?: Record<string, McpProperty>
  }
}

interface McpProperty {
  type?: string
  description?: string
  default?: string | number | boolean
  enum?: unknown[]
  anyOf?: { type?: string }[]
  items?: { type?: string }
}

/** Shape of one CLI capability record. */
interface CliCapability {
  id: string
  endpoint?: string
  method?: string
  paging?: string
  window?: string
  source?: string
}

/**
 * Curated model-facing tool names. The vendor's MCP names are long and
 * near-synonymous (`get_a_share_special_data_limit_up_pool` against
 * `..._limit_break_pool`), which costs selection accuracy; these are the names
 * the model actually sees. Fund/futures/options names are mechanical
 * (`get_` stripped) because that family is already unambiguous.
 */
const TOOL_OVERRIDES: Readonly<Record<string, string>> = {
  get_meta_tickers_search: 'stock_symbol_search',
  get_meta_tickers_list: 'stock_symbol_list',
  get_a_share_prices_snapshot: 'stock_quote',
  get_a_share_prices_historical: 'stock_kline',
  get_a_share_valuations_snapshot: 'stock_valuation',
  get_a_share_corporate_actions_adjustment_factors: 'stock_adjustment_factors',
  get_a_share_calendar_trading_days: 'stock_trading_calendar',
  get_a_share_financials_income_statements: 'stock_financials_income',
  get_a_share_financials_balance_sheets: 'stock_financials_balance',
  get_a_share_financials_cash_flow_statements: 'stock_financials_cashflow',
  get_a_share_financials_indicators: 'stock_financials_indicators',
  get_a_share_auction_snapshot: 'stock_auction_snapshot',
  get_a_share_auction_short_term_benchmark: 'stock_auction_benchmark',
  get_a_share_special_data_limit_up_pool: 'stock_limit_up_pool',
  get_a_share_special_data_limit_down_pool: 'stock_limit_down_pool',
  get_a_share_special_data_limit_break_pool: 'stock_limit_break_pool',
  get_a_share_special_data_limit_up_ladder: 'stock_limit_up_ladder',
  get_a_share_special_data_skyrocket_list: 'stock_skyrocket_list',
  get_a_share_special_data_hot_stock_list: 'stock_hot_list',
  get_a_share_special_data_hot_stock_list_history: 'stock_hot_list_history',
  get_a_share_special_data_hot_stock_rank_trend: 'stock_hot_rank_trend',
  get_a_share_special_data_dragon_tiger_list: 'stock_dragon_tiger_list',
  get_a_share_special_data_anomaly_analysis_stock: 'stock_anomaly_analysis',
  get_a_share_index_catalog_ths_index_list: 'stock_index_catalog',
  get_a_share_index_constituents_ths_stock_list: 'stock_index_constituents',
  get_a_share_index_prices_snapshot: 'stock_index_quote',
  get_a_share_index_prices_historical: 'stock_index_kline',
}

/**
 * Capabilities the vendor publishes but does not mirror as MCP tools, so no
 * `inputSchema` exists for them. Parameters are transcribed from the REST
 * reference pages; `source: 'manual'` marks them for review.
 */
const MANUAL_TOOLS: readonly {
  tool: string
  universe: StockUniverse
  path: string
  title: string
  summary: string
  params: readonly StockParam[]
  paging: StockPaging
  window: StockWindow
  dateEncoding: StockDateEncoding | 'none'
  availability: 'open' | 'unavailable'
}[] = [
  {
    tool: 'stock_anomaly_analysis_list',
    universe: 'a-share',
    path: '/api/a-share/special-data/anomaly-analysis-list',
    title: '个股异动原因列表',
    summary: '查询当日个股异动原因，可选按异动标签过滤；不传 tag_codes 时返回全部当日记录。',
    params: [
      {
        name: 'tag_codes',
        type: 'string',
        required: false,
        description:
          '异动标签，逗号分隔，多个值为 OR 关系；合法值 LIMIT_UP/LIMIT_DOWN/SHARP_RISE/SHARP_FALL/RAPID_RALLY/RAPID_DECLINE。',
        enum: ['LIMIT_UP', 'LIMIT_DOWN', 'SHARP_RISE', 'SHARP_FALL', 'RAPID_RALLY', 'RAPID_DECLINE'],
      },
    ],
    paging: 'none',
    window: 'today-only',
    dateEncoding: 'none',
    availability: 'open',
  },
  {
    tool: 'fund_backtest_indicators',
    universe: 'fund',
    path: '/api/fund/backtest/indicators',
    title: '基金回测可用指标',
    summary: '查询在线回测支持的指标、操作符与规则，无业务参数。',
    params: [],
    paging: 'none',
    window: 'none',
    dateEncoding: 'none',
    availability: 'open',
  },
  {
    tool: 'fund_backtest_result',
    universe: 'fund',
    path: '/api/fund/backtest/result',
    title: '基金在线回测',
    summary: '按买入卖出条件执行基金在线回测，返回交易明细与净值曲线。',
    params: [
      { name: 'thscode', type: 'string', required: true, description: '含市场后缀的完整基金代码，例如 000001.OF。' },
      { name: 'buy_conditions', type: 'string', required: true, description: '买入条件 JSON 字符串，必须是对象或数组。' },
      { name: 'sell_conditions', type: 'string', required: true, description: '卖出条件 JSON 字符串，必须是对象或数组。' },
      { name: 'buy_frequency_type', type: 'string', required: true, description: '买入频率，具体值由上游判定，例如 WEEKLY。' },
      { name: 'max_buy_times', type: 'number', required: true, description: '最大买入次数。' },
      { name: 'per_buy_amount', type: 'number', required: true, description: '每次买入金额。' },
    ],
    paging: 'none',
    window: 'none',
    dateEncoding: 'none',
    availability: 'open',
  },
  {
    tool: 'fund_indicators_line',
    universe: 'fund',
    path: '/api/fund/indicators/line',
    title: '基金画线指标',
    summary: '查询基金指标时间序列；时间轴使用 Unix 毫秒整数。',
    params: [
      { name: 'indexes', type: 'string', required: true, description: '指标分组 JSON 数组，每组含 thscodes 与 index_info。' },
      { name: 'time_range', type: 'string', required: true, description: '时间范围 JSON 对象，含 time_type、start、end（Unix 毫秒）。' },
    ],
    paging: 'none',
    window: 'none',
    dateEncoding: 'ms-epoch',
    availability: 'open',
  },
  {
    tool: 'fund_indicators_table',
    universe: 'fund',
    path: '/api/fund/indicators/table',
    title: '基金表格指标',
    summary: '查询基金表格式指标结果，支持分页与排序；省略参数时不注入业务默认值。',
    params: [
      { name: 'code_selectors', type: 'string', required: false, description: '代码选择器 JSON 对象。' },
      { name: 'indexes', type: 'string', required: false, description: '指标 JSON 数组，index_id 必填。' },
      { name: 'page_info', type: 'string', required: false, description: '分页 JSON 对象，起点为 0。' },
      { name: 'sort', type: 'string', required: false, description: '排序 JSON 数组，每项含 idx 与 type。' },
    ],
    paging: 'page',
    window: 'none',
    dateEncoding: 'none',
    availability: 'open',
  },
  {
    tool: 'fund_quota_list',
    universe: 'fund',
    path: '/api/fund/quota/list',
    title: 'QDII额度列表',
    summary: '按分类查询 QDII 额度下的基金列表；额度与收益数值以字符串原样返回。',
    params: [
      { name: 'tab', type: 'string', required: true, description: '分类数组 JSON 字符串，例如 ["remen"]。' },
      { name: 'buy', type: 'boolean', required: false, description: '可购状态过滤；省略时不向上游注入默认值。' },
    ],
    paging: 'none',
    window: 'none',
    dateEncoding: 'none',
    availability: 'open',
  },
  {
    tool: 'fund_quota_summary',
    universe: 'fund',
    path: '/api/fund/quota/summary',
    title: 'QDII额度汇总',
    summary: '按分类查询 QDII 额度汇总；数值以字符串原样返回，不作单位换算。',
    params: [{ name: 'tab', type: 'string', required: true, description: '分类数组 JSON 字符串，例如 ["nazhi100"]。' }],
    paging: 'none',
    window: 'none',
    dateEncoding: 'none',
    availability: 'open',
  },
]

/** Map one MCP JSON Schema property onto the seam's parameter vocabulary. */
function toParam(name: string, property: McpProperty, required: boolean): StockParam {
  const declared = property.type ?? property.anyOf?.find(entry => entry.type !== 'null')?.type ?? 'string'
  const param: StockParam = {
    name,
    type: declared as StockParamType,
    required,
    description: property.description ?? '',
  }
  const enumValues = property.enum?.filter((value): value is string => typeof value === 'string')
  return {
    ...param,
    ...property.default === undefined ? {} : { default: property.default },
    ...enumValues === undefined || enumValues.length === 0 ? {} : { enum: enumValues },
  }
}

/** Derive the stable capability id from the request path. */
function endpointId(path: string): string {
  return path.replace(/^\/api\//, '').replace(/\/download-url$/, '').split('/').join('.')
}

/** Derive the model-facing tool name, preferring the curated override table. */
function toolName(mcpTool: string): string {
  return TOOL_OVERRIDES[mcpTool] ?? mcpTool.replace(/^get_/, '')
}

/** First clause of a vendor description, used as the catalog title. */
function shortTitle(description: string): string {
  return (description.split(/[。；;]/)[0] ?? description).trim().slice(0, 60)
}

/**
 * Date encoding is a property of the *parameter names* the vendor chose, so it
 * is derived rather than transcribed: the vendor uses four incompatible
 * conventions across an otherwise uniform API. `compact-date` is not derivable
 * here because no endpoint takes a `yyyyMMdd` parameter — the trading calendar
 * returns that format but accepts none, so it records `none` like every other
 * parameterless endpoint.
 */
function dateEncodingOf(params: readonly StockParam[]): StockDateEncoding | 'none' {
  const names = new Set(params.map(param => param.name))
  if (names.has('report')) return 'report-period'
  if (names.has('date') || names.has('start_date') || names.has('end_date')) return 'iso-date'
  if (names.has('start') || names.has('end') || names.has('date_ms')) return 'ms-epoch'
  return 'none'
}

/**
 * Read one checked-in contract snapshot. The caller asserts its own shape: each
 * snapshot has a different one, and the vendor's published contract is the only
 * authority for what it contains.
 */
function readSnapshot(file: string): unknown {
  return JSON.parse(readFileSync(join(CONTRACTS, file), 'utf8')) as unknown
}

/** Build the complete endpoint registry from the checked-in snapshots. */
function build(): StockEndpoint[] {
  const mcp = readSnapshot('mcp-tools.snapshot.json') as { services: Record<string, { endpoint: string; tools: McpTool[] }> }
  const mapping = readSnapshot('mcp-tool-to-rest.snapshot.json') as { tools: Record<string, { method: string; path: string }> }
  const cli = readSnapshot('cli-capabilities.snapshot.json') as { capabilities: CliCapability[] }
  const cliByPath = new Map(
    cli.capabilities.filter(entry => entry.source === 'remote' && entry.endpoint !== undefined).map(entry => [entry.endpoint as string, entry]),
  )

  const endpoints: StockEndpoint[] = []
  for (const [universe, service] of Object.entries(mcp.services)) {
    for (const tool of service.tools) {
      const target = mapping.tools[tool.name]
      if (target === undefined) throw new Error(`gen-stock-catalog: no REST path for MCP tool ${tool.name}`)
      const capability = cliByPath.get(target.path)
      if (capability === undefined) throw new Error(`gen-stock-catalog: no CLI capability for ${target.path}`)
      const required = new Set(tool.inputSchema?.required ?? [])
      const params = Object.entries(tool.inputSchema?.properties ?? {}).map(([name, property]) =>
        toParam(name, property, required.has(name)),
      )
      const description = tool.description ?? ''
      endpoints.push({
        id: endpointId(target.path),
        universe: universe as StockUniverse,
        tool: toolName(tool.name),
        method: 'GET',
        path: target.path,
        title: shortTitle(description),
        summary: description,
        params,
        availability: 'open',
        paging: (capability.paging ?? 'none') as StockPaging,
        window: (capability.window ?? 'none') as StockWindow,
        dateEncoding: dateEncodingOf(params),
        mcpTool: tool.name,
        source: 'mcp',
      })
    }
  }

  for (const manual of MANUAL_TOOLS) {
    endpoints.push({
      id: endpointId(manual.path),
      universe: manual.universe,
      tool: manual.tool,
      method: 'GET',
      path: manual.path,
      title: manual.title,
      summary: manual.summary,
      params: manual.params,
      availability: manual.availability,
      paging: manual.paging,
      window: manual.window,
      dateEncoding: manual.dateEncoding,
      source: 'manual',
    })
  }

  endpoints.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  const seen = new Set<string>()
  for (const endpoint of endpoints) {
    if (seen.has(endpoint.tool)) throw new Error(`gen-stock-catalog: duplicate tool name ${endpoint.tool}`)
    seen.add(endpoint.tool)
  }
  return endpoints
}

/**
 * Render one JSON value as repository-style TypeScript: single-quoted strings,
 * unquoted identifier keys, two-space indent, and a trailing comma in every
 * multi-line container.
 *
 * `JSON.stringify` output is deliberately not used here: the repository lints
 * generated TypeScript like any other source, and double-quoted keys without
 * trailing commas fail its stylistic rules.
 */
function renderValue(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth)
  const inner = '  '.repeat(depth + 1)
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(item => `${inner}${renderValue(item, depth + 1)},`)
    return `[\n${items.join('\n')}\n${pad}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  const fields = entries.map(([key, item]) => {
    const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : renderValue(key, depth + 1)
    return `${inner}${name}: ${renderValue(item, depth + 1)},`
  })
  return `{\n${fields.join('\n')}\n${pad}}`
}

/** Render the registry as the committed TypeScript module. */
function render(endpoints: readonly StockEndpoint[]): string {
  const registry = renderValue(endpoints, 0)
  return `/**
 * Generated by \`pnpm run gen-stock-catalog\`. Do not edit by hand.
 *
 * Source contracts: \`packages/stock/stock-hithink/contracts/\`. The vendor
 * publishes no OpenAPI document, so this registry is the join of its MCP
 * \`tools/list\` schemas, the CLI capability map, and the documented
 * tool-to-path table.
 * @module @deepseek-ai/dsh-stock-hithink/catalog/generated
 */

import type { StockEndpoint } from '@deepseek-ai/dsh-stock'

/** Every capability the vendor currently exposes to API-key clients. */
export const STOCK_ENDPOINTS: readonly StockEndpoint[] = ${registry}

/** Registry indexed by capability id. */
export const STOCK_ENDPOINTS_BY_ID: ReadonlyMap<string, StockEndpoint> = new Map(
  STOCK_ENDPOINTS.map(endpoint => [endpoint.id, endpoint]),
)

/** Registry indexed by model-facing tool name. */
export const STOCK_ENDPOINTS_BY_TOOL: ReadonlyMap<string, StockEndpoint> = new Map(
  STOCK_ENDPOINTS.map(endpoint => [endpoint.tool, endpoint]),
)
`
}

const check = process.argv.includes('--check')
const built = render(build())
if (check) {
  const committed = readFileSync(OUTPUT, 'utf8')
  if (committed !== built) {
    console.error('gen-stock-catalog: committed registry differs from the vendor contracts; run `pnpm run gen-stock-catalog`')
    process.exit(1)
  }
  console.log(`gen-stock-catalog: ${build().length} endpoints up to date`)
} else {
  writeFileSync(OUTPUT, built)
  const endpoints = build()
  const manual = endpoints.filter(endpoint => endpoint.source === 'manual').length
  console.log(`gen-stock-catalog: wrote ${endpoints.length} endpoints (${manual} manual) to ${OUTPUT}`)
}
