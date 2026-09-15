---
description: "DeepSeek Harness 股票能力 seam 的问财（iwencai）OpenAPI 网关提供方：文档检索与自然语言投研查询，携带网关的技能身份头。"
kind: "package-reference"
---

# @deepseek-ai/dsh-stock-iwencai

[English](README.md) | 中文

## 概述

用 `dsh-stock-iwencai` 把问财网关能力与行情提供方一起注册到 `ctx.stock`。它补上同花顺行情 API 没有的部分：公告、研报与新闻检索，以及基于自然语言的选股筛选与财务、宏观、股东股本、公司经营查询。网关只有一个 origin、一份凭据、两个端点；一个能力就是其中一个端点上的一个技能身份，因此新增能力是一行注册表，而不是一个新插件。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

先挂载 seam，再挂载本提供方。

```yaml
- name: '@deepseek-ai/dsh-stock'

- name: '@deepseek-ai/dsh-stock-iwencai'
  config:
    apiKeyEnv: IWENCAI_API_KEY
    maxConcurrency: 4
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | — | 字面量 API key；优先用 `apiKeyEnv`，避免密钥进入配置文件 |
| `apiKeyEnv` | `IWENCAI_API_KEY` | 每次调用解析的凭据引用 |
| `baseUrl` | `https://openapi.iwencai.com` | 网关 origin；必须是绝对的 HTTP(S) URL |
| `timeoutMs` | `30000` | 单次尝试的截止时间 |
| `maxAttempts` | `3` | 一次调用的总尝试次数，含首次 |
| `maxConcurrency` | `4` | 并发请求上限 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-stock-iwencai)是每个可接受字段及其 JSDoc 的完整来源。

### 已注册能力

| 能力 id | 工具 | 网关 |
|---|---|---|
| `iwencai.search.announcement` | `iwencai_announcement_search` | search，`announcement` 频道 |
| `iwencai.search.report` | `iwencai_report_search` | search，`report` 频道 |
| `iwencai.search.news` | `iwencai_news_search` | search，`news` 频道 |
| `iwencai.research.astock-selector` | `iwencai_astock_selector` | query |
| `iwencai.research.fund-selector` | `iwencai_fund_selector` | query |
| `iwencai.research.hkstock-selector` | `iwencai_hkstock_selector` | query |
| `iwencai.research.usstock-selector` | `iwencai_usstock_selector` | query |
| `iwencai.research.sector-selector` | `iwencai_sector_selector` | query |
| `iwencai.research.event-query` | `iwencai_event_query` | query |
| `iwencai.research.business-query` | `iwencai_business_query` | query |
| `iwencai.research.management-query` | `iwencai_management_query` | query |
| `iwencai.research.macro-query` | `iwencai_macro_query` | query |
| `iwencai.research.industry-query` | `iwencai_industry_query` | query |
| `iwencai.research.insresearch-query` | `iwencai_insresearch_query` | query |
| `iwencai.research.basicinfo-query` | `iwencai_basicinfo_query` | query |

<a id="understand-the-implementation"></a>
## 理解实现

每个能力的身份与请求族来自生成的注册表；传输层补上网关的身份头。

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件：`name`、`inject`、`Config`、`apply`、提供方与凭据链 |
| [`src/http.ts`](src/http.ts) | 传输：身份头、并发槽、截止时间、有界重试 |
| [`src/envelope.ts`](src/envelope.ts) | HTTP 与 `status_code` 到 seam 失败分类的映射 |
| [`src/normalize.ts`](src/normalize.ts) | 从两种响应结构中取行与总数 |
| [`src/catalog/generated.ts`](src/catalog/generated.ts) | 生成的注册表记录与网关身份表 |
| — | No runtime invariant companion is published; the provider holds no durable state beyond a concurrency counter, the seam enforces result bounds, and nothing here publishes an observation stream. |

### 新增能力

`pnpm run gen-iwencai-catalog` 读取 `contracts/iwencai-skills.snapshot.json` 与生成器里策展的命名，写出注册表记录与身份表。`pnpm run verify-iwencai-catalog` 离线重新派生它们。扩展覆盖面是「快照条目 + 一条策展选择」，从来不是新传输层。

### 身份门禁

网关会拒绝**不带 `X-Claw-Skill-Id` 头**的请求：实测它返回 `401` 与「当前 Skill 版本过低」，无论凭据是否有效。同样实测：该头的**取值不被校验**——版本与记录值不同、甚至商店里不存在的技能名，都能成功。因此本提供方发送与能力匹配的身份（这是文档化的契约），并把它保留为生成常量，这样厂商一旦收严，是一次重新生成而不是重新设计。

<a id="further-exploration"></a>
## 进一步探索

- [股票行情数据子系统](../../../docs/subsystems/stock.zh.md) — 本提供方注册进的 seam：注册表词汇、结果信封、提供方路由与错误分类。
- [dsh-stock-hithink](../stock-hithink/README.zh.md) — 兄弟提供方，以及注册表记录的厂商差异字段。

<a id="model-experience"></a>
## 模型体验

### Rows and failures rendered by `dsh-tool-stock`

#### What the model sees

This provider contributes no prompt text and no tool schema; `dsh-tool-stock` owns the model-facing text. What the model reads from this provider is data-dependent. A document search returns the gateway's own fields — `title`, `summary`, `url`, `publish_date` — and a natural-language query returns the columns the gateway's parser chose for that query, which are Chinese and carry the reporting date inside the name, for example `涨停[20260915]` or `单位净值增长率[20250916-20260915]`. The batch fact `total` accompanies the rows only when the gateway reported one. A failure reaches the model as the seam's error code carrying the gateway's own message, never as a bare HTTP status.

#### Token effect

Data-dependent, and bounded by consumers rather than here: this provider caps neither row count nor rendered bytes. The seam's `maxRows` bound and the consumer's render budget are the only limits between a gateway response and a model request.

#### KV Cache effect

No direct invalidation; the provider contributes no request-prefix tokens, so mounting it changes a prefix only through the tool schemas `dsh-tool-stock` registers for its capabilities.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些是本包当前的约束，不是待清理项。

- **发送的版本不是商店里的版本** — 已提交快照记录了每个技能的商店 `version`，但身份表 pin 的是厂商自家技能脚本发送的值，两者不同（三个 search 技能记录为 `1.0.1`、发送 `1.0.0`）。实测两者都被接受；采用脚本值，因为它就是厂商客户端发送的东西。
- **结果列由网关而非本提供方决定** — 自然语言查询返回的中文列名里嵌了报告期，因此按名字读取列的消费者与厂商的解析器耦合。需要稳定列集合的工作流必须固定自己发出的查询，并校验收到的列。
- **文档检索没有续页** — 网关没有为 search 端点文档化任何翻页参数，因此这三个能力注册为 `paging: 'none'`，即使响应报告了更大的 total，也只返回请求的 `size` 条。
- **厂商的命中标的数没有被透出** — 自然语言查询同时报告 `row_count`（可返回的行数）与 `code_count`（命中的标的数），seam 的 `total` 携带 `row_count`，因为那才是分页调用方需要的量。想要「命中了多少个标的」的消费者必须从收到的行里自行判断。
- **网关的业务码未被分类** — 只有 `0` 被文档化为成功，因此任何其它 `status_code` 都映射到 seam 的上游失败并附上厂商报文，而不是映射到一张并不存在的码表。
- **请求消耗每日额度** — 厂商把 `429` 文档化为「当日请求限制」而非突发限流，因此耗尽尝试的重试会被如实上报，而不会无限重试。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：未决问题与未定方向。它明确不具权威性——已发布行为、限制与理由位于上方各节与所链接的 Agent Note 中。

#### 未来：策展命名查询

网关按 query 内容路由，而不是按技能身份，因此固定工作流今天就可以写死一个查询串，并接收解析器产出的任意列。把高频查询提升为带校验列集合的命名能力，应当在某个功能真正依赖它时再做，而不是提前做。

</details>
