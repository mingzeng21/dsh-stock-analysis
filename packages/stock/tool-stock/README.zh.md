---
description: "基于 ctx.stock 的面向模型股票行情数据工具：把生成的厂商注册表按能力逐个暴露为工具，配以可消歧的描述与有界渲染结果。"
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-stock

[English](README.md) | 中文

## 概述

`dsh-tool-stock` 把厂商已发布的股票行情数据能力作为面向模型的工具交给 agent。生成注册表中的每条记录注册一个工具，并以该记录命名，因此目录跟随注册表，而从不跟随某个在线提供方。每个工具把参数转发给 `ctx.stock`，并返回规范值：有界的行，加上模型正确解读它们所需的批次事实（`asOf`、`truncated`、`total`、`next`）。参数校验、默认值、行数上限、提供方选择与全部厂商错误码都归 seam，因此失败的调用以 seam 自身的错误结果到达模型。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在 host 组合中挂载股票 seam 与一个提供方，再在 agent 面挂载本包。工具在本包被挂载的地方可见，无论那是哪个 preset。

```yaml
# Host composition.
- id: stock
  name: '@deepseek-ai/dsh-stock'
- id: stock-hithink
  name: '@deepseek-ai/dsh-stock-hithink'
  config:
    apiKeyEnv: HITHINK_FINANCE_API_KEY

# Agent composition.
- id: tool-stock
  name: '@deepseek-ai/dsh-tool-stock'
```

配置是两项预算：

| 字段 | 默认值 | 含义 |
|---|---|---|
| `renderMaxChars` | `20000` | 一次渲染结果的字符预算。批次事实表头始终保留。 |
| `timeoutMs` | `30000` | 附加到每个工具的协作式超时预算，由工具调用超时策略强制执行。 |

两者都必须是正整数；违反会让插件激活失败。

启用与否属于组合而非配置：本包要么注册整个注册表，要么什么都不注册。想要更小可见集的部署应给它一个更窄的 preset，或用 `ctx.tools.restrict()` 收窄作用域，而不是在这里裁剪目录。

<a id="understand-the-implementation"></a>
## 理解实现

生成的注册表是唯一事实来源。`@deepseek-ai/dsh-stock-hithink` 发布 `STOCK_ENDPOINTS`，本包在激活时读取一次；它从不持有厂商契约的第二份副本。

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 插件：`name`、`inject`、`Config`、`apply`。解析预算并注册注册表。 |
| `src/register.ts` | 每条记录一个 `defineTool`。执行体把参数转发给 `ctx.stock.call` 并投影结果。 |
| `src/schema.ts` | 注册表参数到 `ParameterSchemaSpec`。 |
| `src/describe.ts` | 注册表 `title`/`summary` 到面向模型的描述。 |
| `src/value.ts` | 规范值契约及其从 seam 结果的投影。 |
| `src/render.ts` | 规范值到有界的面向模型文本。 |

`src/schema.ts` 里有两处翻译是有意为之。工具 DSL 只表达类型、`enum`、`const` 与 `required`，因此厂商的数值与格式边界留在 seam 的参数校验器里，而不是在 schema 里近似表达。另外厂商把结构化参数编码为一个 query 值里的 JSON，因此 `object` 与 `array` 参数对模型声明为字符串。

<a id="further-exploration"></a>
## 进一步探索

- [能力 seam](../../../docs/architecture.zh.md#capability-seams) — 本包参与的 Service Definition / Provider / Consumer 拆分。
- `@deepseek-ai/dsh-stock` — 本包消费的 seam：提供方注册表、参数校验、行数上限与标的消歧。
- [工具编写参考](../../../docs/cookbook/adding-a-tool.zh.md) — 每个面向模型的工具都满足的契约。

<a id="model-experience"></a>
## 模型体验

### Tool schemas

#### What the model sees

The generated [`@deepseek-ai/dsh-tool-stock` schemas](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-stock): one definition per registry record, named by the record's `tool` field (for example `stock_quote`, `stock_limit_up_pool`, `fund_nav`), described in Chinese, and parameterized by the record's own parameters — for the registry as generated, 82 definitions and 31,446 characters of JSON, of which 1,973 are names, 7,775 descriptions, and 18,171 parameter schemas. Names, descriptions, and parameter schemas are all functions of the registry, so a reader of the catalog knows the whole surface.

#### Token effect

Fixed per request while the package is mounted. This is the cost the tool suite exists to make explicit: the entire catalog is resident in every request of a session composed with it, and the session pays it whether or not the model calls a stock tool. The budget is therefore a preset decision, not a per-tool one.

#### KV Cache effect

Prefix-stable while the mounted registry and the plugin lifecycle are unchanged. Regenerating the vendor registry, upgrading this package or the provider, or mounting this package into a different preset may invalidate reuse from the first changed schema token.

### Tool descriptions

#### What the model sees

Each description composes the registry's `title` and `summary` into one sentence — the title is dropped when the summary already opens with it — then appends the clauses in the next two entries, and rewrites every vendor MCP tool name that appears in the vendor's own prose to the name this catalog registers, because a model that sees only this catalog cannot call `get_a_share_*`.

#### Token effect

Included in the fixed schema cost above.

#### KV Cache effect

Prefix-stable with the schemas above; a description change is a registry or package change.

### Instrument-code hints

#### What the model sees

Every capability that takes an instrument code carries the matching rule verbatim, so a bare code is answered with the resolver rather than by an upstream rejection.

##### Rule for a single code

```markdown
thscode 必须写完整代码（如 600519.SH），不接受裸代码；不确定时先用 stock_symbol_search 解析。
```

##### Rule for a comma-separated list

```markdown
thscodes 是逗号分隔的完整代码（如 600519.SH,000001.SZ）；不确定时先用 stock_symbol_search 解析。
```

#### Token effect

The rule is repeated on each of the 48 capabilities that take an instrument code; that repetition is deliberate, because a bare code is the most likely call-shape failure.

#### KV Cache effect

Prefix-stable with the schemas above; a description change is a registry or package change.

### Near-synonym family clauses

#### What the model sees

Capabilities whose family members are near-synonyms carry a `口径：` clause naming the sibling that answers the neighbouring question. The closing-limit family is the clearest case: `stock_limit_up_pool` points at `stock_limit_break_pool` for the stocks that opened again, at `stock_limit_down_pool` for the other direction, and at `stock_limit_up_ladder` for the multi-day matrix, and those three carry the mirror clause. The anomaly-analysis and hot-list families carry the same kind of clause.

##### Clause on stock_limit_up_pool

```markdown
口径：当日收盘涨停（封板成功）的股票池。盘中曾涨停而收盘未封住者不在此列，见 stock_limit_break_pool；跌停方向见 stock_limit_down_pool；按连板高度分组的矩阵见 stock_limit_up_ladder。
```

#### Token effect

Included in the fixed schema cost above; only the members of a family a reader can confuse carry a clause.

#### KV Cache effect

Prefix-stable with the schemas above; a description change is a registry or package change.

### Result rendering

#### What the model sees

Every result is the same shape: a leading `<capability id>: <count> 行`, then any batch facts the seam reported — `上游总行数: <total>`, `asOf: <yyyy-MM-dd HH:mm:ss> +08:00`, `已截断: 上游仍有数据，用 next 参数续取`, `next: <JSON>` — then one line per row as `key=value` pairs in vendor field order, where nested values render as JSON, `null` and absent values render as `null`, and a row that is not a record renders as a single cell. A capability that returned nothing adds `（本次返回 0 行）`; when the configured budget excludes rows the result ends with `…（仅显示 <shown>/<total> 行：渲染上限 <budget> 字符）` rather than shortening a row.

#### Token effect

Data-dependent, bounded by `renderMaxChars` plus the batch-fact header, which is always emitted. The canonical value is unaffected: it keeps every row the seam returned, so a `run_code` program reads the complete page while the model reads the preview.

#### KV Cache effect

Append-only; a result follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Argument and upstream failures

#### What the model sees

The tool body performs no validation of its own. An argument the registry does not declare, a value of the wrong type or outside a declared enum, a missing required argument, a capability the vendor does not open to external access, and every vendor envelope error arrive as the seam's own message — for example `unknown parameter "bogus"` or `stock capability "a-share.capital-flow.snapshot" is published by the vendor but not open to external access`.

#### Token effect

Only the failing call adds these retained tokens.

#### KV Cache effect

Append-only; the error follows the reusable request prefix and does not invalidate existing KV-cache entries.

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

这些是本包当前的约束，不是待清理项。

- **要么注册整个注册表，要么什么都不注册** — 激活时按注册表记录逐条注册，没有逐工具开关，因此想要更小目录的部署应改为收窄 preset 或作用域。在本包内裁剪目录会让模型可见面与注册表脱节。
- **目录常驻每一次请求** — 就当前生成的注册表而言是 82 个定义与 31,446 字符 JSON。挂载本包就是决定支付这笔成本；harness 中不存在可推迟它的惰性工具面或检索式工具面。
- **schema 中没有范围与格式边界** — 工具 DSL 不携带 `minimum`、`maximum`、`pattern` 或长度词汇，因此像十年历史窗口或正数页大小这样的边界，是从 seam 的拒绝而不是从 schema 中得知的。把边界移进 schema 需要尚不存在的 DSL 支持。
- **结构化参数声明为字符串** — `object` 与 `array` 参数以「字符串里的 JSON」形式发布给模型，因为厂商就是这样编码的。seam 会解析并做类型检查；模型写出的 JSON 得不到结构性校验。
- **行保留厂商字段名** — 有意不提供逐能力的规范 DTO：82 个能力返回 82 种行布局，在没有消费者的情况下发明类型只会固化错误的模型。需要稳定字段集的消费者必须自行投影；该决定归 `@deepseek-ai/dsh-stock`。
- **渲染结果比规范值更早丢弃行** — 超过 `renderMaxChars` 后模型看到的是带计数的预览。只有 `run_code` 程序读取的规范值保留完整的一页。
- **本包内没有 Loader 级组合测试** — 能端到端证明已挂载目录的是 `stock-analysis` preset 的真实 Loader/app 启动，那属于该 preset 自身的覆盖而非本包。本包的测试通过 `ctx.tools.execute` 用真实的 `ToolRuntime`、真实的 `ctx.stock` 与 fixture 提供方覆盖。
- **No invariant companion is published because this package owns no runtime relation of its own** — it contributes tool definitions to `ctx.tools` and forwards every call to `ctx.stock`, so the relations worth checking (registry agreement, parameter validation, row bounds, provider selection) belong to the seam and the provider that own them.

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决问题与未定方向。它明确不具权威性——已发布行为、限制与理由位于上方各节与所链接的 Agent Note 中。

#### 未来：按能力族启用工具

今天想要更小目录的部署只能给会话一个更窄的 preset。一个选择标的宇宙的配置字段会让「部分目录」藏在一次挂载之后，只有在第二个真实部署提出需求时才值得做。

</details>
