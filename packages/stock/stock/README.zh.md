---
description: "DeepSeek Harness 的抽象股票行情数据能力 seam（ctx.stock）——提供方注册表、接口词汇、有界结果、标的消歧与 StockError 分类。"
kind: "package-reference"
---

# @deepseek-ai/dsh-stock

[English](README.md) | 中文

## 概述

用 `dsh-stock` 为 harness 提供一种与提供方无关的行情数据读取方式。它拥有接口词汇、参数校验、结果边界、标的消歧与错误分类；提供方负责传输与线上格式归一化，消费者则暴露模型或功能插件所需要的内容。把它与一个提供方一起挂载；没有提供方时，每次调用都以 `STOCK_PROVIDER_UNAVAILABLE` 失败，而不是悄悄回落到某个默认后端。

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

把服务挂到 host 面，并在它旁边注册一个提供方。

```yaml
- name: '@deepseek-ai/dsh-stock'

- name: '@deepseek-ai/dsh-stock-hithink'
  config:
    apiKeyEnv: HITHINK_FINANCE_API_KEY
    maxConcurrency: 4
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | — | 显式指定提供方 id；省略时选择唯一可用的已注册提供方 |
| `maxRows` | `500` | 一次调用返回的行数上限，超出时结果被标记为截断 |
| `symbolCacheTtlMs` | `300000` | 一次标的查询结果的缓存存活时间 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-stock)是每个可接受字段及其 JSDoc 的完整来源。

### 调用方做什么

`ctx.stock.catalog()` 列出能力，`ctx.stock.call(id, params)` 执行其中一个，`ctx.stock.resolveSymbols(text)` 把公司名或裸代码变成完整 thscode。功能插件以程序方式组合它们；面向模型的消费者把每个能力变成一个工具。

<a id="understand-the-implementation"></a>
## 理解实现

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`StockRuntime` 服务、提供方选择、目录过滤、结果上限与标的消歧 |
| [`src/registry.ts`](src/registry.ts) | 词汇：`StockEndpoint`、`StockParam`，以及记录厂商差异的字段（`availability`、`paging`、`window`、`dateEncoding`） |
| [`src/params.ts`](src/params.ts) | `resolveParams`：唯一把不可信参数变成线上参数的环节 |
| [`src/types.ts`](src/types.ts) | 提供方契约、`StockResult` 与标的匹配词汇 |
| [`src/error.ts`](src/error.ts) | 稳定 code 分类；调用方按 code 分支，绝不解析 message |
| — | No runtime invariant companion is published; the provider map and symbol cache are private, selection and result caps are enforced on every call, and the seam publishes no independent registry or observation stream. |

提供方选择在每次调用时解析，且从不依赖注册顺序：已配置的 id 必须已注册且可用；未配置时要求恰好一个可用提供方。

<a id="further-exploration"></a>
## 进一步探索

- [股票行情数据子系统](../../../docs/subsystems/stock.zh.md) — 接口注册表、`StockResult`、提供方选择与标的消歧。
- [dsh-stock-hithink](../stock-hithink/README.zh.md) — 厂商提供方、其重试与并发策略，以及它归一化的响应信封。

<a id="model-experience"></a>
## 模型体验

Indirectly, through `dsh-tool-stock`, which renders this seam's normalized rows to the model while the service itself contributes no prompt section and no tool schema.

#### KV Cache effect

No direct invalidation; the named consumer owns the request-prefix contribution that a mounted toolset adds.

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了该服务何时自身不完整。它们是当前的包约束。

- **行保留厂商字段名** — 82 个能力返回 82 种行结构，且目前没有消费者读取归一化的领域对象，因此暂时不存在规范的 `Quote`/`Bar` 类型。新增它们是一次有明确消费者的、有意的后续变更。
- **不缓存数据响应** — 只有标的查询被缓存。同一轮中重复的行情读取会产生重复的厂商请求，由提供方的并发闸而不是缓存来约束。
- **不做跨接口拼装** — 行情不携带中文名；`resolveSymbols` 单独返回名称，同时需要两者的调用方要发起两次调用。
- **历史窗口边界属于厂商而非本 seam** — `window` 记录厂商对每个端点的限制；seam 只强制自己的 `maxRows`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本开发者说明是维护者的工作上下文：未决问题与未定方向。它明确不具权威性——已发布行为、限制与理由位于上方各节与所链接的 Agent Note 中。

#### 未来：规范领域类型

行有意保留厂商字段名。第一个需要稳定 `Quote` 或 `Bar` 的功能插件应当在此引入它，并以该消费者作为依据，而不是现在预先设计。

</details>
