/**
 * Generate the 问财 (iwencai) capability registry from the selected skills.
 *
 * The 问财 gateway publishes no OpenAPI document: a capability is addressed by a
 * skill identity plus one of two gateway endpoints. The selected skill records
 * are checked in under the provider's `contracts/`, and this generator joins
 * them with the curated, model-facing naming so the registry and the identity
 * table stay one reviewed artifact.
 *
 * `--check` re-derives the module offline and compares it with the committed
 * file.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { StockEndpoint, StockParam } from '@deepseek-ai/dsh-stock'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACTS = join(ROOT, 'packages/stock/stock-iwencai/contracts')
const OUTPUT = join(ROOT, 'packages/stock/stock-iwencai/src/catalog/generated.ts')

/** Path of the search endpoint: one channel per capability. */
const SEARCH_PATH = '/v1/comprehensive/search'

/** Path of the natural-language data endpoint. */
const QUERY_PATH = '/v1/query2data'

/**
 * The skill version sent for every capability.
 *
 * Deliberately the value the vendor's own skill scripts send rather than the
 * store record's `version`: for the three search skills the store says `1.0.1`
 * while the bundled script sends `1.0.0`, and the gateway accepted both when
 * measured. Pinning what the vendor's client sends keeps this valid for as long
 * as the skill itself is.
 */
const SKILL_VERSION = '1.0.0'

/** Parameters every search capability accepts. */
const SEARCH_PARAMS: readonly StockParam[] = [
  { name: 'query', type: 'string', required: true, description: '自然语言检索问句，例如「贵州茅台 分红公告」。' },
  { name: 'size', type: 'integer', required: false, description: '期望返回的条数。', default: 10 },
]

/** Parameters every natural-language data capability accepts. */
const QUERY_PARAMS: readonly StockParam[] = [
  { name: 'query', type: 'string', required: true, description: '自然语言问句，例如「今日涨幅居前的A股」。' },
  { name: 'page', type: 'integer', required: false, description: '页码，从 1 开始。', default: 1 },
  { name: 'limit', type: 'integer', required: false, description: '单页条数。', default: 10 },
]

/** One curated capability: the model-facing naming plus its vendor identity. */
interface Selection {
  /** Vendor skill name; also the identity sent in `X-Claw-Skill-Id`. */
  readonly skill: string
  /** Model-facing tool name. */
  readonly tool: string
  /** Stable capability id. */
  readonly id: string
  /** Short Chinese title used in the catalog and the tool description. */
  readonly title: string
  /**
   * One-sentence purpose. For the nine natural-language capabilities this text
   * carries the whole disambiguation load, because they share one parameter
   * schema, so each states what it covers and, where a sibling is close, what it
   * does not.
   */
  readonly summary: string
  /** `search` capabilities carry a channel; `query2data` capabilities do not. */
  readonly channel?: string
}

/** The capabilities this deployment registers. */
const SELECTION: readonly Selection[] = [
  {
    skill: 'announcement-search',
    tool: 'iwencai_announcement_search',
    id: 'iwencai.search.announcement',
    title: '公告搜索',
    summary: '按语义检索 A股、港股、基金、ETF 的公司公告原文，覆盖定期报告、分红派息、回购增持、资产重组等类型，返回标题、摘要与公告 PDF 链接。查研报用 iwencai_report_search，查新闻用 iwencai_news_search。',
    channel: 'announcement',
  },
  {
    skill: 'report-search',
    tool: 'iwencai_report_search',
    id: 'iwencai.search.report',
    title: '研报搜索',
    summary: '按语义检索主流投研机构发布的研究报告，返回标题、摘要与原文链接，用于获取分析逻辑、投资评级与目标价。查公告用 iwencai_announcement_search。',
    channel: 'report',
  },
  {
    skill: 'news-search',
    tool: 'iwencai_news_search',
    id: 'iwencai.search.news',
    title: '新闻搜索',
    summary: '按语义检索财经资讯，来源含官媒、主流财经媒体、垂直行业网站与公司官网，用于了解最新财经事件、政策动态与行业进展。查公告用 iwencai_announcement_search。',
    channel: 'news',
  },
  {
    skill: 'hithink-astock-selector',
    tool: 'iwencai_astock_selector',
    id: 'iwencai.research.astock-selector',
    title: '问财选A股',
    summary: '用自然语言按条件筛选 A股列表（涨幅、涨停、成交量、财务条件、行业概念等组合），返回符合条件的股票及其命中指标。用于「选出哪些股票」，不是查询某只已知股票的既有数据。',
  },
  {
    skill: 'hithink-fund-selector',
    tool: 'iwencai_fund_selector',
    id: 'iwencai.research.fund-selector',
    title: '问财选基金',
    summary: '用自然语言按条件筛选公募基金（收益率、规模、类型、持仓特征等），返回符合条件的基金及其命中指标。筛选场内 ETF 也可用本能力。',
  },
  {
    skill: 'hithink-hkstock-selector',
    tool: 'iwencai_hkstock_selector',
    id: 'iwencai.research.hkstock-selector',
    title: '问财选港股',
    summary: '用自然语言按条件筛选港股标的，返回符合条件的港股及其命中指标。筛选 A股用 iwencai_astock_selector，筛选美股用 iwencai_usstock_selector。',
  },
  {
    skill: 'hithink-usstock-selector',
    tool: 'iwencai_usstock_selector',
    id: 'iwencai.research.usstock-selector',
    title: '问财选美股',
    summary: '用自然语言按条件筛选美股标的（行情、财务、行业概念、业绩预测、研报评级等组合），返回符合条件的美股及其命中指标。',
  },
  {
    skill: 'hithink-sector-selector',
    tool: 'iwencai_sector_selector',
    id: 'iwencai.research.sector-selector',
    title: '问财选板块',
    summary: '用自然语言按条件筛选市场板块（行业估值、资金流向、涨跌幅、板块类型等组合），返回符合条件的板块及其命中指标。注意它返回的是板块本身，不是板块成分股。',
  },
  {
    skill: 'hithink-event-query',
    tool: 'iwencai_event_query',
    id: 'iwencai.research.event-query',
    title: '事件数据查询',
    summary: '用自然语言查询上市公司事件数据：业绩预告、增发配股、限售解禁、股权质押、机构调研、监管函等。查公司经营面（主营业务、客户、供应商、重大合同）用 iwencai_business_query。',
  },
  {
    skill: 'hithink-business-query',
    tool: 'iwencai_business_query',
    id: 'iwencai.research.business-query',
    title: '公司经营数据查询',
    summary: '用自然语言查询公司经营面数据：主营业务构成、主要客户、主要供应商、参控股公司、重大合同。查股权股本用 iwencai_management_query，查基础资料用 iwencai_basicinfo_query。',
  },
  {
    skill: 'hithink-management-query',
    tool: 'iwencai_management_query',
    id: 'iwencai.research.management-query',
    title: '公司股东股本查询',
    summary: '用自然语言查询股权与股本信息：股本结构、股东户数、前十大股东/流通股东、主要持有人、实际控制人、股权质押。查经营面用 iwencai_business_query。',
  },
  {
    skill: 'hithink-macro-query',
    tool: 'iwencai_macro_query',
    id: 'iwencai.research.macro-query',
    title: '宏观数据查询',
    summary: '用自然语言查询宏观经济指标：GDP、CPI、PPI、利率、汇率、社融、M2、PMI、工业增加值、消费、投资、进出口。查行业面用 iwencai_industry_query。',
  },
  {
    skill: 'hithink-industry-query',
    tool: 'iwencai_industry_query',
    id: 'iwencai.research.industry-query',
    title: '行业数据查询',
    summary: '用自然语言查询行业与产业链数据：行业景气、产销、价格、上下游与竞争格局。筛选板块本身用 iwencai_sector_selector；查宏观经济用 iwencai_macro_query。',
  },
  {
    skill: 'hithink-insresearch-query',
    tool: 'iwencai_insresearch_query',
    id: 'iwencai.research.insresearch-query',
    title: '机构研究与评级查询',
    summary: '用自然语言查询机构研究与评级数据：券商评级、目标价、盈利预测、ESG、券商金股、一致预期。查研报原文用 iwencai_report_search。',
  },
  {
    skill: 'hithink-basicinfo-query',
    tool: 'iwencai_basicinfo_query',
    id: 'iwencai.research.basicinfo-query',
    title: '基本资料查询',
    summary: '用自然语言查询证券的基本资料：公司简介、上市日期、所属行业与板块、费率等静态档案信息。查经营数据用 iwencai_business_query，查股东股本用 iwencai_management_query。',
  },
]

/** One selected skill as the checked-in snapshot records it. */
interface SkillRecord {
  readonly name: string
  readonly cnName?: string
  readonly description?: string
  readonly version?: string
}

/**
 * Render one JSON value as repository-style TypeScript: single-quoted strings,
 * unquoted identifier keys, two-space indent, and a trailing comma in every
 * multi-line container. `JSON.stringify` output fails the repository's
 * stylistic lint rules, and generated sources are linted like any other.
 */
function renderValue(value: unknown, depth: number): string {
  const pad = '  '.repeat(depth)
  const inner = '  '.repeat(depth + 1)
  if (typeof value === 'string') return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[\n${value.map(item => `${inner}${renderValue(item, depth + 1)},`).join('\n')}\n${pad}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '{}'
  const fields = entries.map(([key, item]) => {
    const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : renderValue(key, depth + 1)
    return `${inner}${name}: ${renderValue(item, depth + 1)},`
  })
  return `{\n${fields.join('\n')}\n${pad}}`
}

/** Read the checked-in skill snapshot. */
function skills(): readonly SkillRecord[] {
  const snapshot = JSON.parse(
    readFileSync(join(CONTRACTS, 'iwencai-skills.snapshot.json'), 'utf8'),
  ) as { skills: SkillRecord[] }
  return snapshot.skills
}

/** Build the endpoint registry and the vendor identity table. */
function build(): { endpoints: StockEndpoint[]; capabilities: Record<string, unknown>[] } {
  const known = new Map(skills().map(skill => [skill.name, skill]))
  const endpoints: StockEndpoint[] = []
  const capabilities: Record<string, unknown>[] = []

  for (const selection of SELECTION) {
    const record = known.get(selection.skill)
    if (record === undefined) {
      throw new Error(`gen-iwencai-catalog: "${selection.skill}" is selected but absent from the snapshot`)
    }
    const search = selection.channel !== undefined
    endpoints.push({
      id: selection.id,
      universe: 'iwencai',
      tool: selection.tool,
      method: 'POST',
      path: search ? SEARCH_PATH : QUERY_PATH,
      title: selection.title,
      summary: selection.summary,
      params: search ? SEARCH_PARAMS : QUERY_PARAMS,
      availability: 'open',
      paging: search ? 'none' : 'page',
      window: 'none',
      dateEncoding: 'none',
      source: 'manual',
    })
    capabilities.push({
      endpointId: selection.id,
      family: search ? 'search' : 'query2data',
      ...search ? { channel: selection.channel } : {},
      skillId: selection.skill,
      skillVersion: SKILL_VERSION,
    })
  }

  const ids = new Set<string>()
  for (const endpoint of endpoints) {
    if (ids.has(endpoint.id)) throw new Error(`gen-iwencai-catalog: duplicate capability id ${endpoint.id}`)
    ids.add(endpoint.id)
  }
  return { endpoints, capabilities }
}

/** Render the registry as the committed TypeScript module. */
function render(): string {
  const { endpoints, capabilities } = build()
  return `/**
 * Generated by \`pnpm run gen-iwencai-catalog\`. Do not edit by hand.
 *
 * The 问财 gateway publishes no OpenAPI document: a capability is a skill
 * identity plus one of two endpoints. The selected skills live in
 * \`packages/stock/stock-iwencai/contracts/iwencai-skills.snapshot.json\`, and
 * the model-facing naming is curated in the generator.
 * @module @deepseek-ai/dsh-stock-iwencai/catalog/generated
 */

import type { StockEndpoint } from '@deepseek-ai/dsh-stock'

/** Gateway endpoint a capability calls, which decides its request body. */
export type IwencaiFamily = 'search' | 'query2data'

/** The vendor identity one capability presents to the gateway. */
export interface IwencaiCapability {
  /** Capability id, matching the registry record. */
  readonly endpointId: string
  /** Which gateway endpoint and request body this capability uses. */
  readonly family: IwencaiFamily
  /** Search channel, present exactly for the \`search\` family. */
  readonly channel?: string
  /** Value sent as \`X-Claw-Skill-Id\`. */
  readonly skillId: string
  /** Value sent as \`X-Claw-Skill-Version\`. */
  readonly skillVersion: string
}

/** Every capability this provider serves. */
export const IWENCAI_ENDPOINTS: readonly StockEndpoint[] = ${renderValue(endpoints, 0)}

/** Registry indexed by capability id. */
export const IWENCAI_ENDPOINTS_BY_ID: ReadonlyMap<string, StockEndpoint> = new Map(
  IWENCAI_ENDPOINTS.map(endpoint => [endpoint.id, endpoint]),
)

/** Vendor identity and request family per capability. */
export const IWENCAI_CAPABILITIES: ReadonlyMap<string, IwencaiCapability> = new Map(
  (${renderValue(capabilities, 1)} as readonly IwencaiCapability[]).map(capability => [capability.endpointId, capability]),
)
`
}

const check = process.argv.includes('--check')
const built = render()
if (check) {
  const committed = readFileSync(OUTPUT, 'utf8')
  if (committed !== built) {
    console.error('gen-iwencai-catalog: committed registry differs; run `pnpm run gen-iwencai-catalog`')
    process.exit(1)
  }
  console.log(`gen-iwencai-catalog: ${build().endpoints.length} capabilities up to date`)
} else {
  writeFileSync(OUTPUT, built)
  console.log(`gen-iwencai-catalog: wrote ${build().endpoints.length} capabilities to ${OUTPUT}`)
}
