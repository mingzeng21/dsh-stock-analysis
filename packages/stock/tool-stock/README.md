---
description: "The model-facing stock-market data tools over ctx.stock: the generated vendor registry exposed as one tool per capability, with disambiguating descriptions and a bounded rendered result."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-stock

English | [中文](README.zh.md)

## Summary

`dsh-tool-stock` gives an agent the vendor's published stock-market data capabilities as model-facing tools. One tool is registered per record in the generated vendor registry and named by that record, so the catalog follows the registry, never a live provider. Each tool forwards its arguments to `ctx.stock` and returns a canonical value: the bounded rows plus the batch facts (`asOf`, `truncated`, `total`, `next`) a model needs to read them correctly. Parameter validation, defaults, row bounds, provider selection, and every vendor error code belong to the seam, so a failing call reaches the model as the seam's own error result.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount the stock seam and one provider in the host composition, then this package in the agent plane. The tools become visible wherever this package is mounted, whichever preset that is.

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

Config is two budgets:

| Field | Default | Meaning |
|---|---|---|
| `renderMaxChars` | `20000` | Character budget for one rendered result. The batch-fact header is always kept. |
| `timeoutMs` | `30000` | Cooperative timeout budget attached to every tool, enforced by the tool-call timeout policy. |

Both must be positive integers; a violation fails plugin activation.

Enablement is composition, not configuration: this package registers the whole registry or nothing. A deployment that wants a smaller visible set gives it a narrower preset or narrows the scope with `ctx.tools.restrict()` rather than trimming the catalog here.

<a id="understand-the-implementation"></a>
## Understand the implementation

The generated registry is the single source of truth. `@deepseek-ai/dsh-stock-hithink` publishes `STOCK_ENDPOINTS`, and this package reads it once at activation; it never holds a second copy of the vendor contract.

| File | Responsibility |
|---|---|
| `src/index.ts` | The plugin: `name`, `inject`, `Config`, `apply`. Resolves the budgets and registers the registry. |
| `src/register.ts` | One `defineTool` per record. The executor forwards arguments to `ctx.stock.call` and projects the result. |
| `src/schema.ts` | Registry parameters to `ParameterSchemaSpec`. |
| `src/describe.ts` | Registry `title`/`summary` to a model-facing description. |
| `src/value.ts` | The canonical value contract and its projection from a seam result. |
| `src/render.ts` | The canonical value to the bounded model-facing text. |

Two translations in `src/schema.ts` are deliberate. The tool DSL expresses only type, `enum`, `const`, and `required`, so the vendor's numeric and format bounds stay with the seam's parameter validator instead of being approximated in the schema. And the vendor encodes structured arguments as JSON inside one query value, so `object` and `array` parameters are declared to the model as strings.

<a id="further-exploration"></a>
## Further Exploration

- [Capability seams](../../../docs/architecture.md#capability-seams) — the Service Definition / Provider / Consumer split this package participates in.
- `@deepseek-ai/dsh-stock` — the seam this package consumes: the provider registry, parameter validation, row bounds, and symbol resolution.
- [Tool authoring reference](../../../docs/cookbook/adding-a-tool.md) — the contracts every model-facing tool satisfies.

<a id="model-experience"></a>
## Model Experience

### Tool schemas

#### What the model sees

The generated [`@deepseek-ai/dsh-tool-stock` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-stock): one definition per registry record, named by the record's `tool` field (for example `stock_quote`, `stock_limit_up_pool`, `fund_nav`), described in Chinese, and parameterized by the record's own parameters — for the registry as generated, 82 definitions and 31,446 characters of JSON, of which 1,973 are names, 7,775 descriptions, and 18,171 parameter schemas. Names, descriptions, and parameter schemas are all functions of the registry, so a reader of the catalog knows the whole surface.

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

## Known Limitations and Deferred Work

These are current constraints of the package, not cleanup items.

- **The whole registry is registered or none of it** — activation registers one tool per registry record with no per-tool opt-in, so a deployment that wants a smaller catalog narrows the preset or the scope instead. Trimming the catalog inside this package would put the model-visible surface and the registry out of step.
- **The catalog is resident in every request** — 82 definitions and 31,446 characters of JSON for the registry as generated. Mounting this package is the decision to pay that cost; there is no lazy or searched tool surface in the harness to defer it to.
- **Range and format bounds are absent from the schema** — the tool DSL carries no `minimum`, `maximum`, `pattern`, or length vocabulary, so a bound such as the ten-year history window or a positive page size is discovered from the seam's rejection rather than from the schema. Moving a bound into the schema needs DSL support that does not exist yet.
- **Structured arguments are declared as strings** — `object` and `array` parameters are published to the model as JSON-in-a-string because that is how the vendor encodes them. The seam parses and type-checks them; the model gets no structural validation of the JSON it writes.
- **Rows keep the vendor's field names** — there is no canonical per-capability DTO, deliberately: 82 capabilities return 82 row layouts and inventing types without a consumer would fix the wrong model. A consumer that needs a stable field set must project it; `@deepseek-ai/dsh-stock` owns that decision.
- **The rendered result drops rows before the canonical value does** — past `renderMaxChars` the model sees a counted preview. Only the canonical value, which `run_code` programs read, keeps the full page.
- **There is no Loader-level composition test in this package** — a real Loader/app boot of the `stock-analysis` preset is what would prove the mounted catalog end to end, and it belongs to the preset's own coverage rather than here. This package's tests exercise the real `ToolRuntime` and the real `ctx.stock` with a fixture provider through `ctx.tools.execute`.
- **No invariant companion is published because this package owns no runtime relation of its own** — it contributes tool definitions to `ctx.tools` and forwards every call to `ctx.stock`, so the relations worth checking (registry agreement, parameter validation, row bounds, provider selection) belong to the seam and the provider that own them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: per-family tool enablement

A deployment that wants a narrower catalog has to give the session a narrower preset today. A config field that selects universes would put a partial catalog behind one mount, which is worth doing only when a second real deployment asks for it.

</details>
