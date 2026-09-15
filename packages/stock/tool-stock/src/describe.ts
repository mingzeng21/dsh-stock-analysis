/**
 * Model-facing tool descriptions, composed from the generated registry.
 *
 * The registry's `title` and `summary` come from the vendor's own contract and
 * are reused verbatim, with the vendor's MCP tool names rewritten to the names
 * this package registers, because a model that only sees this catalog cannot
 * act on `get_a_share_*`. Three curated additions follow the vendor prose: the
 * instrument-code hint for capabilities taking `thscode`/`thscodes`; the `口径`
 * clause naming the sibling that answers the neighbouring question, because a
 * correct call to the wrong pool is the most likely failure among near-synonym
 * capabilities; and the pool membership note for a capability whose vendor
 * prose names the accepted suffixes but not the instruments its pool omits.
 * @module @deepseek-ai/dsh-tool-stock/describe
 */

import type { StockEndpoint } from '@deepseek-ai/dsh-stock'

/** Appended to every capability that takes a single `thscode`. */
export const SYMBOL_HINT_SINGLE =
  'thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。'

/** Appended to every capability that takes a comma-separated `thscodes` list. */
export const SYMBOL_HINT_MULTI =
  'thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。'

/**
 * Capability families whose members are easy to confuse. Every clause starts
 * with `口径：` and names at least one sibling, so the model can tell the
 * members apart from the description alone.
 */
export const FAMILY_DISAMBIGUATION: Readonly<Record<string, string>> = {
  stock_limit_up_pool:
    '口径：当日收盘涨停（封板成功）的股票池。盘中曾涨停而收盘未封住者不在此列，见 stock_limit_break_pool；'
    + '跌停方向见 stock_limit_down_pool；按连板高度分组的矩阵见 stock_limit_up_ladder。',
  stock_limit_down_pool:
    '口径：当日收盘跌停（封板成功）的股票池，与 stock_limit_up_pool 的涨停方向相反，不与炸板池 stock_limit_break_pool 混用。',
  stock_limit_break_pool:
    '口径：当日盘中曾涨停、收盘未封住（炸板）的股票池，与收盘涨停池 stock_limit_up_pool 互斥。',
  stock_limit_up_ladder:
    '口径：近 30 个交易日的连板梯队矩阵（按连板高度分组），不是单日股票池；'
    + '单日涨停池见 stock_limit_up_pool，单日炸板池见 stock_limit_break_pool。',
  stock_anomaly_analysis:
    '口径：按 thscodes 批量查这些标的当日各自的异动原因。要按异动标签列出全市场触发个股，'
    + '用 stock_anomaly_analysis_list。',
  stock_anomaly_analysis_list:
    '口径：按异动标签（tag_codes）列出触发该标签的全市场个股，不针对具体标的；'
    + '查某几只股票各自的异动原因用 stock_anomaly_analysis。',
  stock_hot_list:
    '口径：当前时点的热股榜。历史某一天的热股榜见 stock_hot_list_history；单只股票在区间内的排名走势见 stock_hot_rank_trend。',
  stock_hot_list_history:
    '口径：按自然日返回那一天的热股榜。当前时点的榜单见 stock_hot_list；单只股票在区间内的排名走势见 stock_hot_rank_trend。',
  stock_hot_rank_trend:
    '口径：单只股票在日期区间内的热榜排名走势，不是榜单本身；榜单见 stock_hot_list 与 stock_hot_list_history。',
}

/**
 * Capabilities whose instrument pool omits codes the vendor prose implies.
 * The vendor names the accepted suffixes but not the instruments absent from
 * the pool, and a call naming an absent one fails at the transport with
 * `Unknown thscode` instead of returning an empty result — so the model has to
 * be told before it calls. Each clause names the absent instruments, the
 * failure they produce, and any accepted code that answers the same question.
 */
export const POOL_SCOPE_NOTES: Readonly<Record<string, string>> = {
  stock_index_quote:
    '指数池不含北证50（899050.BJ）与中证2000（932000.CSI），传入会报 Unknown thscode；'
    + '中证系列已收录的写 .SH 形式（沪深300=000300.SH、中证500=000905.SH、中证1000=000852.SH）。',
}

/**
 * Map every vendor MCP tool name to the tool name this package registers.
 *
 * The result is ordered longest name first, because one vendor tool name can be
 * a prefix of another (`get_..._hot_stock_list` and its `_history` sibling) and a
 * left-to-right rewrite of the shorter one first would corrupt the longer one.
 * @param endpoints - generated registry records.
 * @returns vendor tool name to registered tool name, for the entry that has one.
 */
export function buildToolAliases(endpoints: readonly StockEndpoint[]): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>()
  for (const endpoint of endpoints) {
    if (endpoint.mcpTool !== undefined) aliases.set(endpoint.mcpTool, endpoint.tool)
  }
  return new Map([...aliases].sort((left, right) => right[0].length - left[0].length))
}

/** Rewrite vendor tool names in prose to the names this catalog actually registers. */
function localize(text: string, aliases: ReadonlyMap<string, string>): string {
  let localized = text
  for (const [vendorName, toolName] of aliases) localized = localized.split(vendorName).join(toolName)
  return localized
}

/** Compose the leading sentence without repeating a title the summary already opens with. */
function headline(endpoint: StockEndpoint, aliases: ReadonlyMap<string, string>): string {
  const title = localize(endpoint.title, aliases)
  const summary = localize(endpoint.summary, aliases)
  if (title === '' || summary.startsWith(title)) return summary
  return `${title}。${summary}`
}

/** State the exact instrument-code form this capability accepts. */
function symbolHint(endpoint: StockEndpoint): string {
  if (endpoint.params.some(param => param.name === 'thscode')) return ` ${SYMBOL_HINT_SINGLE}`
  if (endpoint.params.some(param => param.name === 'thscodes')) return ` ${SYMBOL_HINT_MULTI}`
  return ''
}

/**
 * Describe one capability for the model.
 * @param endpoint - registry record being registered.
 * @param aliases - vendor tool name to registered tool name, from {@link buildToolAliases}.
 * @returns the tool description sent in the system prompt.
 */
export function describeEndpoint(endpoint: StockEndpoint, aliases: ReadonlyMap<string, string>): string {
  const family = FAMILY_DISAMBIGUATION[endpoint.tool]
  const poolScope = POOL_SCOPE_NOTES[endpoint.tool]
  return headline(endpoint, aliases)
    + symbolHint(endpoint)
    + (family === undefined ? '' : ` ${family}`)
    + (poolScope === undefined ? '' : ` ${poolScope}`)
}
