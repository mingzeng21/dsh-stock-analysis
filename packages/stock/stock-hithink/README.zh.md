---
description: "ctx.stock 的同花顺 REST 后端：部署方如何用已解析的 API Key、有界的传输策略，把行情数据能力接缝指向 fuyao.aicubes.cn，并保留厂商自身的行字段名。"
kind: "package-reference"
---

# @deepseek-ai/dsh-stock-hithink

[English](README.md) | 中文

## 概述

有了 `dsh-stock-hithink`，harness 可以通过行情数据服务（`ctx.stock`）查询同花顺金融数据 REST API，获得归一化后的行与批次事实。当组合需要用已解析的 `X-api-key` 凭据访问 `fuyao.aicubes.cn`、为单次尝试设置截止时间、限制并发、只对限流与两个瞬时上游错误码重试，并把失败映射到接缝的错误分类时，选择本提供方。行保留厂商自身的字段名。面向模型的工具位于 `dsh-tool-stock`，由它渲染本提供方返回的内容。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已加载行情数据服务的组合中挂载本提供方。它以 `hithink` 提供方身份注册，因此当它是唯一可用提供方时 `ctx.stock` 会自动解析到它；部署也可以用 `provider: hithink` 固定。

### 何时选择

当需要用一份已解析凭据访问同花顺 REST API，并附带单次尝试截止时间、并发上限，以及拒绝放大硬失败的重复策略时，选择本提供方。它使用厂商公布的响应信封，并把厂商的业务码映射到接缝的失败分类，因此消费者分支在 `STOCK_*` 码上，而不是在数字厂商码上。

### 最小配置

加载行情数据服务与提供方。每个字段都有默认值；非法的取值上界会在插件构造时失败，而不是产出一个限制荒谬的提供方。

```yaml
- name: '@deepseek-ai/dsh-stock'
- name: '@deepseek-ai/dsh-stock-hithink'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKey` | — | 字面量 API Key。优先使用 `apiKeyEnv`，避免密钥进入配置文件。 |
| `apiKeyEnv` | `HITHINK_FINANCE_API_KEY` | 每次调用经 `ctx.credentials` 解析的凭据引用，缺失时回退到启动环境。 |
| `baseUrl` | `https://fuyao.aicubes.cn` | 厂商源站。必须是绝对的 HTTP(S) URL。 |
| `timeoutMs` | `30000` | 单次尝试的截止时间，不是整个重复序列的。 |
| `maxAttempts` | `3` | 一次调用的总尝试次数，含第一次。 |
| `maxConcurrency` | `4` | 本提供方同时保持的最大在途请求数。 |

### 能力覆盖

本提供方提供生成注册表中的 82 个能力。该注册表由厂商的 MCP 工具 schema、其 CLI 能力表与文档化的工具到路径映射拼接而成。`ctx.stock.catalog()` 读取该注册表；`ctx.stock.call()` 在发出任何请求之前用同一条记录校验参数。

<a id="understand-the-implementation"></a>
## 理解实现

一次调用先解析 API Key，再等待并发槽位，然后进入尝试循环。每次尝试都在自己的截止时间下发起抓取，并使用 `redirect: 'error'`，因为请求携带凭据，重定向绝不能转发它。响应按 `{ code, message, request_id, data }` 读取；限流也可能以 HTTP 429 加一个缩短的响应体到达，读取器容忍这种形态。

只有 HTTP 429 与业务码 `4001`、`5002`、`5003` 会被重试，采用带抖动的指数退避。以裸 HTTP 失败上报的厂商故障不会被重试，因此硬失败会到达调用方而不是被放大。厂商未文档化的 `Retry-After` 头在可解析时会被尊重。

归一化保留厂商的字段名，只归一化信封：行取自 `data.item`，`asOf` 取自 `data.timestamp`，`total` 取自 `data.total`。没有 `item` 成员的记录会被当作一行，而不是当作没有数据。`data` 中的值原样通过，因此未披露的财务值仍是 `null`，不会变成 0。

分页能力上的满页会转换成 `next`：即请求自身的参数、只把页码位置前移，因此调用方重新发起同一查询。厂商报告总数时由总数判定是否还有更多行；否则满页就是触发条件，更短的页面不产生任何续页。这正是"批量选择参数存在时分页参数被忽略"的能力从不声称还有下一页的原因——它返回的行数少于页大小。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：凭据解析链、`Config` schema，以及注册到 `ctx.stock` 的 `HithinkProvider` |
| [`src/http.ts`](src/http.ts) | 传输层：并发闸、尝试循环、单次尝试截止时间、拒绝重定向与退避计划 |
| [`src/envelope.ts`](src/envelope.ts) | 厂商信封读取，以及厂商业务码到接缝错误码的映射 |
| [`src/normalize.ts`](src/normalize.ts) | 从 `data` 抽取行，以及随行一起产生的批次事实 |
| [`src/query.ts`](src/query.ts) | 已校验线上参数的查询字符串序列化 |
| [`src/catalog/generated.ts`](src/catalog/generated.ts) | 本提供方所服务的生成能力注册表 |
| — | 不发布运行时不变式伴随包；本提供方注册到 `ctx.stock`，并在每次调用时执行其传输策略，因此它不拥有任何可能产生分歧的注册表或生命周期观察流。 |

<a id="further-exploration"></a>
## 进一步探索

当包级契约不够用时，阅读这些页面。

- [行情数据子系统](../../../docs/subsystems/stock.zh.md) — 接缝的接口注册表、失败分类与结果词汇。
- [dsh-tool-stock](../tool-stock/README.zh.md) — 渲染本提供方行的模型可见工具。
- [契约快照](contracts/README.zh.md) — 生成注册表的输入来自哪里，以及如何刷新。

<a id="model-experience"></a>
## 模型体验

### 由 `dsh-tool-stock` 渲染的行与失败

#### 模型看到什么

本提供方不贡献任何提示文本与工具 schema；模型可见文本由 `dsh-tool-stock` 拥有。模型从本提供方读到的是数据相关的：每个能力的行完全按 `data.item` 提供的样子保留厂商字段名，包括 `thscode`、`last_price` 与 `price_change_ratio_pct`，未披露值保留厂商的 `null`。批次事实 `total` 与 `asOf` 只在厂商上报时随行一起出现。失败以接缝的错误码到达模型，绝不会是厂商的数字码。

#### Token 影响

数据相关，且由消费者而非此处限制：本提供方既不限制行数也不限制渲染字节。接缝的 `maxRows` 上界与结果溢写策略是厂商响应与模型请求之间仅有的限制。

#### KV Cache 影响

无直接失效：本提供方不注册提示段落与工具 schema，因此无法改变可复用的请求前缀。`baseUrl` 或凭据变化只改变响应数据。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **行不被重命名、单位不被换算** — 提供方按公布内容上报厂商字段，因此 `last_price` 以元为单位，`price_change_ratio_pct` 是百分数，财务指标的 `value` 可能以字符串到达；需要规范形状的消费者自行负责该映射。
- **重试只覆盖限流与两个瞬时错误码** — 连接被拒、超时，或没有信封的 HTTP 5xx 会立即失败，因此必须挺过网络抖动的调用方自行负责重试。
- **没有离线或缓存模式** — 每次调用都会访问厂商；需要本地历史数据的部署必须再加一个提供方。
- **`Retry-After` 处理是尽力而为** — 厂商未文档化该头，因此不可解析的值回退到本地退避计划。
- **凭据按调用解析** — 有意不做已认证响应缓存，因此轮换后的密钥在下一次调用即生效。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 —— 点击展开</summary>

`src/catalog/generated.ts` 下的能力注册表是签入的生成产物；`pnpm run gen-stock-catalog` 从 `contracts/` 重新生成它，`pnpm run verify-stock-catalog` 在不访问网络的情况下重新生成并比对，这就是新鲜度门禁。绝不要手工编辑生成的文件。

厂商不发布 OpenAPI 文档，因此生成器拼接三个来源：六个 MCP 服务的 `tools/list` schema、npm CLI 包的 `schemas/capabilities.json`，以及文档化的工具到路径映射表。`contracts/README.md` 记录了每个来源及其版本。

传输层拒绝重定向，因为每个请求都携带 `X-api-key`。该行为由一个测试钉住：它启动第二个服务器，用指向它的 302 应答，并断言第二个服务器从未被访问。

</details>
