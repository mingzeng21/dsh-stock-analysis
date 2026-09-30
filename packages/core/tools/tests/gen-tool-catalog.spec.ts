/**
 * Guarantee tests for the tool-schema catalog generator (`scripts/gen-tool-catalog.ts`).
 */

import { describe, expect, it } from 'vitest'
import {
  assertManifestComplete,
  assertToolsHarvested,
  collectToolCatalog,
  render,
  type ToolCatalog,
  type ToolPackage,
} from '../../../../scripts/gen-tool-catalog.ts'

/** JSON Schema shape enough to reach the values AST extraction can't. */
interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  enum?: string[]
  required?: string[]
}

describe('gen-tool-catalog collectToolCatalog', () => {
  it('boots every shipped tool package and harvests its model-facing schemas', async () => {
    const catalog = await collectToolCatalog()
    const names = catalog.flatMap(entry => entry.schemas.map(s => s.name)).sort()
    expect(names).toEqual([
      'ask_user_question', 'bash', 'bash', 'cordis_inspect_list', 'cordis_inspect_query',
      'create_goal', 'edit', 'exit_plan_mode', 'fund_backtest_indicators', 'fund_backtest_result',
      'fund_companies_detail', 'fund_corporate_actions_dividends', 'fund_diagnostics_detail',
      'fund_financials_balance_sheets', 'fund_financials_income_statements',
      'fund_financials_indicators', 'fund_holders_detail', 'fund_holders_top',
      'fund_indicators_line', 'fund_indicators_table', 'fund_managers_detail',
      'fund_managers_experience', 'fund_managers_investment_style', 'fund_managers_performance',
      'fund_market_historical', 'fund_market_snapshot', 'fund_news_article_list',
      'fund_offerings_list', 'fund_performance_drawdowns',
      'fund_performance_indicators_historical', 'fund_performance_nav', 'fund_performance_returns',
      'fund_portfolio_asset_allocation', 'fund_portfolio_bond_history',
      'fund_portfolio_bond_report_dates', 'fund_portfolio_holdings',
      'fund_portfolio_industry_allocation', 'fund_portfolio_stock_history',
      'fund_portfolio_stock_report_dates', 'fund_profile_detail', 'fund_quota_list',
      'fund_quota_summary', 'futures_basis_historical', 'futures_basis_main_continuous_latest',
      'futures_calendar_trading_schedule', 'futures_contracts_detail',
      'futures_positions_company_list', 'futures_positions_company_variety_daily',
      'futures_positions_contract_daily', 'futures_positions_contract_historical',
      'futures_positions_variety_daily', 'futures_prices_daily', 'futures_prices_intraday',
      'futures_varieties_list', 'futures_warehouse_receipts_historical', 'get_goal', 'glob',
      'grep', 'interrupt_agent', 'interrupt_agent', 'iwencai_announcement_search',
      'iwencai_astock_selector', 'iwencai_basicinfo_query', 'iwencai_business_query',
      'iwencai_event_query', 'iwencai_fund_selector', 'iwencai_hkstock_selector',
      'iwencai_industry_query', 'iwencai_insresearch_query', 'iwencai_macro_query',
      'iwencai_management_query', 'iwencai_news_search', 'iwencai_report_search',
      'iwencai_sector_selector', 'iwencai_usstock_selector', 'job_kill', 'job_list', 'job_output',
      'list_agents', 'list_agents', 'list_mcp_resource_templates', 'list_mcp_resources',
      'list_subagent_models', 'load_workspace_dependencies', 'lsp', 'options_contracts_detail',
      'options_prices_daily', 'options_prices_intraday', 'options_varieties_list',
      'plugin_manager', 'present', 'pwsh', 'pwsh', 'ralph', 'read', 'read_image',
      'read_mcp_resource', 'run_code', 'schedule_create', 'schedule_delete', 'schedule_list',
      'schedule_update', 'send_message', 'send_message', 'session_event_read',
      'session_event_search', 'session_event_trace', 'session_search', 'session_trace', 'skill',
      'spawn_teammate', 'stagehand_act', 'stagehand_extract', 'stagehand_navigate',
      'stagehand_observe', 'stagehand_screenshot', 'stagehand_tabs', 'stock_adjustment_factors',
      'stock_anomaly_analysis', 'stock_anomaly_analysis_list', 'stock_auction_benchmark',
      'stock_auction_snapshot', 'stock_dragon_tiger_list', 'stock_financials_balance',
      'stock_financials_cashflow', 'stock_financials_income', 'stock_financials_indicators',
      'stock_hot_list', 'stock_hot_list_history', 'stock_hot_rank_trend', 'stock_index_catalog',
      'stock_index_constituents', 'stock_index_kline', 'stock_index_quote', 'stock_kline',
      'stock_limit_break_pool', 'stock_limit_down_pool', 'stock_limit_up_ladder',
      'stock_limit_up_pool', 'stock_quote', 'stock_skyrocket_list', 'stock_symbol_list',
      'stock_symbol_search', 'stock_trading_calendar', 'stock_valuation', 'str_replace_editor',
      'subagent', 'team_task_create', 'team_task_get', 'team_task_list', 'team_task_update',
      'terminal_close', 'terminal_list', 'terminal_open', 'terminal_read', 'terminal_send',
      'terminal_signal', 'todo_write', 'update_goal', 'wait_agent', 'web_fetch', 'web_search',
      'workflow', 'write',
    ])
    // Every tool carries a JSON-Schema `parameters` object (what the model sees).
    for (const entry of catalog) {
      for (const schema of entry.schemas) {
        expect((schema.parameters as unknown as JsonSchema).type).toBe('object')
      }
    }
  })

  it('resolves a runtime-spread enum to its literal members (the payoff over AST)', async () => {
    const catalog = await collectToolCatalog()
    const todo = catalog
      .flatMap(entry => entry.schemas)
      .find(s => s.name === 'todo_write')
    // `todo-todo` writes `enum: [...STATUSES]` — a source AST would see the
    // spread, not the values. Booting yields the shipped enum literals.
    const status = (((todo?.parameters as unknown as JsonSchema).properties?.todos)?.items)?.properties?.status
    expect(status?.enum).toEqual(['pending', 'in_progress', 'completed'])
  })

  it('attributes each harvested tool with its registering plugin source', async () => {
    const catalog = await collectToolCatalog()
    const bash = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-bash')
    expect(bash?.sources.bash).toBe('packages/shell/tool-bash/src/index.ts')
    const control = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-subagent-control')
    expect(control?.sources).toEqual({
      interrupt_agent: 'packages/subagent/tool-subagent-control/src/index.ts',
      list_agents: 'packages/subagent/tool-subagent-control/src/list-agents.ts',
      send_message: 'packages/subagent/tool-subagent-control/src/index.ts',
    })
  })

  it('harvests search tools without depending on the generator process PATH', async () => {
    const oldPath = process.env.PATH
    try {
      process.env.PATH = ''
      const catalog = await collectToolCatalog()
      const search = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-fs-search')
      expect(search?.schemas.map(s => s.name).sort()).toEqual(['glob', 'grep'])
    } finally {
      if (oldPath === undefined) delete process.env.PATH
      else process.env.PATH = oldPath
    }
  })

  it('records the shipped `subagent_fork` alias in a note (config-driven tool name)', async () => {
    // `tool-subagent`'s registered name is the load-time `toolName` config, so the shipped
    // agents surface this one package as both `subagent` and `subagent_fork`.
    const catalog = await collectToolCatalog()
    const subagent = catalog.find(entry => entry.pkg === '@deepseek-ai/dsh-tool-subagent')
    expect(subagent?.schemas.map(s => s.name)).toEqual(['list_subagent_models', 'subagent'])
    expect(subagent?.note).toMatch(/subagent_fork/)
  })
})

describe('gen-tool-catalog assertManifestComplete', () => {
  it('passes when the manifest lists every on-disk tool package (the default)', () => {
    expect(() => { assertManifestComplete() }).not.toThrow()
  })

  it('throws, naming the omitted package, when a tool package is missing from the manifest', () => {
    // An empty manifest scanned against the real tree: every `tool-*` package
    // is unlisted, so the guard must fire and name them.
    expect(() => { assertManifestComplete([]) }).toThrow(/not in the boot manifest/)
    expect(() => { assertManifestComplete([]) }).toThrow(/tool-bash/)
  })
})

describe('gen-tool-catalog assertToolsHarvested', () => {
  const entry: ToolPackage = {
    pkg: '@deepseek-ai/dsh-tool-demo',
    dir: 'tool-demo',
    source: 'packages/demo/tool-demo/src/index.ts',
    requires: ['ctx.tools', 'ctx.somethingUnmounted'],
    writes: ['tool/result'],
    mount: () => Promise.resolve(),
  }

  it('accepts a boot that registered at least one tool', () => {
    expect(() => { assertToolsHarvested(entry, 1) }).not.toThrow()
  })

  it('throws, naming the package and its requirements, when a boot registers nothing', () => {
    // The failure this guards is silent by construction: the package is in the
    // manifest, its plugin merely stays PENDING on an unmounted service, and the
    // catalog would ship without its tools while every gate stays green.
    expect(() => { assertToolsHarvested(entry, 0) }).toThrow(/@deepseek-ai\/dsh-tool-demo booted without registering a single tool/)
    expect(() => { assertToolsHarvested(entry, 0) }).toThrow(/ctx.somethingUnmounted/)
  })
})

describe('gen-tool-catalog render', () => {
  it('emits a package heading, a tool heading, and a json schema fence', () => {
    const catalog: ToolCatalog = [
      {
        pkg: '@deepseek-ai/dsh-tool-demo',
        sources: { demo: 'packages/demo/tool-demo/src/index.ts' },
        requires: ['ctx.tools'],
        writes: ['tool/result'],
        schemas: [{ name: 'demo', description: 'A demo tool.', parameters: { type: 'object', properties: {} } }],
      },
    ]
    const md = render(catalog)
    expect(md).toContain('| `@deepseek-ai/dsh-tool-demo` | `demo` | `ctx.tools` | `tool/result` |')
    expect(md).toContain('## `@deepseek-ai/dsh-tool-demo`')
    expect(md).toContain('### `demo`')
    expect(md).toContain('A demo tool.')
    expect(md).toContain('```json')
    expect(md).toContain('Source: [`packages/demo/tool-demo/src/index.ts`]')
  })
})
