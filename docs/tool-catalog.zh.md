<!-- 英文源文件由 scripts/gen-tool-catalog.ts 生成；本中文文件是通过双语配对维护的经评审对侧。
     更新时先运行 `pnpm run gen-tool-catalog` 更新英文，再更新本文件并运行 `pnpm run verify-translation-pairing --write docs/tool-catalog.md` 重新记录配对。 -->

# 工具 Schema 目录

[English](tool-catalog.md) | 中文

已发布插件向 `ctx.tools` 提供的所有面向模型的工具：模型通过系统提示词组装获得的 `name`、`description` 和 JSON Schema `parameters`。本目录是[子系统页面](subsystems/core.zh.md)（类型及每页生成的 `cordis-surface` 接线区域）的补充；本页列出的是向 agent（智能体）提供的*工具*。

英文源文件由系统**生成**，并通过 `pnpm run verify-tool-catalog`（`doc-sync`（文档同步门禁）的一部分）验证新鲜度；本中文文件作为经评审对侧通过双语配对维护。与 Cordis 目录（纯源码 AST 处理）不同，英文生成器会在真实上下文中**启动**每个工具插件并读取 `ctx.tools.schemas()`，因为工具 schema 无法通过静态分析完全确定，例如运行时展开的枚举、拼接的描述、由配置决定的名称以及使用原始 JSON Schema 的 MCP 工具。完整性守卫会 glob 匹配 `packages/*/tool-*`；如果生成器的启动 manifest（元数据清单）遗漏任何包，检查就会失败，因此新工具不会在无人察觉的情况下缺少文档。

范围：`packages/*/tool-*` 下已发布的产品工具，每个工具均使用其**默认**配置启动；但如果某个 Config 字段是**必填项**且没有默认值，生成器就必须作出选择，对应包的说明会记录本页展示的是哪个分支。注册的工具**名称**可以是加载时配置，例如 `tool-subagent` 的 `toolName`，因此部署可能以不同名称或额外名称提供某个包；如果存在随产品发布的别名，对应包的说明会予以记录。`examples/` 中的演示工具（例如 `echo`）不在范围内，这与 Cordis 目录仅涵盖包的范围一致。

<a id="tool-package-map"></a>

## 工具包映射

下表将模型可见的工具名称与其背后的插件包和服务 seam 对应起来。各包章节随后给出确切的 JSON Schema。

| 工具包 | 模型可见名称 | 依赖 | 写入／影响 | 随产品发布的别名 | 部署说明 |
| --- | --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-tool-ask-user` | `ask_user_question` | `ctx.tools`、`ctx.userQuestions` | `tool/call`、`tool/result after a UI/provider answers the question` | - | ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。 |
| `@deepseek-ai/dsh-tools` | `run_code` | `ctx.tools`、`ctx.codeRuntime (execution time)`、`ctx.systemPrompt` | `tool/call`、`one tool/ptc-dispatch-start + tool/ptc-dispatch pair per bridged sub-call`、`tool/result` | - | 在 `mode: ptc`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 PTC mode Agent Note）。在 `ptc` 下，它是注册表对协议格式（wire format）的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。 |
| `@deepseek-ai/dsh-plan-mode` | `exit_plan_mode` | `ctx.tools`、`ctx.systemPrompt`、`ctx.userQuestions (execution time, opportunistic)` | `tool/call`、`plan/mode inactive on an approved review`、`tool/result` | - | 规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。 |
| `@deepseek-ai/dsh-tool-bash` | `bash` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | bash 工具是 bash 执行器 seam 面向模型的消费方。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默认为 true）后，该参数会被完全移除。 |
| `@deepseek-ai/dsh-tool-present` | `present` | `ctx.tools`, `ctx.fs`, `ctx.sessionProjections` | `tool/call`, `deliverables/presented 在成功的最终结果之后`, `tool/result` | - | 交付归调用方 Session 所有；Web ui-deliverables 提供源文件打开与卡片。 |
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` | `ctx.tools`、`ctx.shell`、`ctx.systemPrompt`、`ctx.shellEnv`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `DSH_*` 环境来自 `@deepseek-ai/dsh-shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。 |
| `@deepseek-ai/dsh-tool-cordis` | `cordis_define`、`cordis_inspect_list`、`cordis_inspect_query`、`cordis_inspect_self`、`cordis_run`、`cordis_stop`、`cordis_undefine` | `ctx.tools`、`ctx.dynamicCordisRunner` | `tool/call`、`tool/result`、`process-local dynamic package lifecycle` | - | 不在任何随产品发布的树中，需要显式选择启用；动态 Package 代码可以访问真实运行时，见 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。该工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者拥有定义注册表和 vm 沙箱；组合缺少它时这些工具不会激活。运行中的 Package 在停止、undefine 或 DSH 重启前可以注册**额外的**模型可见工具；发生这类工具集变化时，系统会记录完整且有变动的请求头。 |
| `@deepseek-ai/dsh-tool-bash-persistent` | `bash` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。 |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | `pwsh` | `ctx.tools`、`ctx.terminals`、`an owning Agent at execution time` | `tool/call`、`PTY shell state`、`tool/result` | - | 一个按所有者隔离的持久 pwsh 工具，持久 bash 工具的 Windows 对应物；部署组合提供 pwsh 方言的 PTY 后端，并可覆盖面向模型的环境描述。 |
| `@deepseek-ai/dsh-tool-str-replace-editor` | `str_replace_editor` | `ctx.tools`、`ctx.fs` | `tool/call`、`fs/observed after view presence/absence, edit absence, or successful mutation`、`tool/result` | - | 基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。 |
| `@deepseek-ai/dsh-tool-fs` | `edit`、`read`、`read_image`、`write` | `ctx.tools`、`ctx.fs`、`ctx.systemPrompt`、`ctx.attachments (image-tool registration)`、`ctx.llm + an image-capable route (image-tool execution)` | `tool/call`、`fs/write-intent or fs/edit-intent for mutations`、`fs/observed after read presence/absence or successful file operation`、`durable attachment (read_image)`、`tool/result` | - | 先读后写／编辑策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时图片工具不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图片输入，否则拒绝。 |
| `@deepseek-ai/dsh-tool-fs-search` | `glob`、`grep` | `ctx.tools`、`ctx.subprocess`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。 |
| `@deepseek-ai/dsh-tool-terminal` | `terminal_close`、`terminal_list`、`terminal_open`、`terminal_read`、`terminal_send`、`terminal_signal` | `ctx.tools`、`ctx.terminals`、`ctx.systemPrompt`、`ctx.jobs at call time for run_in_background` | `tool/call`、`tool/result` | - | 这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。 |
| `@deepseek-ai/dsh-tool-goal` | `create_goal`、`get_goal`、`update_goal` | `ctx.tools`、`ctx.agents`、`ctx.goals`、`ctx.systemPrompt`、`a calling Agent in an authorized open turn` | `tool/call`、`goal/change for mutations`、`tool/result` | - | create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。 |
| `@deepseek-ai/dsh-schedule` | `schedule_create`、`schedule_delete`、`schedule_list` | `ctx.tools`、`ctx.sessions`、Session 持久化、未来创建的 live 根 Agent | `tool/call`、`schedule/change create or delete`、`tool/result` | - | 仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。 |
| `@deepseek-ai/dsh-tool-lsp` | `lsp` | `ctx.tools`、`ctx.lsp`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。 |
| `@deepseek-ai/dsh-tool-ralph` | `ralph` | `ctx.tools`、`ctx.workflowEngine`、`ctx.subagents`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents every fresh round)` | `tool/call`、`tool/result`、`workflow and child session events during execution` | - | 固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。 |
| `@deepseek-ai/dsh-tool-skill` | `skill` | `ctx.tools`、`ctx.agents`、`ctx.skills` | `tool/call`、`tool/result`、`user/message replacement catalogs via agent.inject()` | - | - |
| `@deepseek-ai/dsh-tool-stock` | `fund_backtest_indicators`, `fund_backtest_result`, `fund_companies_detail`, `fund_corporate_actions_dividends`, `fund_diagnostics_detail`, `fund_financials_balance_sheets`, `fund_financials_income_statements`, `fund_financials_indicators`, `fund_holders_detail`, `fund_holders_top`, `fund_indicators_line`, `fund_indicators_table`, `fund_managers_detail`, `fund_managers_experience`, `fund_managers_investment_style`, `fund_managers_performance`, `fund_market_historical`, `fund_market_snapshot`, `fund_news_article_list`, `fund_offerings_list`, `fund_performance_drawdowns`, `fund_performance_indicators_historical`, `fund_performance_nav`, `fund_performance_returns`, `fund_portfolio_asset_allocation`, `fund_portfolio_bond_history`, `fund_portfolio_bond_report_dates`, `fund_portfolio_holdings`, `fund_portfolio_industry_allocation`, `fund_portfolio_stock_history`, `fund_portfolio_stock_report_dates`, `fund_profile_detail`, `fund_quota_list`, `fund_quota_summary`, `futures_basis_historical`, `futures_basis_main_continuous_latest`, `futures_calendar_trading_schedule`, `futures_contracts_detail`, `futures_positions_company_list`, `futures_positions_company_variety_daily`, `futures_positions_contract_daily`, `futures_positions_contract_historical`, `futures_positions_variety_daily`, `futures_prices_daily`, `futures_prices_intraday`, `futures_varieties_list`, `futures_warehouse_receipts_historical`, `iwencai_announcement_search`, `iwencai_astock_selector`, `iwencai_basicinfo_query`, `iwencai_business_query`, `iwencai_event_query`, `iwencai_fund_selector`, `iwencai_hkstock_selector`, `iwencai_industry_query`, `iwencai_insresearch_query`, `iwencai_macro_query`, `iwencai_management_query`, `iwencai_news_search`, `iwencai_report_search`, `iwencai_sector_selector`, `iwencai_usstock_selector`, `options_contracts_detail`, `options_prices_daily`, `options_prices_intraday`, `options_varieties_list`, `stock_adjustment_factors`, `stock_anomaly_analysis`, `stock_anomaly_analysis_list`, `stock_auction_benchmark`, `stock_auction_snapshot`, `stock_dragon_tiger_list`, `stock_financials_balance`, `stock_financials_cashflow`, `stock_financials_income`, `stock_financials_indicators`, `stock_hot_list`, `stock_hot_list_history`, `stock_hot_rank_trend`, `stock_index_catalog`, `stock_index_constituents`, `stock_index_kline`, `stock_index_quote`, `stock_kline`, `stock_limit_break_pool`, `stock_limit_down_pool`, `stock_limit_up_ladder`, `stock_limit_up_pool`, `stock_quote`, `stock_skyrocket_list`, `stock_symbol_list`, `stock_symbol_search`, `stock_trading_calendar`, `stock_valuation` | `ctx.tools`, `ctx.stock` | `tool/call`, `tool/result` | - | Every registered stock capability is one native tool. The `stock-analysis` preset is the only shipped composition that mounts this package, so the schema cost stays out of `standard` and `ptc`. |
| `@deepseek-ai/dsh-tool-session-query` | `session_event_read`、`session_event_search`、`session_event_trace`、`session_search`、`session_trace` | `ctx.tools`、`ctx.systemPrompt`、`ctx.sessionQuery`、`a calling Agent for workspace authority` | `tool/call`、`tool/result` | - | 这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。 |
| `@deepseek-ai/dsh-tool-subagent` | `list_subagent_models`、`subagent` | `ctx.tools`、`ctx.subagents`、`ctx.systemPrompt`、`用于模型发现和所选路由校验的 ctx.llm` | `tool/call`、`tool/result`、`child session events through the chosen provider` | `subagent`、`subagent_fork` | 注册的委派工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述默认 schema 关闭模型选择，而发现 schema 则展示为已启用 Session 中可用的固定配套工具。Web preset 会在每个新顶层 Session 创建时读取插件页偏好，并为其子 Session 保留该决定；`subagent_fork` 始终使用固定路由。每个实例通过 `modelSelectionSettings`、`backgroundMode` 与 `enableRunInBackground` 独立控制是否读取模型选择设置及其后台行为。 |
| `@deepseek-ai/dsh-tool-subagent-control` | `interrupt_agent`、`list_agents`、`send_message` | `ctx.tools`、`ctx.subagents`、`ctx.agents and ctx.sessionProjections (list_agents only)` | `tool/call`、`tool/result`、`child session events through ctx.subagents` | - | 这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。 |
| `@deepseek-ai/dsh-tool-jobs` | `job_kill`、`job_list`、`job_output` | `ctx.tools`、`ctx.jobs`、`ctx.systemPrompt` | `tool/call`、`tool/result`、`user/message via agent.inject() for background completion notices` | - | 与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。 |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | `interrupt_agent`、`list_agents`、`send_message`、`spawn_teammate`、`team_task_create`、`team_task_get`、`team_task_list`、`team_task_update`、`wait_agent` | `ctx.tools`、`ctx.systemPrompt`、`ctx.agentTeams`、`an exact live Team member Agent` | `tool/call`、`team/member`、`team/message/queued`、`team/message/delivered`、`team/task`、`tool/result` | - | 这 9 个工具限定于隐式 Team Lead 与持久 teammate 作用域。随产品发布的 dsh-base bundle 默认禁用该包；文档中的 Agent Teams profile patch 会启用它，并禁用旧 continuable child 的同名控制工具。 |
| `@deepseek-ai/dsh-tool-todo` | `todo_write` | `ctx.tools`、`owning Agent session` | `tool/call`、`todo/write`、`tool/result` | - | todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。 |
| `@deepseek-ai/dsh-tool-workflow` | `workflow` | `ctx.tools`、`ctx.workflowEngine`、`ctx.systemPrompt`、`a calling Agent (exec.agent parents the script children)` | `tool/call`、`tool/result` | - | - |
| `@deepseek-ai/dsh-tool-web` | `web_fetch`、`web_search` | `ctx.tools`、`ctx.web`、`ctx.systemPrompt` | `tool/call`、`tool/result` | - | web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。 |

<a id="deepseek-aidsh-tool-ask-user"></a>

## `@deepseek-ai/dsh-tool-ask-user`

### `ask_user_question`

继续操作前，如果需要确认、选择或缺失的信息，请向用户提出简明问题。发送一个或多个问题，每个问题都带一个稳定 id，该 id 会在答案中原样返回。

```json
{
  "type": "object",
  "properties": {
    "questions": {
      "type": "array",
      "description": "Questions to ask the user before continuing.",
      "items": {
        "type": "object",
        "additionalProperties": true,
        "properties": {
          "id": {
            "type": "string",
            "description": "Stable id for this question; echoed in the answer."
          },
          "question": {
            "type": "string",
            "description": "The specific question to ask the user."
          },
          "header": {
            "type": "string",
            "description": "Optional short heading for the question, such as \"Confirm\" or \"Choose Mode\"."
          },
          "options": {
            "type": "array",
            "description": "Optional choices to show the user. If you recommend one, put it first and append \"(Recommended)\" to that label.",
            "items": {
              "type": "object",
              "additionalProperties": true,
              "properties": {
                "label": {
                  "type": "string",
                  "description": "Short user-facing option label."
                },
                "description": {
                  "type": "string",
                  "description": "One sentence explaining the tradeoff or impact."
                }
              },
              "required": [
                "label"
              ]
            }
          },
          "multi_select": {
            "type": "boolean",
            "description": "Whether the user may select more than one option. Defaults to false."
          }
        },
        "required": [
          "id",
          "question"
        ]
      }
    }
  },
  "required": [
    "questions"
  ]
}
```

来源：[`packages/interaction/tool-ask-user/src/index.ts`](../packages/interaction/tool-ask-user/src/index.ts)

ask_user_question 会暂停工具调用，直到当前 UI 提供方返回人类答案。

<a id="deepseek-aidsh-tools"></a>

## `@deepseek-ai/dsh-tools`

### `run_code`

针对可用工具执行 TypeScript 程序。接受两个必填参数：`code`，即异步函数的**函数体**（仅使用可擦除语法；支持顶层 `await` 和 `return`）；以及 `description`，简要说明该程序做什么。请根据系统提示词中的声明，以 `await tools.name(args)` 形式调用工具。只有打印或返回的内容属于程序输出，请谨慎筛选。含图片的子工具结果会在运行结束后附加。

```json
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "The program: the body of an async TypeScript function."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: \"Count TODO markers across packages\"; \"Read failing test and its fixture\"; \"Rename config key in every cordis.yml\"."
    }
  },
  "required": [
    "code",
    "description"
  ]
}
```

来源：[`packages/core/tools/src/ptc.ts`](../packages/core/tools/src/ptc.ts)

在 `mode: ptc`／`mode: both` 下，它由工具注册表所有，作为可过滤能力层之外的保留传输机制（参见 PTC mode Agent Note）。在 `ptc` 下，它是注册表对协议格式的唯一贡献；其他可见能力在使用已加载运行时语言生成的 SDK 章节中声明。程序通过 binding 调用这些能力，调用按照原生并发约定调度：启动顺序和策略遵循提交顺序，并发安全的函数体最多重叠执行 `maxParallelSubCalls` 个。调用会重新进入完整且受守卫保护的工具流水线，并将每个嵌套执行关联到此外层结果。

<a id="deepseek-aidsh-plan-mode"></a>

## `@deepseek-ai/dsh-plan-mode`

### `exit_plan_mode`

仅在规划模式下使用。提交计划供用户评审，并在获批后退出规划模式。发送**完整的** Markdown 计划，以一个为计划命名的 # 标题开头。用户可以批准（从你的下一步骤起执行计划），也可以要求继续规划；其反馈会通过工具结果返回，请修改后再次提交。

```json
{
  "type": "object",
  "properties": {
    "plan": {
      "type": "string",
      "description": "The complete plan, as markdown, starting with a # heading that names it."
    }
  },
  "required": [
    "plan"
  ]
}
```

来源：[`packages/plan/plan-mode/src/index.ts`](../packages/plan/plan-mode/src/index.ts)

规划未激活时，exit_plan_mode 仍保留在面向模型的 schema 中，这样状态转换不会在规划策略变更之外额外造成工具目录变动。其执行路径会拒绝规划模式之外的调用；在规划模式下，它通过用户交互 seam 提交计划（批准／根据反馈继续规划），批准后会在步骤边界记录规划模式已停用。

<a id="deepseek-aidsh-tool-bash"></a>

## `@deepseek-ai/dsh-tool-bash`

### `bash`

执行 bash 命令（`bash -c`）并返回 stdout/stderr。每次调用都在新 shell 中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$DSH_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"npm install\" → \"Install package dependencies\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-bash/src/index.ts`](../packages/shell/tool-bash/src/index.ts)

bash 工具是 bash 执行器 seam 面向模型的消费方。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具（来自 `@deepseek-ai/dsh-tool-jobs`）收集／停止；禁用 `enableRunInBackground` 配置（默认为 true）后，该参数会被完全移除。

<a id="deepseek-aidsh-tool-present"></a>

## `@deepseek-ai/dsh-tool-present`

### `present`

声明交付 Session 文件系统可访问的已有文件。如果你创建或更新的文件是用户要求接收的成果，则必须在写入完成后、最终回复前调用 present，包括通过 Bash 或代码执行创建的文件。在回复中提到文件路径不能替代这次调用。文件必须已存在。用户打开当前源文件；不复制或保存其内容。

```json
{
  "type": "object",
  "properties": {
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "path": {
            "type": "string",
            "description": "Path of an existing regular file. Relative paths use the Session working directory."
          },
          "description": {
            "type": "string",
            "description": "Brief description for the user."
          }
        },
        "required": [
          "path"
        ]
      }
    }
  },
  "required": [
    "files"
  ]
}
```

来源： [`packages/fs/tool-present/src/index.ts`](../packages/fs/tool-present/src/index.ts)

交付归调用方 Session 所有；Web ui-deliverables 提供源文件打开与卡片。

<a id="deepseek-aidsh-tool-pwsh"></a>

## `@deepseek-ai/dsh-tool-pwsh`

### `pwsh`

执行 PowerShell 命令（`pwsh -Command`）并返回 stdout/stderr。每次调用都在新的 pwsh 进程中运行：调用之间不保留任何状态（cwd、变量、函数），请传入 `workdir`，不要使用 `cd`。路径采用 Windows 原生形式（`C:\...`）；使用 `$env:NAME` 读取环境变量。非零退出会报告为 `[exit code: N]`。当前 harness 环境信息通过托管的 `$env:DSH_*` 变量公开，需要时请检查这些变量。命令可能在文件沙箱中运行；被阻止的文件操作报告为 `[sandbox: file access denied under <mode> mode]`，这是策略拒绝，而不是命令缺陷，请勿换一种方式重试。较长的输出会截断，只保留尾部；如可用，完整输出会保存到文件并报告其路径。在 Windows 上，被强制终止的命令会以 `[exit code: 1]` 结算且不带信号标记，请将其视为中断，而不是命令失败。对于长时间运行的命令，请设置 `run_in_background: true`：调用会立即返回 job id；使用 `job_output` 读取输出，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to execute."
    },
    "description": {
      "type": "string",
      "description": "Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples: \"ls\" → \"List files in current directory\"; \"git status\" → \"Show working tree status\"; \"Get-Process\" → \"List running processes\"."
    },
    "timeoutMs": {
      "type": "number",
      "description": "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry."
    },
    "workdir": {
      "type": "string",
      "description": "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Run in the background and return a job id immediately (collect with job_output, stop with job_kill). No timeout applies."
    }
  },
  "required": [
    "command",
    "description"
  ]
}
```

来源：[`packages/shell/tool-pwsh/src/index.ts`](../packages/shell/tool-pwsh/src/index.ts)

pwsh 工具是 Windows 组合中 bash 执行器 seam 的 PowerShell 方言消费方（由 `@deepseek-ai/dsh-pwsh-local` 等 PowerShell 执行器为 `ctx.shell` 提供后端）；除沙箱接口外，它逐项对应 bash 工具调用。使用 `run_in_background` 的运行会注册到通用 `ctx.jobs` 运行时，并通过 `job_*` 工具收集／停止；托管的 `DSH_*` 环境来自 `@deepseek-ai/dsh-shell-env`。每次调用都在新进程中运行，不使用持久 PTY 会话。路径采用原生 `C:\...` 形式，变量采用 `$env:NAME`。

<a id="deepseek-aidsh-tool-cordis"></a>

## `@deepseek-ai/dsh-tool-cordis`

### `cordis_define`

定义一个不可变的 Cordis Package。新建 Plugin 时使用 kind:"new"，只提供 3 至 6 位小写英文字母组成的语义前缀；Host 返回最终 pluginId 和 packageId。修改现有 Plugin 时使用 kind:"existing" 并传入精确 pluginId，以追加 Package 而不覆盖旧版本。code.host 与 code.client 至少提供一个；每个值都是返回 Cordis Plugin 的 plain JavaScript 函数体，不经过 TypeScript、JSX 或 import 转换。依赖 Service、Event、Builtin、Slot 或 token 前先查询 Inspect。Define 只校验参数和语法并记录源码，不申请审批、不执行 apply，也不改变 currentPackageId。成功后用返回的 ID 调用 cordis_run。

```json
{
  "type": "object",
  "properties": {
    "plugin": {
      "oneOf": [
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "new"
            },
            "idPrefix": {
              "type": "string",
              "description": "Suggested semantic prefix of 3–6 lowercase English letters; the Host adds a unique numeric suffix."
            }
          },
          "required": [
            "kind",
            "idPrefix"
          ]
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "kind": {
              "type": "string",
              "const": "existing"
            },
            "pluginId": {
              "type": "string",
              "description": "Exact ID of an existing Plugin; the new Package is appended to that instance."
            }
          },
          "required": [
            "kind",
            "pluginId"
          ]
        }
      ]
    },
    "name": {
      "type": "string",
      "description": "Short, readable Package name."
    },
    "purpose": {
      "type": "string",
      "description": "One-sentence, user-facing description of the Package purpose."
    },
    "code": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "host": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the Host-half Cordis Plugin."
        },
        "client": {
          "type": "string",
          "description": "Plain JavaScript function body that returns the browser Client-half Cordis Plugin."
        }
      }
    }
  },
  "required": [
    "plugin",
    "name",
    "purpose",
    "code"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_list`

列出 Host 当前已知的全部 Cordis Inspect Provider，包括本地 Host Provider 和 Client 最近同步的 manifest。每项包含所属平台、用途、只读方法及输入／输出 schema。创建或修改 Package 前先调用本 Tool，再从结果中选择 cordis_inspect_query 的 provider 和 method。不要猜测名称，也不要把 Inspect method 当作 Plugin 代码可调用的业务 Service。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_query`

执行 Inspect Provider 显式声明的只读查询。platform、provider 和 method 必须来自 cordis_inspect_list，input 必须符合该方法的 schema。在 cordis_define 前用本 Tool 读取精确 Service 方法、Event mode、Builtin 签名、Tool schema、主题 token，或实时 Slot 树及 props。Host 查询在本地执行；Client 查询等待首个有效页面响应，在页面回答或 Tool 被取消前保持 pending。本 Tool 不能调用业务 Service 方法或修改运行时。查询 Service.listService 和 Event.listEvents 时，先不传 input 浏览紧凑签名目录，再查询精确 service 或 event 获取结构化约定和引用类型。查询 Slots.listSubTree 时，先不传 root 浏览紧凑树，再查询精确 root 获取完整注册约定和 props。

```json
{
  "type": "object",
  "properties": {
    "platform": {
      "type": "string",
      "description": "Runtime platform that owns the Provider.",
      "enum": [
        "host",
        "client"
      ]
    },
    "provider": {
      "type": "string",
      "description": "Exact Provider ID returned by cordis_inspect_list."
    },
    "method": {
      "type": "string",
      "description": "Exact method name declared by the Provider manifest."
    },
    "input": {
      "description": "Optional query input; it must satisfy the method input schema."
    }
  },
  "required": [
    "platform",
    "provider",
    "method"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_inspect_self`

按逐层增加的详细程度检查当前 Session 拥有的动态 Cordis 对象。不传 ID 时只列 Plugin 摘要；只传 pluginId 时返回版本指针、最新 Run 和全部 Package 摘要；只有同时传 pluginId 与 packageId 才返回该不可变 Package 的 Host/Client 源码和运行诊断。packageId 不能单独传入。处理 @pluginId、修复异步失败或定义更新版本前，先查询精确 Package。本 Tool 只读，不执行代码，也不改变版本指针。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define or injected by @pluginId; omit it to list every current Plugin."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID owned by pluginId; when specified, source and diagnostics are returned."
    }
  }
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_run`

激活动态 Plugin 的一个精确 Package。首次激活、重启 currentPackageId 或回退使用 mode:"run"；已有 current 时，即使 Plugin 当前已停止，切换到其他 Package 也使用 mode:"update"。未授权的 Client Package 创建审批请求并返回 awaiting-approval；已授权的 Package 返回 starting，并在浏览器中异步继续。两种结果都不会在 Tool 内等待最终结局。currentPackageId 只在完整成功后改变；失败时保留旧 current 和目标 next。异步成功、拒绝或技术失败通过状态与 steering 报告。技术失败后，用 cordis_inspect_self 读取诊断，修正同一 Plugin 并自主重试。用户拒绝后不要再次申请审批。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable Plugin ID returned by cordis_define."
    },
    "packageId": {
      "type": "string",
      "description": "Exact immutable Package ID to activate under that Plugin."
    },
    "mode": {
      "type": "string",
      "description": "Use run for the first activation, restarting current, or rollback; use update to switch from current to a different Package.",
      "enum": [
        "run",
        "update"
      ]
    }
  },
  "required": [
    "pluginId",
    "packageId",
    "mode"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_stop`

停止动态 Plugin 的当前 Run，并取消尚未完成的审批或激活请求。保留 Plugin、全部不可变 Package、授权、currentPackageId 和 nextPackageId，以便之后直接运行或更新。停止已处于停止状态的 Plugin 会幂等成功。临时禁用副作用使用本 Tool；永久移除使用 cordis_undefine。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to stop."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

### `cordis_undefine`

永久移除当前 Session 拥有的动态 Plugin。如果它正在运行或等待审批，先停止并取消请求，再删除全部 Package、授权和版本指针。返回后，其 pluginId、packageIds、@ 引用和 Package 业务视图均失效；历史卡片只保留“Plugin 已移除”记录。需要保留版本以便重启或回退时不要调用本 Tool，应改用 cordis_stop。

```json
{
  "type": "object",
  "properties": {
    "pluginId": {
      "type": "string",
      "description": "Stable dynamic Plugin ID to remove permanently."
    }
  },
  "required": [
    "pluginId"
  ]
}
```

来源：[`packages/extensions/tool-cordis/src/index.ts`](../packages/extensions/tool-cordis/src/index.ts)

不在任何随产品发布的树中，需要显式选择启用；动态 Package 代码可以访问真实运行时，见 .agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md。该工具集注入 `@deepseek-ai/dsh-cordis-host-runner` 提供的 `ctx.dynamicCordisRunner`，后者拥有定义注册表和 vm 沙箱；组合缺少它时这些工具不会激活。运行中的 Package 在停止、undefine 或 DSH 重启前可以注册**额外的**模型可见工具；发生这类工具集变化时，系统会记录完整且有变动的请求头。

<a id="deepseek-aidsh-tool-bash-persistent"></a>

## `@deepseek-ai/dsh-tool-bash-persistent`

### `bash`

在持久 bash shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The bash command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-bash-persistent/src/index.ts`](../packages/shell/tool-bash-persistent/src/index.ts)

一个按所有者隔离的持久 bash 工具；部署组合提供 PTY 后端，并可覆盖面向模型的环境描述。

<a id="deepseek-aidsh-tool-pwsh-persistent"></a>

## `@deepseek-ai/dsh-tool-pwsh-persistent`

### `pwsh`

在持久 PowerShell shell 中运行命令。包括当前目录和已导出环境变量在内的状态会在此 agent 的多次调用之间保留。

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The PowerShell command to run. Relative path is preferred in the command."
    }
  },
  "required": [
    "command"
  ]
}
```

来源：[`packages/shell/tool-pwsh-persistent/src/index.ts`](../packages/shell/tool-pwsh-persistent/src/index.ts)

一个按所有者隔离的持久 pwsh 工具，持久 bash 工具的 Windows 对应物；部署组合提供 pwsh 方言的 PTY 后端，并可覆盖面向模型的环境描述。

<a id="deepseek-aidsh-tool-str-replace-editor"></a>

## `@deepseek-ai/dsh-tool-str-replace-editor`

### `str_replace_editor`

用于查看、创建和编辑文件的自定义编辑工具：

* 状态会在命令调用以及与用户的讨论之间持久保留
* 如果 `path` 是文件，`view` 会显示应用 `cat -n` 后的结果。如果 `path` 是目录，`view` 会列出最多向下 2 层的非隐藏文件和目录
* 如果指定的 `create` 命令目标 `path` 已作为文件存在，则不能使用该命令
* 如果 `command` 产生较长输出，输出会被截断并标记为 `<response clipped>`
* 当前命令不使用某个参数时，值为 `null` 的占位参数视为未提供。必填参数仍须提供值；删除匹配内容时应省略 `str_replace.new_str`，而不是将其设为 `null`

使用 `str_replace` 命令时请注意：

* `old_str` 参数应与原文件中一行或多行连续内容**完全**匹配。请留意空白字符！
* 如果 `old_str` 参数在文件中不唯一，则不会执行替换。请确保在 `old_str` 中包含足够的上下文，使其唯一
* `new_str` 参数应包含用于替换 `old_str` 的已编辑行

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The commands to run. Allowed options are: `view`, `create`, `str_replace`, `insert`.",
      "enum": [
        "view",
        "create",
        "str_replace",
        "insert"
      ]
    },
    "path": {
      "type": "string",
      "description": "Absolute path to file or directory, e.g. `/repo/file.py` or `/repo`."
    },
    "file_text": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `create` command, with the content of the file to be created. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "insert_line": {
      "oneOf": [
        {
          "type": "integer"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required integer parameter of `insert` command. The `new_str` will be inserted AFTER the line `insert_line` of `path`. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "new_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional string parameter of `str_replace` command containing the new string (if omitted, no string will be added). Required string parameter of `insert` command containing the string to insert. A null placeholder is accepted only by commands that do not use this parameter."
    },
    "old_str": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "null"
        }
      ],
      "description": "Required string parameter of `str_replace` command containing the string in `path` to replace. A null placeholder is treated as omitted by commands that do not use this parameter."
    },
    "view_range": {
      "oneOf": [
        {
          "type": "array",
          "items": {
            "type": "integer"
          }
        },
        {
          "type": "null"
        }
      ],
      "description": "Optional parameter of `view` command when `path` points to a file. If omitted or null, the full file is shown. If provided, the file will be shown in the indicated line number range, e.g. [11, 12] will show lines 11 and 12. Indexing at 1 to start. Setting `[start_line, -1]` shows all lines from `start_line` to the end of the file."
    }
  },
  "required": [
    "command",
    "path"
  ]
}
```

来源：[`packages/fs/tool-str-replace-editor/src/index.ts`](../packages/fs/tool-str-replace-editor/src/index.ts)

基于文件系统 seam 的独立查看／创建／唯一字面量替换／按行插入工具；可与任何 shell 或终端接口组合。

<a id="deepseek-aidsh-tool-fs"></a>

## `@deepseek-ai/dsh-tool-fs`

### `edit`

通过替换字面量文本来编辑现有 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to edit, resolved by the filesystem backend."
    },
    "old_string": {
      "type": "string",
      "description": "Literal text to replace. Must match exactly."
    },
    "new_string": {
      "type": "string",
      "description": "Literal replacement text. Use an empty string to delete the match."
    },
    "replace_all": {
      "type": "boolean",
      "description": "Replace all matches. Defaults to false; when false, old_string must appear exactly once."
    }
  },
  "required": [
    "file_path",
    "old_string",
    "new_string"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read`

读取 UTF-8 文本文件，并返回带行号的内容。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to read, resolved by the filesystem backend."
    },
    "offset": {
      "type": "number",
      "description": "1-based first line to return. Defaults to 1."
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of lines to return. Defaults to 2000."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `read_image`

读取 PNG/JPEG/WebP/GIF 文件并返回图像本身。无扩展名的路径同样被接受；格式按文件内容检测，因此规范化附件路径可以直接传入，无需复制或重命名。Harness 会在下一次模型请求前校验并缩小受支持的大图，因此仅为查看图片时应直接使用此工具，无需安装图片库或创建缩略图。可以用小批次并发读取彼此独立的文件。要求当前模型接受图像输入。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to the image file, resolved by the filesystem backend."
    }
  },
  "required": [
    "file_path"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

### `write`

创建或完全替换 UTF-8 文本文件。

```json
{
  "type": "object",
  "properties": {
    "file_path": {
      "type": "string",
      "description": "Path to write, resolved by the filesystem backend."
    },
    "content": {
      "type": "string",
      "description": "Full UTF-8 text content to write."
    }
  },
  "required": [
    "file_path",
    "content"
  ]
}
```

来源：[`packages/fs/tool-fs/src/index.ts`](../packages/fs/tool-fs/src/index.ts)

先读后写／编辑策略由 `@deepseek-ai/dsh-fs-observation-policy` 添加；它是一个 `fs/*` 事件门禁插件，不会改变 schema。加载这些工具的部署按预期也应加载该插件。没有 `ctx.attachments` 时图片工具不会注册；其 schema 与路由无关，执行时除非确切路由的模型声明图片输入，否则拒绝。

<a id="deepseek-aidsh-tool-fs-search"></a>

## `@deepseek-ai/dsh-tool-fs-search`

### `glob`

查找路径匹配 glob 模式的文件。只返回匹配的文件路径，绝不返回目录；包括隐藏文件和被忽略的文件，但排除 VCS 元数据目录。最多按修改时间顺序返回 100 条路径；如果结果更多，则改为返回从顶层条目中抽样的 100 条路径，说明已抽样，并报告完整排序列表的保存位置。该工具不枚举目录条目。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Glob pattern to match file paths against (e.g. \"**/*.ts\", \"src/**/*.test.js\"). A pattern with no \"/\" matches the basename at any depth, so \"*\" and \"*.ts\" both search the whole tree; include a separator to anchor the depth."
    },
    "path": {
      "type": "string",
      "description": "Directory to search in. Defaults to the session workspace; a relative path resolves against it."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

### `grep`

使用 ripgrep 正则表达式搜索文件内容。返回带行号的匹配行，并按文件分组。前 250 条匹配会直接返回；结果达到上限时会报告完整匹配列表的保存位置。如需周边上下文，请对匹配的文件使用 read。

```json
{
  "type": "object",
  "properties": {
    "pattern": {
      "type": "string",
      "description": "Regular expression to search for (ripgrep syntax)."
    },
    "path": {
      "type": "string",
      "description": "File or directory to search. Defaults to the session workspace; a relative path resolves against it."
    },
    "include": {
      "type": "string",
      "description": "One glob filter for which files to search (e.g. \"*.ts\", \"*.{js,jsx}\"). Not a list; negation is not supported."
    }
  },
  "required": [
    "pattern"
  ]
}
```

来源：[`packages/fs/tool-fs-search/src/index.ts`](../packages/fs/tool-fs-search/src/index.ts)

glob 和 grep 是无条件可用的发现工具，通过 ctx.subprocess spawn 随包提供的 ripgrep 二进制文件（`@vscode/ripgrep`），并作为普通前台调用运行，绝不作为后台任务；无需在宿主机安装 `rg`，也不经过 shell 层。本目录使用 `sampleOverCapGlobResults: true`；部署必须显式选择该行为。结果超过上限时，会通过可选的 ctx.spillStore 后端保存完整的格式化列表；在共置部署中，如果后端公开本地路径，返回的定位信息可供后续读取／搜索。

<a id="deepseek-aidsh-tool-terminal"></a>

## `@deepseek-ai/dsh-tool-terminal`

### `terminal_close`

关闭一个持久终端，并等待其捕获且所有的进程树完全退出。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_list`

列出当前 agent 所有的持久终端会话。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_open`

通过已注册的后端类型创建按所有者隔离的持久终端会话。需要在多次工具调用之间保留 shell 或 REPL 状态时，请使用此工具。

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "description": "Registered terminal backend type, usually \"shell\"."
    },
    "name": {
      "type": "string",
      "description": "Optional owner-local display name such as \"main\" or \"gdb\"."
    },
    "cwd": {
      "type": "string",
      "description": "Initial working directory. Defaults to the deployment workspace root."
    }
  },
  "required": [
    "type"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_read`

从持久终端读取一页有界的保留输出，不发送输入。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "offset": {
      "type": "number",
      "description": "Newest-relative line offset (default 0)."
    },
    "count": {
      "type": "number",
      "description": "Requested line count (default 500; backend caps apply)."
    }
  },
  "required": [
    "sessionId"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_send`

向持久终端发送文本。默认会提交 Enter，并等待提示符、stdin 等待、输出静默、超时或会话退出。后台模式会返回供 job_output／job_kill 使用的 job id。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id returned by terminal_open or terminal_list."
    },
    "text": {
      "type": "string",
      "description": "UTF-8 text to write to the terminal."
    },
    "submit": {
      "type": "boolean",
      "description": "Submit Enter after text (default true). Set false for control characters or incomplete REPL input."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Return a job id immediately; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "sessionId",
    "text"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

### `terminal_signal`

向持久终端当前的前台进程组发送允许的信号。

```json
{
  "type": "object",
  "properties": {
    "sessionId": {
      "type": "string",
      "description": "Terminal session id."
    },
    "signal": {
      "type": "string",
      "description": "Signal to deliver. Shell-targeted SIGKILL is rejected; use terminal_close.",
      "enum": [
        "SIGINT",
        "SIGTERM",
        "SIGKILL",
        "SIGTSTP",
        "SIGHUP"
      ]
    }
  },
  "required": [
    "sessionId",
    "signal"
  ]
}
```

来源：[`packages/terminal/tool-terminal/src/index.ts`](../packages/terminal/tool-terminal/src/index.ts)

这 6 个终端工具需要选择启用，用于补充一次性 bash／文件系统工具。`terminal_send(run_in_background: true)` 会注册到 `ctx.jobs`；schema 不包含 TUI、具名按键序列、BEL、调整尺寸、自动启动和跨 agent 共享。

<a id="deepseek-aidsh-tool-goal"></a>

## `@deepseek-ai/dsh-tool-goal`

### `create_goal`

当当前直接人类请求是需要跨自主 Goal Round 持续推进的长期目标时，创建一个持久化的同会话完成目标。即使用户没有明确说「创建目标」，你也可以推断其意图。不要用于简单的单轮工作。执行时会拒绝非人类权限和 subagent 权限。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The concrete completion objective inferred from the direct human request."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Optional positive safe-integer limit on automatic continuation rounds."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `get_goal`

读取当前的同会话目标，包括确切的 id／revision、目标、阶段、已完成的延续 Round 数、Round 上限、存在时的阻塞原因，以及是否已准备下一次延续。更新目标前请先调用此工具。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

### `update_goal`

更新确切的当前目标 revision。edit、pause 和 resume 要求直接的顶层人类请求。在自动延续当前目标期间，也允许 complete 和 blocked。在达到配置的最小 Round 数之前会拒绝 blocked；模型仍须判断相同条件是否在这些 Round 中持续存在，并在 blocked_reason 中予以说明。

```json
{
  "type": "object",
  "properties": {
    "goal_id": {
      "type": "string",
      "description": "Exact id returned by get_goal."
    },
    "revision": {
      "type": "number",
      "description": "Exact positive revision returned by get_goal."
    },
    "action": {
      "type": "string",
      "description": "edit | pause | resume | complete | blocked",
      "enum": [
        "edit",
        "pause",
        "resume",
        "complete",
        "blocked"
      ]
    },
    "objective": {
      "type": "string",
      "description": "Replacement objective; valid only with action edit."
    },
    "max_goal_rounds": {
      "type": "number",
      "description": "Replacement cap; valid only with action edit."
    },
    "blocked_reason": {
      "type": "string",
      "description": "Concrete blocking condition; required only with action blocked."
    }
  },
  "required": [
    "goal_id",
    "revision",
    "action"
  ]
}
```

来源：[`packages/goal/tool-goal/src/index.ts`](../packages/goal/tool-goal/src/index.ts)

create、edit、pause 和 resume 要求直接来自人类的根权限；complete 和 blocked 也接受确切的当前 Goal Round。blocked 的默认下限是 3 个获准的 Round。

<a id="deepseek-aidsh-schedule"></a>

## `@deepseek-ai/dsh-schedule`

### `schedule_create`

在当前会话中创建一条提醒。请提供非空 prompt 和恰好一个 selector：正的安全整数 after_seconds 延时；作为严格带偏移日期时间或本地日期／时间对象的 at；或不小于 300 的安全整数 every_seconds。固定速率提醒始终与创建时刻对齐，会跳过错过的发生时点，并把每条逾期规则的最新一个发生时点合并到一个批次中。交付模式是 session-local：只有此会话处于 live 状态时，提醒才会准时运行；否则提醒会进入 overdue 状态，直至会话恢复。

```json
{
  "type": "object",
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Reminder content to present when the target becomes due."
    },
    "after_seconds": {
      "type": "number",
      "description": "Positive safe-integer delay in seconds."
    },
    "every_seconds": {
      "type": "number",
      "description": "Fixed-rate safe-integer interval in seconds, at least 300."
    },
    "at": {
      "oneOf": [
        {
          "type": "string"
        },
        {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "date": {
              "type": "string"
            },
            "time": {
              "type": "string"
            },
            "time_zone": {
              "type": "string"
            }
          },
          "required": [
            "date",
            "time",
            "time_zone"
          ]
        }
      ],
      "description": "Absolute target as strict offset RFC 3339 or local date/time with an explicit IANA zone."
    }
  },
  "required": [
    "prompt"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_delete`

使用 schedule_create 或 schedule_list 返回的确切 id，删除当前会话中的一条活动提醒。未知或已经结束的 id 会返回 deleted false。

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Exact session-local schedule id."
    }
  },
  "required": [
    "id"
  ]
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

### `schedule_list`

按创建顺序列出当前会话中的所有活动提醒，包括确切 id、UTC 目标、scheduled 或 overdue 状态，以及 session-local 交付模式。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/schedule/schedule/src/tools.ts`](../packages/schedule/schedule/src/tools.ts)

仅在选择启用的 Schedule 插件加载后创建的 live 根 Agent scope 内注册。版本 1 接受 after_seconds、显式绝对 at 和有界固定速率 every_seconds，并披露 session-local 交付；管理读取与变更必须通过共享的 Session 持久化 barrier。

<a id="deepseek-aidsh-tool-lsp"></a>

## `@deepseek-ai/dsh-tool-lsp`

### `lsp`

查询语言服务器，以精确导航代码。operation 可取 goToDefinition、findReferences、goToImplementation 或 hover。line 和 character 是从 1 开始的 UTF-16 光标坐标。findReferences 包含声明。

```json
{
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "description": "goToDefinition, findReferences, goToImplementation, or hover.",
      "enum": [
        "goToDefinition",
        "findReferences",
        "goToImplementation",
        "hover"
      ]
    },
    "file_path": {
      "type": "string",
      "description": "The source file to query, relative to the workspace or absolute."
    },
    "line": {
      "type": "number",
      "description": "One-based line of the cursor."
    },
    "character": {
      "type": "number",
      "description": "One-based UTF-16 column of the cursor."
    }
  },
  "required": [
    "operation",
    "file_path",
    "line",
    "character"
  ]
}
```

来源：[`packages/lsp/tool-lsp/src/index.ts`](../packages/lsp/tool-lsp/src/index.ts)

lsp 工具将提供方选择和语言服务器子进程置于 ctx.lsp 之后，因此其模型可见 schema 在更换提供方时保持稳定。运行时要求已注册提供方，例如 `@deepseek-ai/dsh-lsp-stdio`；如果没有提供方，查询会返回结构化 `LSP_UNAVAILABLE` 错误，而不会改变 schema。

<a id="deepseek-aidsh-tool-ralph"></a>

## `@deepseek-ai/dsh-tool-ralph`

### `ralph`

围绕一个不可变目标运行使用全新 agent 的前台 Ralph 循环。仅当直接人类明确要求 Ralph 或使用全新 agent 迭代时使用。每个 Round 都会启动一个全新子级，该子级看不到父级对话或先前子会话；共享工作区充当长期记忆，Round 之间只传递有界的结构化报告。当工作进程报告完成、报告具体阻塞项或达到 Round 上限时，调用返回。普通的长期同会话工作应使用 goal 工具。

```json
{
  "type": "object",
  "properties": {
    "objective": {
      "type": "string",
      "description": "The immutable completion objective for every fresh Ralph round."
    },
    "maxRounds": {
      "type": "number",
      "description": "Optional positive safe-integer round cap, bounded by the deployment ceiling."
    }
  },
  "required": [
    "objective"
  ]
}
```

来源：[`packages/workflow/tool-ralph/src/index.ts`](../packages/workflow/tool-ralph/src/index.ts)

固定的前台工作流会在每个 Round 启动一个全新的结构化子级；模型只能选择不可变目标和可选的 Round 上限。

<a id="deepseek-aidsh-tool-skill"></a>

## `@deepseek-ai/dsh-tool-skill`

### `skill`

加载可用 skill（技能）的完整说明。在执行点名某项 skill 或与其明确匹配的任务前，请使用会话 skill 目录中的确切名称调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "The exact skill name from the available skills list."
    }
  },
  "required": [
    "name"
  ]
}
```

来源：[`packages/skill/tool-skill/src/index.ts`](../packages/skill/tool-skill/src/index.ts)

<a id="deepseek-aidsh-tool-session-query"></a>

## `@deepseek-ai/dsh-tool-session-query`

### `session_event_read`

从一个已获授权的会话中读取一个完整且未删节的事件，以及可选的相邻原始事件概述。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    },
    "before": {
      "type": "integer",
      "description": "Number of preceding raw events to summarize. Omit for none."
    },
    "after": {
      "type": "integer",
      "description": "Number of following raw events to summarize. Omit for none."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_search`

在一个已获授权的会话中搜索先前事件；如果搜索当前会话，则排除执行此次调用的步骤。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "query": {
      "type": "string",
      "description": "Literal full-text query over the target session."
    },
    "seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_event_trace`

读取已获授权会话中某个事件的所有直接替换关系，以及该事件与其引用的来源事件之间的关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    },
    "seq": {
      "type": "integer",
      "description": "Target event sequence number."
    }
  },
  "required": [
    "seq"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_search`

搜索调用方工作区中的先前会话，并从每个会话返回匹配度最高的事件。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Literal full-text query over prior session history."
    },
    "session_ids": {
      "type": "array",
      "description": "Optional session ids to include.",
      "items": {
        "type": "string"
      }
    },
    "created_at_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time lower bound."
    },
    "created_at_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 creation-time upper bound."
    },
    "parent_session_ids": {
      "type": "array",
      "description": "Optional direct parent session ids.",
      "items": {
        "type": "string"
      }
    },
    "include_root_sessions": {
      "type": "boolean",
      "description": "Include sessions with no parent in the parent filter."
    },
    "availability": {
      "type": "array",
      "description": "Require at least one selected source availability.",
      "items": {
        "type": "string",
        "enum": [
          "live",
          "persisted"
        ]
      }
    },
    "event_seq_from": {
      "type": "integer",
      "description": "Inclusive event sequence lower bound."
    },
    "event_seq_to": {
      "type": "integer",
      "description": "Inclusive event sequence upper bound."
    },
    "event_time_from": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time lower bound."
    },
    "event_time_to": {
      "type": "string",
      "description": "Inclusive timezone-qualified ISO 8601 event-time upper bound."
    },
    "event_types": {
      "type": "array",
      "description": "Event types to include.",
      "items": {
        "type": "string"
      }
    },
    "event_surfaces": {
      "type": "array",
      "description": "Event surfaces to include.",
      "items": {
        "type": "string",
        "enum": [
          "current",
          "shadowed",
          "log-only"
        ]
      }
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

### `session_trace`

读取围绕一个会话的已授权会话谱系，包括完整可见的祖先和后代关系。

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Target session id. Omit for the current session."
    }
  }
}
```

来源：[`packages/session-query/tool-session-query/src/index.ts`](../packages/session-query/tool-session-query/src/index.ts)

这 5 个只读工具会隐藏提供方游标，并根据不可变的调用 agent 会话为每个结果授权。该包需要选择启用；需要强制截止时间或限制行内输出的组合还会挂载通用超时或 spill 策略。

<a id="deepseek-aidsh-tool-subagent"></a>

## `@deepseek-ai/dsh-tool-subagent`

### `list_subagent_models`

发现 subagent 可用的 LLM 路由，不更改当前 Agent。无参数调用会列出已注册提供方；提供 `provider` 时会列出其公布的模型；同时提供 `provider` 和 `model` 时会检查该精确模型及其推理强度。目录条目只提供建议：adapter 可能接受未列出的模型 id。把返回的 id 用于委派工具的 `provider`、`model` 与 `reasoning_effort` 字段。

```json
{
  "type": "object",
  "properties": {
    "provider": {
      "type": "string",
      "description": "Registered LLM provider id. Omit to list providers."
    },
    "model": {
      "type": "string",
      "description": "Exact model id to inspect. Requires provider; omit to list that provider's advertised models."
    }
  }
}
```

来源：[`packages/subagent/tool-subagent/src/list-models.ts`](../packages/subagent/tool-subagent/src/list-models.ts)

### `subagent`

将一项自包含任务委派给 subagent（在自身上下文中工作的独立 agent），用它卸载聚焦且独立的工作，例如研究、限定范围的实现或分析，以免消耗当前对话的上下文。subagent 会返回结果，但不会返回中间步骤。请提供完整、独立的提示词，因为它看不到当前对话。此调用默认等待结果。设置 `run_in_background: true` 可返回 job id；使用 `job_output` 收集结果，使用 `job_kill` 停止任务。

```json
{
  "type": "object",
  "properties": {
    "description": {
      "type": "string",
      "description": "A short (3-5 word) description of the delegated task, for display."
    },
    "prompt": {
      "type": "string",
      "description": "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill."
    }
  },
  "required": [
    "description",
    "prompt"
  ]
}
```

来源：[`packages/subagent/tool-subagent/src/index.ts`](../packages/subagent/tool-subagent/src/index.ts)

注册的委派工具名称取决于加载时 `toolName` 配置（默认为 `subagent`）；上述默认 schema 关闭模型选择，而发现 schema 则展示为已启用 Session 中可用的固定配套工具。Web preset 会在每个新顶层 Session 创建时读取插件页偏好，并为其子 Session 保留该决定；`subagent_fork` 始终使用固定路由。每个实例通过 `modelSelectionSettings`、`backgroundMode` 与 `enableRunInBackground` 独立控制是否读取模型选择设置及其后台行为。

<a id="deepseek-aidsh-tool-subagent-control"></a>

## `@deepseek-ai/dsh-tool-subagent-control`

### `interrupt_agent`

根据 agent id 请求取消后台 agent 的当前轮次。目标可以是你的直接子级，也可以是在你下方创建的更深层 agent。只有当前轮次会停止：已经排队发给该 agent 的消息会一直搁置到后续的 send_message；它启动的 agent 会继续运行；该 agent 本身仍可接受后续操作。停止请求被接受后，此调用立即返回，因此目标可能还会短暂运行；中断一个已经完成的 agent 是可接受的空操作。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of the running agent to interrupt."
    }
  },
  "required": [
    "agent_id"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

### `list_agents`

按持久 id 和标签列出你的可继续后台 subagent。用它回忆你启动过哪些 subagent，而不是轮询完成情况——subagent 完成时你会被告知。状态来自实时注册表：running 表示 agent 此刻正在工作；idle 表示已加载但处于轮次之间，可能正在等待它启动的 agent；ready 表示它只存在于存储中——可恢复而非终态，也不表示有结果等待收集；`send_message` 会在运行中 child 的最近 step 边界 steer 消息，或为 idle、ready child 启动轮次，且无论处于哪种状态，直接子级都仍可作为 `send_message` 的目标。该快照并非投递承诺；`send_message` 会执行权威检查，仍可能失败。无法读取的子级会作为诊断信息报告，而不会被静默丢弃。`descendants` 作用域会按稳定的前序顺序遍历你下方的整棵树，并为每个条目标注其持久的直接父会话 id 和深度。只有深度为 1 的条目可以使用 `send_message`；更深的条目只能作为 `interrupt_agent` 的候选目标。

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "description": "children (default) lists direct children only; descendants walks the complete tree below you.",
      "enum": [
        "children",
        "descendants"
      ]
    }
  }
}
```

来源：[`packages/subagent/tool-subagent-control/src/list-agents.ts`](../packages/subagent/tool-subagent-control/src/list-agents.ts)

### `send_message`

根据 agent id 向直接可继续 child 发送消息。如果你是驻留的可继续 child，也可以把自己的直接 parent 作为目标。如果目标仍在工作，消息会 steer 其最近的 step；如果目标处于 idle，消息会启动一个轮次。此调用不会返回该 agent 的答案，只会确认消息已投递。调用失败表示消息**未**投递。

```json
{
  "type": "object",
  "properties": {
    "agent_id": {
      "type": "string",
      "description": "The agent id of your direct continuable child, or your direct parent when you are a resident continuable child."
    },
    "message": {
      "type": "string",
      "description": "The message to deliver to the agent."
    }
  },
  "required": [
    "agent_id",
    "message"
  ]
}
```

来源：[`packages/subagent/tool-subagent-control/src/index.ts`](../packages/subagent/tool-subagent-control/src/index.ts)

这些是控制可继续后台 subagent 的全局命名工具：绑定提供方的 `tool-subagent` 实例注册不同的委派工具；本包注册一次 `send_message` 和 `interrupt_agent`，另由 `list_agents` 通过单独加载的 `/list-agents` 插件提供，其目录行使用 sessionProjections 和实时 Agent 注册表。

<a id="deepseek-aidsh-tool-jobs"></a>

## `@deepseek-ai/dsh-tool-jobs`

### `job_kill`

根据 job id 请求取消正在运行的后台任务。此调用立即返回；任务的工作真正停止后，会以 killed 状态结算。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "reason": {
      "type": "string",
      "description": "Optional short reason, recorded in the log and forwarded to the job."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_list`

列出你的后台任务（包括正在运行和已完成的任务）及其 id、种类和状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

### `job_output`

读取后台任务。流式任务只返回自上次读取以来的输出；最终输出任务会在结算后返回结果。每个响应都以 `[status: ...]` 结尾。读取默认不阻塞；设置 `wait: true` 后，最长等待到配置的上限。

```json
{
  "type": "object",
  "properties": {
    "job_id": {
      "type": "string",
      "description": "Job id returned by the tool that started the background work."
    },
    "wait": {
      "type": "boolean",
      "description": "Block until the job reaches a terminal status or the timeout expires. A timed-out wait returns [status: running] and leaves the job alive."
    },
    "timeout_ms": {
      "type": "number",
      "description": "Max wait in milliseconds (only meaningful with wait: true). Defaults to the configured wait timeout; capped by the configured maximum."
    }
  },
  "required": [
    "job_id"
  ]
}
```

来源：[`packages/jobs/tool-jobs/src/index.ts`](../packages/jobs/tool-jobs/src/index.ts)

与任务种类无关的后台任务控制器：后台 bash 命令、PTY 发送和 subagent 都通过相同的 3 个工具读取、列出和终止。加载该插件会挂接控制器，从而启用生产方的 `ctx.jobs.start()`。

<a id="deepseek-aidsh-experimental-tool-agent-team"></a>

## `@deepseek-ai/dsh-experimental-tool-agent-team`

### `interrupt_agent`

中断一名 teammate 的当前 turn，同时保留其待处理 inbox。仅 Team Lead 可用。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Teammate name."
    }
  },
  "required": [
    "target"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `list_agents`

列出 Lead 与所有持久 teammate，以及各自当前的运行时状态。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `send_message`

向另一名 Team member 发送一条持久消息。running target 会在最近的步骤边界收到消息；idle target 会启动一个 turn；inactive teammate 会冷恢复。

```json
{
  "type": "object",
  "properties": {
    "target": {
      "type": "string",
      "description": "Team member name, or lead."
    },
    "message": {
      "type": "string",
      "description": "Self-contained message for the target."
    }
  },
  "required": [
    "target",
    "message"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `spawn_teammate`

创建一名具名、持久的 teammate。只有 Team Lead 可以调用此工具。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Unique lower-kebab-case teammate name."
    },
    "description": {
      "type": "string",
      "description": "Short description of the delegated responsibility."
    },
    "prompt": {
      "type": "string",
      "description": "Complete initial task for the teammate."
    },
    "context": {
      "type": "string",
      "description": "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh.",
      "enum": [
        "fresh",
        "fork"
      ]
    }
  },
  "required": [
    "name",
    "description",
    "prompt"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_create`

在共享 Team 任务板上创建一个无 owner 的 pending task。

```json
{
  "type": "object",
  "properties": {
    "subject": {
      "type": "string",
      "description": "Concise task title."
    },
    "description": {
      "type": "string",
      "description": "Complete task details and acceptance criteria."
    },
    "blocked_by": {
      "type": "array",
      "description": "Task ids that must complete first.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Advisory workspace-relative file or directory prefixes this task expects to modify.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "subject",
    "description"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_get`

在修改或执行共享任务前，读取其完整的最新值。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    }
  },
  "required": [
    "task_id"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_list`

列出共享任务，包括 readiness、owner、revision、blocker 与 write-scope warning。

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "description": "Optional exact status filter.",
      "enum": [
        "pending",
        "in_progress",
        "completed"
      ]
    },
    "owner": {
      "type": "string",
      "description": "Optional member-name filter; use unowned for tasks without an owner."
    },
    "ready": {
      "type": "boolean",
      "description": "Optional readiness filter."
    },
    "cursor": {
      "type": "integer",
      "description": "Zero-based result offset. Defaults to 0."
    },
    "limit": {
      "type": "integer",
      "description": "Number of rows, 1 through 100. Defaults to 50."
    }
  }
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `team_task_update`

使用 team_task_get 或 team_task_list 返回的最新 revision，对共享任务操作执行 compare-and-set。

```json
{
  "type": "object",
  "properties": {
    "task_id": {
      "type": "string",
      "description": "Shared task id."
    },
    "expected_revision": {
      "type": "integer",
      "description": "Current task revision used as the CAS precondition."
    },
    "action": {
      "type": "string",
      "description": "Task transition to apply.",
      "enum": [
        "claim",
        "release",
        "edit",
        "set_dependencies",
        "complete",
        "reopen",
        "reassign",
        "delete"
      ]
    },
    "subject": {
      "type": "string",
      "description": "Replacement title for edit."
    },
    "description": {
      "type": "string",
      "description": "Replacement details for edit."
    },
    "blocked_by": {
      "type": "array",
      "description": "Complete blocker list for set_dependencies.",
      "items": {
        "type": "string"
      }
    },
    "write_scopes": {
      "type": "array",
      "description": "Replacement advisory write scopes for edit.",
      "items": {
        "type": "string"
      }
    },
    "owner": {
      "type": "string",
      "description": "Member name for Lead-only reassign; omit to unassign."
    }
  },
  "required": [
    "task_id",
    "expected_revision",
    "action"
  ]
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

### `wait_agent`

等待本次调用开始后下一次 teammate 状态、mailbox 或共享任务变更。它绝不会唤醒 inactive member；若没有其他 member 正在 running 或 provisioning，则立即返回 noProgress。唤醒或超时后应重新列出状态，而不是轮询。

```json
{
  "type": "object",
  "properties": {
    "timeout_ms": {
      "type": "integer",
      "description": "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
    }
  }
}
```

来源：[`packages/experimental/tool-agent-team/src/index.ts`](../packages/experimental/tool-agent-team/src/index.ts)

这 10 个工具限定于隐式 Team Lead 与持久 teammate 作用域。随产品发布的 dsh-base bundle 默认禁用该包；文档中的 Agent Teams profile patch 会启用它，并禁用旧 continuable child 的同名控制工具。


<a id="deepseek-aidsh-tool-todo"></a>

## `@deepseek-ai/dsh-tool-todo`

### `todo_write`

记录并更新当前工作的结构化任务列表。每次调用都要发送**完整列表**，它会**替换**之前的列表，不支持局部更新或逐项编辑。请用它规划多步骤工作并展示进度：开始前为每个具体步骤添加一项 todo。将当前正在处理的每项 todo 标记为 `in_progress`；确实并行运行时（例如并发 subagent 或后台命令）可同时标记多项，顺序工作则标记 1 项。只要工作尚未完成，就应至少有一项任务为 `in_progress`。某项 todo 完成后立即标记为 `completed`，不要批量标记完成；只有全部工作完成后，才可以没有 `in_progress` 项。简单的单步骤任务无需使用列表。状态：`pending`（未开始）、`in_progress`（正在处理）、`completed`（已完成）。

```json
{
  "type": "object",
  "properties": {
    "todos": {
      "type": "array",
      "description": "The COMPLETE task list, replacing any previous list.",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "content": {
            "type": "string",
            "description": "What the task is — a short imperative line."
          },
          "status": {
            "type": "string",
            "description": "pending (not started) | in_progress (now) | completed (done).",
            "enum": [
              "pending",
              "in_progress",
              "completed"
            ]
          }
        },
        "required": [
          "content",
          "status"
        ]
      }
    }
  },
  "required": [
    "todos"
  ]
}
```

来源：[`packages/todo/tool-todo/src/index.ts`](../packages/todo/tool-todo/src/index.ts)

todo_write 是会话所有的状态；UI 将最新的 todo/write 事件渲染为检查清单。`allowParallelInProgress` 是没有默认值的必填项，因此本目录明确选择 `true`，对应描述允许同时存在多个 `in_progress` 项。选择 `false` 的部署会获得同一工具，但描述会要求只能有 1 个活动任务。

<a id="deepseek-aidsh-tool-workflow"></a>

## `@deepseek-ai/dsh-tool-workflow`

### `workflow`

运行用于大规模编排 subagent 的 JavaScript 工作流脚本。当工作会分散到许多相互独立的部分时，请使用此工具，例如审查大量文件、执行迁移、开展多角度研究或对发现进行对抗式验证；此时应将编排写成脚本，而不是逐轮委派。

工作流的身份通过 `meta` 参数以 JSON 形式传入：必填的 `name`（简短 kebab-case）和 `description` 字符串，以及可选的 `whenToUse` 字符串和 `phases` 数组（`{title, detail?, provider?, model?}`）。`script` 参数只能是纯 JavaScript **函数体**，不能是 TypeScript，也不能包含 `export const meta` 语句；meta 是参数而非代码。脚本支持顶层 await；请以 `return <value>` 结尾，该值必须可以 JSON 序列化，并作为此工具的结果。

脚本函数体提供以下钩子：

- `agent(prompt, opts?): Promise<any>`：运行一个 subagent 直至完成。不提供 `opts.schema` 时，解析为子级最终文本；提供 `opts.schema` 时，它必须是以对象为根、且**只能**使用 type/properties/required/additionalProperties/items/enum/const/oneOf 的 JSON Schema，不支持 pattern/format/数值边界，此时解析为通过校验的对象。子级失败时解析为 `null`，可使用 `.filter(Boolean)` 过滤。其他选项包括 `label`（显示名称）、`phase`（进度组），以及相互独立的 `provider`／`model` LLM（大语言模型）目标覆盖项，两者可单独提供。其他任何选项（`effort`／`isolation`／`agentType`）都会明确报错。
- `pipeline(items, ...stages): Promise<any[]>`：让每个条目分别经过各阶段，阶段之间**没有**屏障；多阶段工作优先使用它。每个阶段接收 `(prev, item, index)`。普通的阶段异常会将该**条目**变为 `null`，并跳过它的剩余阶段。
- `parallel(thunks): Promise<any[]>`：并发运行零参数函数并等待**全部**完成。它会形成屏障，仅当某个阶段确实需要汇总全部先前结果时使用。抛出异常的 thunk 解析为 `null`。
- `phase(title)`：开始一个进度阶段；`log(message)`：说明进度；`args`：工具调用的 `args` 输入，原样提供。

如果误用钩子（参数错误、未知选项、不受支持的 schema、触发上限），抛出的错误**总会**终止脚本，绝不会退化为单个条目的 `null`。

约束：并发上限和 agent 总数上限均会生效；不提供文件系统、网络、定时器或 Node.js API。具体工作由 agent 完成，脚本只负责编排。该运行在前台执行：整个脚本完成后，调用才会返回。

```json
{
  "type": "object",
  "properties": {
    "script": {
      "type": "string",
      "description": "The plain-JS workflow script body (top-level await allowed; NO `export const meta` statement; end with `return <json-value>`)."
    },
    "meta": {
      "type": "object",
      "description": "The workflow identity block (plain JSON — never code).",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "description": "Short kebab-case workflow name."
        },
        "description": {
          "type": "string",
          "description": "One-line description of what the workflow does."
        },
        "whenToUse": {
          "type": "string",
          "description": "Optional guidance on when this workflow applies."
        },
        "phases": {
          "type": "array",
          "description": "Optional phase declarations matched by phase() calls.",
          "items": {
            "type": "object",
            "additionalProperties": true,
            "properties": {
              "title": {
                "type": "string",
                "description": "The phase title phase() calls match by exact string."
              },
              "detail": {
                "type": "string",
                "description": "Optional one-line description of the phase."
              },
              "provider": {
                "type": "string",
                "description": "Optional provider override this phase is expected to use."
              },
              "model": {
                "type": "string",
                "description": "Optional model override this phase is expected to use."
              }
            },
            "required": [
              "title"
            ]
          }
        }
      },
      "required": [
        "name",
        "description"
      ]
    },
    "args": {
      "type": "object",
      "description": "Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {\"files\": [...]}).",
      "additionalProperties": true
    }
  },
  "required": [
    "script",
    "meta"
  ]
}
```

来源：[`packages/workflow/tool-workflow/src/index.ts`](../packages/workflow/tool-workflow/src/index.ts)

<a id="deepseek-aidsh-tool-web"></a>

## `@deepseek-ai/dsh-tool-web`

### `web_fetch`

获取指定 HTTP(S) URL 的内容，并将其解码为文本后返回。

```json
{
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "description": "The HTTP(S) URL to fetch."
    }
  },
  "required": [
    "url"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

### `web_search`

在 Web 上搜索最新信息。在必填的 `queries` 数组中提供 1–4 个查询。返回可选的摘要答案和来源 URL 列表。

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "description": "Required search queries; accepts 1–4 items and merges their results.",
      "items": {
        "type": "string"
      }
    }
  },
  "required": [
    "queries"
  ]
}
```

来源：[`packages/web/tool-web/src/index.ts`](../packages/web/tool-web/src/index.ts)

web_search 和 web_fetch 将提供方选择置于 ctx.web 之后，使模型可见 schema 在更换后端时保持稳定。

## `@deepseek-ai/dsh-tool-stock`

### `fund_backtest_indicators`

基金回测可用指标。查询在线回测支持的指标、操作符与规则，无业务参数。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_backtest_result`

基金在线回测。按买入卖出条件执行基金在线回测，返回交易明细与净值曲线。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "含市场后缀的完整基金代码，例如 000001.OF。"
    },
    "buy_conditions": {
      "type": "string",
      "description": "买入条件 JSON 字符串，必须是对象或数组。"
    },
    "sell_conditions": {
      "type": "string",
      "description": "卖出条件 JSON 字符串，必须是对象或数组。"
    },
    "buy_frequency_type": {
      "type": "string",
      "description": "买入频率，具体值由上游判定，例如 WEEKLY。"
    },
    "max_buy_times": {
      "type": "number",
      "description": "最大买入次数。"
    },
    "per_buy_amount": {
      "type": "number",
      "description": "每次买入金额。"
    }
  },
  "required": [
    "thscode",
    "buy_conditions",
    "sell_conditions",
    "buy_frequency_type",
    "max_buy_times",
    "per_buy_amount"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_companies_detail`

查询基金公司详情；timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "company_id": {
      "type": "string",
      "description": "基金公司 ID"
    }
  },
  "required": [
    "company_id"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_corporate_actions_dividends`

查询基金分红记录；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_diagnostics_detail`

查询基金诊断详情；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_financials_balance_sheets`

查询基金资产负债表；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_financials_income_statements`

查询基金利润表；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_financials_indicators`

查询基金财务指标；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_holders_detail`

查询基金持有人结构，支持合并份额、独立份额或全部披露口径，返回实际命中口径、机构占比、持有人户数、户均持有份额、个人占比和管理人员工持有比例。上游按报告期披露。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "merge_scope": {
      "type": "string",
      "description": "持有人披露口径：all=全部口径（默认，分别返回合并/独立份额的最新记录） / merged=A类、C类等份额合并披露 / separate=当前份额独立披露",
      "default": "all",
      "enum": [
        "all",
        "merged",
        "separate"
      ]
    },
    "thscode": {
      "type": "string",
      "description": "完整基金 thscode，必须保留市场后缀",
      "default": "161725.SZ"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_holders_top`

查询基金前十大持有人；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "description": "返回条数，最大 10"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_indicators_line`

基金画线指标。查询基金指标时间序列；时间轴使用 Unix 毫秒整数。

```json
{
  "type": "object",
  "properties": {
    "indexes": {
      "type": "string",
      "description": "指标分组 JSON 数组，每组含 thscodes 与 index_info。"
    },
    "time_range": {
      "type": "string",
      "description": "时间范围 JSON 对象，含 time_type、start、end（Unix 毫秒）。"
    }
  },
  "required": [
    "indexes",
    "time_range"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_indicators_table`

基金表格指标。查询基金表格式指标结果，支持分页与排序；省略参数时不注入业务默认值。

```json
{
  "type": "object",
  "properties": {
    "code_selectors": {
      "type": "string",
      "description": "代码选择器 JSON 对象。"
    },
    "indexes": {
      "type": "string",
      "description": "指标 JSON 数组，index_id 必填。"
    },
    "page_info": {
      "type": "string",
      "description": "分页 JSON 对象，起点为 0。"
    },
    "sort": {
      "type": "string",
      "description": "排序 JSON 数组，每项含 idx 与 type。"
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_managers_detail`

查询基金经理详情；timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "manager_id": {
      "type": "string",
      "description": "基金经理 ID"
    }
  },
  "required": [
    "manager_id"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_managers_experience`

查询基金经理从业经历；timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "manager_id": {
      "type": "string",
      "description": "基金经理 ID"
    }
  },
  "required": [
    "manager_id"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_managers_investment_style`

查询基金经理投资风格。关联基金解析失败时对应字段为空，不影响主能力；timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "manager_id": {
      "type": "string",
      "description": "基金经理 ID"
    }
  },
  "required": [
    "manager_id"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_managers_performance`

查询基金经理业绩；timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "manager_id": {
      "type": "string",
      "description": "基金经理 ID"
    },
    "range": {
      "type": "string",
      "description": "统计区间",
      "enum": [
        "month",
        "tmonth",
        "year",
        "nowyear",
        "now"
      ]
    }
  },
  "required": [
    "manager_id",
    "range"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_market_historical`

查询单只 ETF 的历史日线行情。仅支持 interval=1d，窗口最长 5 个自然年；LOF、场外基金和 REITs 返回 code=3004。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "结束时间，毫秒 Unix 时间戳；必须不早于 start，且窗口最长 5 个自然年"
    },
    "interval": {
      "type": "string",
      "description": "K 线周期，当前仅支持 1d(日线)",
      "default": "1d",
      "enum": [
        "1d"
      ]
    },
    "start": {
      "type": "integer",
      "description": "起始时间，毫秒 Unix 时间戳"
    },
    "thscode": {
      "type": "string",
      "description": "单只 ETF thscode，如 510300.SH。不接受逗号多值",
      "default": "510300.SH"
    }
  },
  "required": [
    "end",
    "start",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_market_snapshot`

查询 ETF 行情快照。基金使用完整 thscode 唯一定位；LOF、场外基金和 REITs 返回 code=3004。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只 ETF thscode，如 510300.SH。不接受逗号多值",
      "default": "510300.SH"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_news_article_list`

查询基金资讯列表；使用 offset/has_more 游标分页，上游未提供总记录数，因此 data 不返回 total；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "description": "返回条数"
    },
    "offset": {
      "type": "string",
      "description": "翻页游标"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_offerings_list`

查询基金募集列表；timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "subscribe": {
      "type": "string",
      "description": "募集状态",
      "enum": [
        "active",
        "upcoming"
      ]
    }
  },
  "required": [
    "subscribe"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_performance_drawdowns`

查询基金回撤指标；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_performance_indicators_historical`

查询基金历史业绩指标；周期固定为 DAY_1，data 仅使用 timestamp/item，不返回顶层 thscode/interval；timestamp 保留明确的上游数据时间。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "结束时间，毫秒 Unix 时间戳"
    },
    "start": {
      "type": "integer",
      "description": "起始时间，毫秒 Unix 时间戳"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "end",
    "start",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_performance_nav`

查询基金单位净值和复权净值。不传 range 时只返回最新一个净值日期；传 range 时返回区间序列。nav_type 控制返回单位净值、复权净值或二者。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "nav_type": {
      "type": "string",
      "description": "净值字段：unit(单位净值) / adj(复权净值) / unit,adj(同时返回二者)",
      "default": "unit,adj",
      "enum": [
        "unit",
        "adj",
        "unit,adj"
      ]
    },
    "range": {
      "type": "string",
      "description": "净值区间：week(近一周) / month(近一月) / tmonth(近三月) / hyear(近半年) / year(近一年) / twoyear(近两年) / tyear(近三年) / fyear(近五年)。省略时只返回最新值",
      "enum": [
        "week",
        "month",
        "tmonth",
        "hyear",
        "year",
        "twoyear",
        "tyear",
        "fyear"
      ]
    },
    "thscode": {
      "type": "string",
      "description": "完整基金 thscode，必须保留市场后缀",
      "default": "025480.OF"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_performance_returns`

查询基金近一月、近三月、近半年、近一年、近三年、近五年、今年以来和成立以来收益率。收益率为百分数原值，如 8.88 表示 8.88%。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "完整基金 thscode，必须保留市场后缀",
      "default": "510300.SH"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_asset_allocation`

查询基金资产配置；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_bond_history`

查询基金历史债券持仓；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end_date": {
      "type": "string",
      "description": "报告截止日期"
    },
    "report_type": {
      "type": "string",
      "description": "报告类型"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "end_date",
    "report_type",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_bond_report_dates`

查询基金债券持仓报告日期；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "report_type": {
      "type": "string",
      "description": "报告类型"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_holdings`

查询单只基金定期披露的重仓股，返回股票 thscode、ticker、名称和占基金净值比例。重仓股为定期披露数据，不代表实时持仓。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "完整基金 thscode，必须保留市场后缀",
      "default": "025480.OF"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_industry_allocation`

查询基金行业配置；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_stock_history`

查询基金历史股票持仓；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end_date": {
      "type": "string",
      "description": "报告截止日期"
    },
    "report_type": {
      "type": "string",
      "description": "报告类型"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "end_date",
    "report_type",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_portfolio_stock_report_dates`

查询基金股票持仓报告日期；timestamp 为接口响应时间戳。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "report_type": {
      "type": "string",
      "description": "报告类型"
    },
    "thscode": {
      "type": "string",
      "description": "单只基金 thscode"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_profile_detail`

查询单只基金的基础资料，返回 thscode、ticker、基金名称、成立日期、管理人和基金经理。基金使用完整 thscode 唯一定位。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "完整基金 thscode，必须保留市场后缀，如 025480.OF / 510300.SH / 161725.SZ",
      "default": "025480.OF"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_quota_list`

QDII额度列表。按分类查询 QDII 额度下的基金列表；额度与收益数值以字符串原样返回。

```json
{
  "type": "object",
  "properties": {
    "tab": {
      "type": "string",
      "description": "分类数组 JSON 字符串，例如 [\"remen\"]。"
    },
    "buy": {
      "type": "boolean",
      "description": "可购状态过滤；省略时不向上游注入默认值。"
    }
  },
  "required": [
    "tab"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `fund_quota_summary`

QDII额度汇总。按分类查询 QDII 额度汇总；数值以字符串原样返回，不作单位换算。

```json
{
  "type": "object",
  "properties": {
    "tab": {
      "type": "string",
      "description": "分类数组 JSON 字符串，例如 [\"nazhi100\"]。"
    }
  },
  "required": [
    "tab"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_basis_historical`

期货历史基差。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "spot_indicator_id": {
      "type": "string",
      "description": "可选现货指标ID"
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_basis_main_continuous_latest`

期货主连最新基差。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_calendar_trading_schedule`

期货交易日日程。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end_date": {
      "type": "string",
      "description": "结束日期"
    },
    "start_date": {
      "type": "string",
      "description": "开始日期"
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    }
  },
  "required": [
    "end_date",
    "start_date",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_contracts_detail`

期货合约详情。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_positions_company_list`

期货公司列表。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_positions_company_variety_daily`

公司品种日持仓。

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "交易日期"
    },
    "varieties": {
      "type": "string",
      "description": "1至5个逗号分隔的期货品种代码"
    }
  },
  "required": [
    "date",
    "varieties"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_positions_contract_daily`

期货合约日持仓。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "交易日期"
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    },
    "variety": {
      "type": "string",
      "description": "大写期货品种代码"
    }
  },
  "required": [
    "date",
    "thscode",
    "variety"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_positions_contract_historical`

期货合约历史持仓。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "company": {
      "type": "string",
      "description": "期货公司名称"
    },
    "start_date": {
      "type": "string",
      "description": "开始日期"
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    },
    "variety": {
      "type": "string",
      "description": "大写期货品种代码"
    }
  },
  "required": [
    "company",
    "start_date",
    "thscode",
    "variety"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_positions_variety_daily`

期货品种日持仓。

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "交易日期"
    }
  },
  "required": [
    "date"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_prices_daily`

固定1d期货日K。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "与start成对提供的正毫秒时间戳"
    },
    "start": {
      "type": "integer",
      "description": "与end成对提供的正毫秒时间戳"
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_prices_intraday`

期货当前交易会话分时。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "session": {
      "type": "string",
      "description": "可选交易会话",
      "enum": [
        "pre_market",
        "intraday",
        "post_market"
      ]
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_varieties_list`

期货品种资料，返回统一响应信封。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `futures_warehouse_receipts_historical`

期货历史仓单。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end_date": {
      "type": "string",
      "description": "结束日期"
    },
    "start_date": {
      "type": "string",
      "description": "开始日期"
    },
    "thscode": {
      "type": "string",
      "description": "期货合约同花顺代码"
    }
  },
  "required": [
    "end_date",
    "start_date",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_announcement_search`

公告搜索。按语义检索 A股、港股、基金、ETF 的公司公告原文，覆盖定期报告、分红派息、回购增持、资产重组等类型，返回标题、摘要与公告 PDF 链接。查研报用 iwencai_report_search，查新闻用 iwencai_news_search。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言检索问句，例如「贵州茅台 分红公告」。"
    },
    "size": {
      "type": "integer",
      "description": "期望返回的条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_astock_selector`

问财选A股。用自然语言按条件筛选 A股列表（涨幅、涨停、成交量、财务条件、行业概念等组合），返回符合条件的股票及其命中指标。用于「选出哪些股票」，不是查询某只已知股票的既有数据。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_basicinfo_query`

基本资料查询。用自然语言查询证券的基本资料：公司简介、上市日期、所属行业与板块、费率等静态档案信息。查经营数据用 iwencai_business_query，查股东股本用 iwencai_management_query。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_business_query`

公司经营数据查询。用自然语言查询公司经营面数据：主营业务构成、主要客户、主要供应商、参控股公司、重大合同。查股权股本用 iwencai_management_query，查基础资料用 iwencai_basicinfo_query。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_event_query`

事件数据查询。用自然语言查询上市公司事件数据：业绩预告、增发配股、限售解禁、股权质押、机构调研、监管函等。查公司经营面（主营业务、客户、供应商、重大合同）用 iwencai_business_query。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_fund_selector`

问财选基金。用自然语言按条件筛选公募基金（收益率、规模、类型、持仓特征等），返回符合条件的基金及其命中指标。筛选场内 ETF 也可用本能力。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_hkstock_selector`

问财选港股。用自然语言按条件筛选港股标的，返回符合条件的港股及其命中指标。筛选 A股用 iwencai_astock_selector，筛选美股用 iwencai_usstock_selector。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_industry_query`

行业数据查询。用自然语言查询行业与产业链数据：行业景气、产销、价格、上下游与竞争格局。筛选板块本身用 iwencai_sector_selector；查宏观经济用 iwencai_macro_query。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_insresearch_query`

机构研究与评级查询。用自然语言查询机构研究与评级数据：券商评级、目标价、盈利预测、ESG、券商金股、一致预期。查研报原文用 iwencai_report_search。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_macro_query`

宏观数据查询。用自然语言查询宏观经济指标：GDP、CPI、PPI、利率、汇率、社融、M2、PMI、工业增加值、消费、投资、进出口。查行业面用 iwencai_industry_query。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_management_query`

公司股东股本查询。用自然语言查询股权与股本信息：股本结构、股东户数、前十大股东/流通股东、主要持有人、实际控制人、股权质押。查经营面用 iwencai_business_query。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_news_search`

新闻搜索。按语义检索财经资讯，来源含官媒、主流财经媒体、垂直行业网站与公司官网，用于了解最新财经事件、政策动态与行业进展。查公告用 iwencai_announcement_search。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言检索问句，例如「贵州茅台 分红公告」。"
    },
    "size": {
      "type": "integer",
      "description": "期望返回的条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_report_search`

研报搜索。按语义检索主流投研机构发布的研究报告，返回标题、摘要与原文链接，用于获取分析逻辑、投资评级与目标价。查公告用 iwencai_announcement_search。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言检索问句，例如「贵州茅台 分红公告」。"
    },
    "size": {
      "type": "integer",
      "description": "期望返回的条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_sector_selector`

问财选板块。用自然语言按条件筛选市场板块（行业估值、资金流向、涨跌幅、板块类型等组合），返回符合条件的板块及其命中指标。注意它返回的是板块本身，不是板块成分股。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `iwencai_usstock_selector`

问财选美股。用自然语言按条件筛选美股标的（行情、财务、行业概念、业绩预测、研报评级等组合），返回符合条件的美股及其命中指标。

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "自然语言问句，例如「今日涨幅居前的A股」。"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始。",
      "default": 1
    },
    "limit": {
      "type": "integer",
      "description": "单页条数。",
      "default": 10
    }
  },
  "required": [
    "query"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `options_contracts_detail`

期权合约详情。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "期权合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `options_prices_daily`

固定1d期权日K。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "与start成对提供的正毫秒时间戳"
    },
    "start": {
      "type": "integer",
      "description": "与end成对提供的正毫秒时间戳"
    },
    "thscode": {
      "type": "string",
      "description": "期权合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `options_prices_intraday`

期权当前交易会话分时。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "session": {
      "type": "string",
      "description": "可选交易会话",
      "enum": [
        "pre_market",
        "intraday",
        "post_market"
      ]
    },
    "thscode": {
      "type": "string",
      "description": "期权合约同花顺代码"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `options_varieties_list`

期权品种资料，返回统一响应信封。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_adjustment_factors`

单只标的的复权因子事件流（现金分红/送股/配股），调用方可据此自行推导前/后复权因子。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "from": {
      "type": "string",
      "description": "事件起始日，格式 YYYY-MM-DD；不传则不设起始边界"
    },
    "thscode": {
      "type": "string",
      "description": "单只标的 thscode，不接受逗号",
      "default": "600519.SH"
    },
    "to": {
      "type": "string",
      "description": "事件截止日，格式 YYYY-MM-DD；不传则不设截止边界"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_anomaly_analysis`

按同花顺代码批量查询当日个股异动原因。thscodes 必填，逗号分隔，大小写不敏感，去重后返回；数量不超过服务端配置上限（默认 50）。 thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。 口径：按 thscodes 批量查这些标的当日各自的异动原因。要按异动标签列出全市场触发个股，用 stock_anomaly_analysis_list。

```json
{
  "type": "object",
  "properties": {
    "thscodes": {
      "type": "string",
      "description": "逗号分隔的同花顺代码列表，格式为 6 位数字 + .SH/.SZ/.BJ，如 300033.SZ,600519.SH",
      "default": "300033.SZ,600519.SH"
    }
  },
  "required": [
    "thscodes"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_anomaly_analysis_list`

个股异动原因列表。查询当日个股异动原因，可选按异动标签过滤；不传 tag_codes 时返回全部当日记录。 口径：按异动标签（tag_codes）列出触发该标签的全市场个股，不针对具体标的；查某几只股票各自的异动原因用 stock_anomaly_analysis。

```json
{
  "type": "object",
  "properties": {
    "tag_codes": {
      "type": "string",
      "description": "异动标签，逗号分隔，多个值为 OR 关系；合法值 LIMIT_UP/LIMIT_DOWN/SHARP_RISE/SHARP_FALL/RAPID_RALLY/RAPID_DECLINE。",
      "enum": [
        "LIMIT_UP",
        "LIMIT_DOWN",
        "SHARP_RISE",
        "SHARP_FALL",
        "RAPID_RALLY",
        "RAPID_DECLINE"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_auction_benchmark`

查询短线风向标集合竞价基准数据；date/date_ms 为最终查询日期，timestamp 为接口响应时间戳。

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "查询日期，格式 yyyy-MM-dd；不传时默认取 Asia/Shanghai 当日"
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_auction_snapshot`

查询一个或多个 A 股标的的集合竞价快照；timestamp 为接口响应组装时间戳。 thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "stage": {
      "type": "string",
      "description": "集合竞价阶段，live 为实时、final 为终态",
      "default": "final",
      "enum": [
        "live",
        "final"
      ]
    },
    "thscodes": {
      "type": "string",
      "description": "A 股 thscode，多个代码使用英文逗号分隔"
    }
  },
  "required": [
    "thscodes"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_dragon_tiger_list`

查询 A 股龙虎榜。board_type 缺省 all；all 为全部榜，org 为机构榜，hot_money 为游资榜。date 可选，格式 YYYY-MM-DD；缺省由服务端取最近一个早于当前自然日的 A 股交易日。

```json
{
  "type": "object",
  "properties": {
    "board_type": {
      "type": "string",
      "description": "榜单类型：all(全部) / org(机构榜) / hot_money(游资榜)，缺省 all",
      "default": "all",
      "enum": [
        "all",
        "org",
        "hot_money"
      ]
    },
    "date": {
      "type": "string",
      "description": "目标交易日，格式 YYYY-MM-DD；缺省由服务端取最近一个早于当前自然日的 A 股交易日"
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_financials_balance`

A股整体合并资产负债表多期序列。两种取数模式（互斥）：不传start/end返回最近N期；同时传start+end返回时间区间内全部报告期。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "时间区间模式：结束毫秒戳，end >= start"
    },
    "limit": {
      "type": "integer",
      "description": "最近N期模式：默认4，范围[1,20]。与start/end互斥",
      "default": 4
    },
    "period": {
      "type": "string",
      "description": "报告期类型：annual(仅Q4报告期)、quarterly(每个季度末)",
      "default": "annual",
      "enum": [
        "annual",
        "quarterly"
      ]
    },
    "start": {
      "type": "integer",
      "description": "时间区间模式：起始毫秒戳，需与end同传。窗口不超10年"
    },
    "thscode": {
      "type": "string",
      "description": "单只标的 thscode，不接受逗号。含交易所后缀（如 600519.SH）",
      "default": "600519.SH"
    }
  },
  "required": [
    "period",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_financials_cashflow`

A股整体合并现金流量表多期序列。两种取数模式（互斥）：不传start/end返回最近N期；同时传start+end返回时间区间内全部报告期。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "时间区间模式：结束毫秒戳，end >= start"
    },
    "limit": {
      "type": "integer",
      "description": "最近N期模式：默认4，范围[1,20]。与start/end互斥",
      "default": 4
    },
    "period": {
      "type": "string",
      "description": "报告期类型：annual(仅Q4报告期)、quarterly(每个季度末)",
      "default": "annual",
      "enum": [
        "annual",
        "quarterly"
      ]
    },
    "start": {
      "type": "integer",
      "description": "时间区间模式：起始毫秒戳，需与end同传。窗口不超10年"
    },
    "thscode": {
      "type": "string",
      "description": "单只标的 thscode，不接受逗号。含交易所后缀（如 600519.SH）",
      "default": "600519.SH"
    }
  },
  "required": [
    "period",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_financials_income`

A股整体合并利润表多期序列。两种取数模式（互斥）：不传start/end返回最近N期；同时传start+end返回时间区间内全部报告期。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "时间区间模式：结束毫秒戳，end >= start"
    },
    "limit": {
      "type": "integer",
      "description": "最近N期模式：默认4，范围[1,20]。与start/end互斥",
      "default": 4
    },
    "period": {
      "type": "string",
      "description": "报告期类型：annual(仅Q4报告期)、quarterly(每个季度末)",
      "default": "annual",
      "enum": [
        "annual",
        "quarterly"
      ]
    },
    "start": {
      "type": "integer",
      "description": "时间区间模式：起始毫秒戳，需与end同传。窗口不超10年"
    },
    "thscode": {
      "type": "string",
      "description": "单只标的 thscode，不接受逗号。含交易所后缀（如 600519.SH）",
      "default": "600519.SH"
    }
  },
  "required": [
    "period",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_financials_indicators`

单只 A 股指定报告期的财务指标数据。一次返回成长、盈利、偿债、营运、现金流五类能力下的指标 ID 与本期值，调用方无需拆分为多个请求。不返回行业、评分、排名、行业均值或点评。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "report": {
      "type": "string",
      "description": "必填，报告期，格式 {yyyy}-{1|2|3|4}；1 一季报，2 中报，3 三季报，4 年报"
    },
    "thscode": {
      "type": "string",
      "description": "单只标的 thscode，含交易所后缀（如 300033.SZ）",
      "default": "300033.SZ"
    }
  },
  "required": [
    "report",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_hot_list`

返回 A 股热股榜。period 缺省为 day；day 表示 24 小时榜，hour 表示小时榜。响应包含排名、热度、排名变化、涨跌停分析和标签信息。 口径：当前时点的热股榜。历史某一天的热股榜见 stock_hot_list_history；单只股票在区间内的排名走势见 stock_hot_rank_trend。

```json
{
  "type": "object",
  "properties": {
    "period": {
      "type": "string",
      "description": "榜单周期：day(24小时榜) / hour(小时榜)，缺省 day",
      "default": "day",
      "enum": [
        "day",
        "hour"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_hot_list_history`

查询指定自然日的 A 股历史热股榜排名。date 必填，格式 YYYY-MM-DD；返回股票代码、名称、历史排名和对应日期。 口径：按自然日返回那一天的热股榜。当前时点的榜单见 stock_hot_list；单只股票在区间内的排名走势见 stock_hot_rank_trend。

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "必填，目标日期，格式 YYYY-MM-DD；需在最近一年内"
    }
  },
  "required": [
    "date"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_hot_rank_trend`

查询单只 A 股在指定日期区间内的热股榜排名走势。thscode 必填且仅支持单只；start_date/end_date 使用 YYYY-MM-DD，日期需在最近一年内且区间不超过一年。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。 口径：单只股票在日期区间内的热榜排名走势，不是榜单本身；榜单见 stock_hot_list 与 stock_hot_list_history。

```json
{
  "type": "object",
  "properties": {
    "end_date": {
      "type": "string",
      "description": "必填，结束日期，格式 YYYY-MM-DD；需在最近一年内，且不早于 start_date"
    },
    "start_date": {
      "type": "string",
      "description": "必填，起始日期，格式 YYYY-MM-DD；需在最近一年内"
    },
    "thscode": {
      "type": "string",
      "description": "单只 A 股 thscode，不接受逗号",
      "default": "300033.SZ"
    }
  },
  "required": [
    "end_date",
    "start_date",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_index_catalog`

按 tag（cn_concept / region / tszs / industry）列出 THS 指数/板块清单。单 tag 全量返回，无分页。典型用法是先用本接口拿到目标指数 thscode，再调 stock_index_constituents 取成分。

```json
{
  "type": "object",
  "properties": {
    "tag": {
      "type": "string",
      "description": "标签：cn_concept(A股概念) / region(区域指数) / tszs(特色指数) / industry(行业指数)。大小写不敏感；缺省 cn_concept",
      "default": "cn_concept",
      "enum": [
        "cn_concept",
        "region",
        "tszs",
        "industry"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_index_constituents`

按单个指数/板块 thscode 返回其当前成分股（股票）清单。支持 THS 板块（如 886042.TI）与标准指数（如沪深300 000300.SH）。单次仅支持一个指数；不接受逗号分隔。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscode": {
      "type": "string",
      "description": "指数/板块 thscode，形如 {ticker}.{suffix}。支持 THS 板块（如 886042.TI）与标准指数（如 000300.SH / 399300.SZ）。入参会被 trim().toUpperCase() 标准化；不接受逗号，单次仅支持一个指数",
      "default": "886042.TI"
    }
  },
  "required": [
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_index_kline`

单只指数的历史 K 线，仅支持 start/end 时间区间模式，窗口最长 10 年；指数无复权概念，响应 data.adjust 恒为 null。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "end": {
      "type": "integer",
      "description": "结束时间，毫秒 Unix 时间戳；end - start ≤ 10 年",
      "default": 1747641600000
    },
    "interval": {
      "type": "string",
      "description": "K 线周期：1d / 1w / 1mo",
      "default": "1d",
      "enum": [
        "1d",
        "1w",
        "1mo"
      ]
    },
    "start": {
      "type": "integer",
      "description": "起始时间，毫秒 Unix 时间戳",
      "default": 1716105600000
    },
    "thscode": {
      "type": "string",
      "description": "单只指数 thscode，不接受逗号；支持 .SH / .SZ / .TI",
      "default": "000001.SH"
    }
  },
  "required": [
    "end",
    "interval",
    "start",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_index_quote`

按 thscode 批量取指数最新行情。必传 thscodes（与 A 股版的差别，不支持全集枚举），覆盖上证/深证交易所指数（.SH/.SZ）与同花顺指数/板块/行业（.TI）。 thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。 指数池不含北证50（899050.BJ）与中证2000（932000.CSI），传入会报 Unknown thscode；中证系列已收录的写 .SH 形式（沪深300=000300.SH、中证500=000905.SH、中证1000=000852.SH）。

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "description": "与 A 股签名对齐，对本接口无效（不支持空 thscodes 全集枚举）"
    },
    "offset": {
      "type": "integer",
      "description": "同上，对本接口无效"
    },
    "thscodes": {
      "type": "string",
      "description": "逗号分隔的指数 thscode 列表（如 000001.SH,399001.SZ,886042.TI,881101.TI）",
      "default": "000001.SH,000300.SH,886042.TI"
    }
  },
  "required": [
    "thscodes"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_kline`

单只标的历史K线数据，窗口最长10年。支持前复权/后复权/不复权。 thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "adjust": {
      "type": "string",
      "description": "复权方式：none(不复权)、forward(前复权)、backward(后复权)",
      "default": "forward",
      "enum": [
        "none",
        "forward",
        "backward"
      ]
    },
    "end": {
      "type": "integer",
      "description": "必填，结束时间，毫秒 Unix 时间戳。end - start 不超过10年"
    },
    "interval": {
      "type": "string",
      "description": "K线周期：1d(日线)、1w(周线)、1mo(月线)",
      "default": "1d",
      "enum": [
        "1d",
        "1w",
        "1mo"
      ]
    },
    "offset": {
      "type": "integer",
      "description": "分页偏移",
      "default": 0
    },
    "start": {
      "type": "integer",
      "description": "必填，起始时间，毫秒 Unix 时间戳"
    },
    "thscode": {
      "type": "string",
      "description": "单只标的 thscode，不接受逗号。多标的请分多次请求",
      "default": "600519.SH"
    }
  },
  "required": [
    "end",
    "interval",
    "start",
    "thscode"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_limit_break_pool`

按交易日返回 A 股涨停炸板股票池，支持分页及按涨跌幅、开板次数、最新价、换手率或成交额排序。 口径：当日盘中曾涨停、收盘未封住（炸板）的股票池，与收盘涨停池 stock_limit_up_pool 互斥。

```json
{
  "type": "object",
  "properties": {
    "date_ms": {
      "type": "integer",
      "description": "交易日上海时区零点毫秒时间戳；省略时查询当前自然日"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始",
      "default": 1
    },
    "size": {
      "type": "integer",
      "description": "单页条数，范围 1..200",
      "default": 50
    },
    "sort_dir": {
      "type": "string",
      "description": "排序方向",
      "default": "desc",
      "enum": [
        "asc",
        "desc"
      ]
    },
    "sort_field": {
      "type": "string",
      "description": "排序字段",
      "default": "price_change_ratio_pct",
      "enum": [
        "price_change_ratio_pct",
        "open_times",
        "last_price",
        "turnover_ratio_pct",
        "turnover"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_limit_down_pool`

按交易日返回 A 股跌停股票池，支持分页及按跌停时间、最新价、涨跌幅或换手率排序。首次和最后跌停时间以上海时区 HH:mm 返回。 口径：当日收盘跌停（封板成功）的股票池，与 stock_limit_up_pool 的涨停方向相反，不与炸板池 stock_limit_break_pool 混用。

```json
{
  "type": "object",
  "properties": {
    "date_ms": {
      "type": "integer",
      "description": "交易日上海时区零点毫秒时间戳；省略时查询当前自然日"
    },
    "page": {
      "type": "integer",
      "description": "页码，从 1 开始",
      "default": 1
    },
    "size": {
      "type": "integer",
      "description": "单页条数，范围 1..200",
      "default": 50
    },
    "sort_dir": {
      "type": "string",
      "description": "排序方向",
      "default": "desc",
      "enum": [
        "asc",
        "desc"
      ]
    },
    "sort_field": {
      "type": "string",
      "description": "排序字段",
      "default": "last_limit_time",
      "enum": [
        "last_limit_time",
        "first_limit_time",
        "last_price",
        "price_change_ratio_pct",
        "turnover_ratio_pct"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_limit_up_ladder`

返回近 30 个交易日 × 6 档板数（2/3/4/5/6/7+ 连板）的矩阵，用于观察连板梯队结构与次日晋级。无入参。 口径：近 30 个交易日的连板梯队矩阵（按连板高度分组），不是单日股票池；单日涨停池见 stock_limit_up_pool，单日炸板池见 stock_limit_break_pool。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_limit_up_pool`

按交易日返回全市场涨停股清单，覆盖沪深主板、创业板、科创板和北交所。支持按日期查询、分页，以及按最新价、连板数、封单金额或涨停时间排序。 口径：当日收盘涨停（封板成功）的股票池。盘中曾涨停而收盘未封住者不在此列，见 stock_limit_break_pool；跌停方向见 stock_limit_down_pool；按连板高度分组的矩阵见 stock_limit_up_ladder。

```json
{
  "type": "object",
  "properties": {
    "date_ms": {
      "type": "integer",
      "description": "目标交易日的 Asia/Shanghai 00:00 毫秒戳；缺省取今日。非交易日返回空集（不报错）"
    },
    "page": {
      "type": "integer",
      "description": "1-based 页码",
      "default": 1
    },
    "size": {
      "type": "integer",
      "description": "单页条数，默认 50，最大 200",
      "default": 50
    },
    "sort_dir": {
      "type": "string",
      "description": "排序方向",
      "default": "desc",
      "enum": [
        "asc",
        "desc"
      ]
    },
    "sort_field": {
      "type": "string",
      "description": "排序字段白名单",
      "default": "last_price",
      "enum": [
        "last_price",
        "continue_day_cnt",
        "seal_money",
        "limit_up_time"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_quote`

A股市场行情快照。指定 thscodes 时按入参顺序批量返回；省略时遍历全量 A 股代码表并按 limit/offset 分页。 thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "integer",
      "description": "thscodes 省略时生效，单页条数",
      "default": 100
    },
    "offset": {
      "type": "integer",
      "description": "thscodes 省略时生效，分页偏移",
      "default": 0
    },
    "thscodes": {
      "type": "string",
      "description": "逗号分隔的 thscode 列表，如 600519.SH,000001.SZ。给定时忽略分页参数",
      "default": "600519.SH,000001.SZ"
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_skyrocket_list`

返回 A 股飙升热榜。period 缺省为 day；day 表示日榜，hour 表示小时榜。响应按热榜排名正序返回，包含排名、热度、排名变化、涨跌停分析和标签信息。

```json
{
  "type": "object",
  "properties": {
    "period": {
      "type": "string",
      "description": "榜单周期：day(日榜) / hour(小时榜)，缺省 day",
      "default": "day",
      "enum": [
        "day",
        "hour"
      ]
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_symbol_list`

批量获取代码表，支持按资产类别过滤。循环递增 offset 直到 item.size() < limit 即可取尽。

```json
{
  "type": "object",
  "properties": {
    "asset_type": {
      "type": "string",
      "description": "资产类别：a-share(A股股票)、a-share-index(A股指数/同花顺指数/板块)、forex(外汇)、fund-otc(场外公募基金)、fund-etf(ETF基金)、fund-lof(LOF基金)、fund-reits(公募REITs)。支持逗号分隔多值",
      "default": "a-share",
      "enum": [
        "a-share",
        "a-share-index",
        "forex",
        "fund-otc",
        "fund-etf",
        "fund-lof",
        "fund-reits"
      ]
    },
    "limit": {
      "type": "integer",
      "description": "单页条数，默认1000，最大10000",
      "default": 1000
    },
    "offset": {
      "type": "integer",
      "description": "分页偏移，默认0",
      "default": 0
    }
  }
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_symbol_search`

按关键词（thscode / ticker / 名称）跨市场标的检索与消歧，支持子串匹配。其余业务 tool 的前置步骤，先解析出 thscode 再取数。

```json
{
  "type": "object",
  "properties": {
    "asset_type": {
      "type": "string",
      "description": "资产类别过滤：a-share(A股股票)、a-share-index(A股指数/同花顺指数/板块)、forex(外汇)、fund-otc(场外公募基金)、fund-etf(ETF基金)、fund-lof(LOF基金)、fund-reits(公募REITs)。支持逗号分隔多值",
      "enum": [
        "a-share",
        "a-share-index",
        "forex",
        "fund-otc",
        "fund-etf",
        "fund-lof",
        "fund-reits"
      ]
    },
    "exchange": {
      "type": "string",
      "description": "交易所过滤：SH(沪市)、SZ(深市)、BJ(北交所)",
      "enum": [
        "SH",
        "SZ",
        "BJ"
      ]
    },
    "limit": {
      "type": "integer",
      "description": "返回上限，默认10，最大50",
      "default": 10
    },
    "q": {
      "type": "string",
      "description": "搜索关键词：完整 thscode、ticker 代码或中文/英文名称（支持子串匹配）",
      "default": "平安"
    }
  },
  "required": [
    "q"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_trading_calendar`

A股近一年交易日序列，固定窗口为[今日-1年, 今日]（Asia/Shanghai自然日），无任何请求参数。

```json
{
  "type": "object",
  "properties": {}
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

### `stock_valuation`

批量查询 A 股最新估值快照。按请求顺序返回股票代码、名称及市盈率、市净率、市销率和市现率等五项估值指标。 thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。

```json
{
  "type": "object",
  "properties": {
    "thscodes": {
      "type": "string",
      "description": "同花顺代码，英文逗号分隔，默认最多100支",
      "default": "600519.SH,000001.SZ"
    }
  },
  "required": [
    "thscodes"
  ]
}
```

来源：[`packages/stock/tool-stock/src/index.ts`](../packages/stock/tool-stock/src/index.ts)

每个已注册的股票能力都是一个原生工具。`stock-analysis` preset 是唯一挂载本包的随产品发布的组合，因此 schema 成本不会进入 `standard` 与 `ptc`。
