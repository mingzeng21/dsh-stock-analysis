---
description: "面向浏览器的行情数据读取，构建在股票能力 seam 之上：在 stock Remote 命名空间上提供归一化的标的匹配、快照批量、K 线序列与研究文档。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-stock-controller

[English](README.md) | 中文

## 概述

当浏览器界面需要行情数据时使用本包。它在[股票能力 seam](../../stock/stock/README.zh.md)之上完成一个视图能够渲染的四项读取——跨市场标的消歧、一次批量快照、单只标的的 K 线序列、单只标的的研究文档——并在 Host 上一次性解析 vendor 的字段名、日期编码与检索词汇。它不注册任何工具，也不贡献任何 prompt，因此挂载它不消耗工具 schema token；`dsh-tool-stock` 仍是同一 seam 面向模型的 consumer。

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

把本包与 `dsh-stock` 及一个 provider 一起挂载。Client 调用 `remote.stock.searchSymbols(query, limit)`、`quotes(thscodes)`、`candles(request)` 或 `documents(request)`；没有任何方法接收 Session，因为行情数据不属于任何 Session。

| 方法 | 返回 | 用途 |
|---|---|---|
| `searchSymbols(query, limit)` | `readonly InstrumentMatch[]` | 对名称、裸代码或 thscode 片段做跨市场消歧 |
| `quotes(thscodes)` | `QuoteBatch { asOf?, quotes }` | 为每个指定标的取一次批量快照 |
| `candles(request)` | `CandleSeries { thscode, interval, asOf?, truncated, candles }` | 一只标的在一个窗口内的 K 线 |
| `documents(request)` | `readonly DocumentRow[]` | 一只标的的研报、公告或新闻 |

### 归一化

seam 有意在其行上保留 vendor 自己的字段名，因为 82 个能力返回 82 种行结构，而在没有 consumer 时固定一套规范类型会固化的模型是错的。本包就是那个 consumer，因此映射发生在这里，浏览器永远不会读到 vendor 行。

| 线上字段 | vendor 字段 |
|---|---|
| `Candle.time` | `date_ms` |
| `Candle.open` / `high` / `low` / `close` | `open_price` / `high_price` / `low_price` / `close_price` |
| `Candle.volume` | `volume` |
| `Quote.last` / `change` / `changePct` | `last_price` / `price_change` / `price_change_ratio_pct` |
| `Quote.open` / `high` / `low` / `prevClose` | `open_price` / `high_price` / `low_price` / `prev_price` |
| `Quote.volume` / `turnover` | `volume` / `turnover` |
| `DocumentRow.publishedAt` | `publish_time`，整秒换算为毫秒 |
| `DocumentRow.source` | 研报的 `extra.organization`，新闻行的 `extra.real_publish_source`，其次 `extra.publish_source` |
| `DocumentRow.url`、`title`、`summary` | `url`、`title`、`summary` |

无法提供界面所需值的行会让整次读取以 `stock/malformed-row` 失败并指名字段；它永远不会被丢弃，也永远不会变成 0，因为被丢弃的行会被读成"这只标的没有"，而 0 会被读成一个已披露的数值。数值字段接受数字字符串，因为 vendor 在 JSON 数字编码上并不一致。

由于 vendor 的快照行不携带标的名，`Quote` 也没有：调用方本来就持有它把这个标的列在哪个名字之下。

### 周期、复权与窗口

`interval` 就是 vendor 自己的 `1d`、`1w` 或 `1mo`，因此周期切换不需要客户端聚合。`adjust` 默认为 `forward`。vendor 每次请求最多接受十年，因此当 `end` 早于 `start`、任一边界不是整数毫秒时间戳，或 `end` 晚于 `start` 加十个日历年时，窗口会以 `gateway/bad-request` 被拒绝。行数上限由 seam 独立约束，`CandleSeries.truncated` 会报告该约束而不是隐藏它。

### 文档

公告、研报与新闻来自问财网关，其检索接收自然语言查询而非标的标识。本包用标的展示名与各渠道自己的词拼出该查询，因此调用方只需传入它本来就持有的名字：

| `kind` | 查询 | 能力 |
|---|---|---|
| `report` | `<name> 研报` | `iwencai.search.report` |
| `announcement` | `<name> 公告` | `iwencai.search.announcement` |
| `news` | `<name> 新闻` | `iwencai.search.news` |

`summary` 是网关自己的节选，会按 `maxSummaryChars` 截断，截断时置位 `summaryTruncated`。`source` 对研报是发布券商、对新闻是来源媒体；对公告则缺省，因为该渠道本就没有，界面因此渲染自己的本地化标签。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxQuotes` | `50` | 一次快照批量最多可命名的标的数上限（含）；更大的批量会被拒绝 |
| `maxDocuments` | `30` | 一次文档检索最多返回的行数上限（含）；更大的请求会被截断到该值 |
| `maxSummaryChars` | `400` | 单条文档节选的字符上限（含） |
| `maxSymbolMatches` | `20` | 标的检索候选数上限（含）；更大的请求会被截断到该值 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-api-stock-controller)是每个可接受字段及其 JSDoc 的完整来源。

### 失败

每一次 seam 失败都保留一个独立的 Remote 错误码，因此调用方按错误码分支，绝不解析消息。每个错误都带 `{ endpoint, thscode? }`，指明失败的是哪次读取。

| Remote 错误码 | 它覆盖的 seam 错误码 |
|---|---|
| `stock/provider-unavailable` | 没有可用 provider，或所配置的 provider 缺失或存在歧义 |
| `stock/unavailable-capability` | 该能力 id 不在任何注册表中 |
| `stock/invalid-params` | seam 在任何请求发出前拒绝了参数 |
| `stock/unauthenticated` / `stock/forbidden` | vendor 拒绝了凭据，或凭据缺少权限 |
| `stock/not-found` / `stock/no-data` / `stock/unsupported-asset` | 标的不存在、在该窗口内无数据，或资产类别不符 |
| `stock/rate-limited` / `stock/upstream` | vendor 限流、失败，或返回了不符合其公布信封的响应 |
| `stock/capability-closed` | vendor 公布了该能力但尚未开放外部访问 |
| `stock/cancelled` | 调用方的 signal 已被中止 |
| `stock/malformed-row` | vendor 行缺少本包词汇所需的某个值；details 增加 `field` |

seam 错误码按字符串而非类身份比较，因为 `StockError` 类属于组合所加载的那个 seam 实例，跨包边界没有任何实例被共享。不携带 `STOCK_` 错误码的错误会原样传播，而不会被折叠成某个股票失败。

### Client 读取面

浏览器导出提供 `ctx.stockClient`，并要求 `remote` 与 `remote.stock`。每个方法把 Gateway 的 `RemoteResult` 解包成值或抛出其失败，因此调用方写一处 `try`/`catch` 并按 `code` 分支。该服务不持有状态，也不持有缓存；按标的缓存过期与否由缓存它的界面自己决定。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕——点击展开</summary>

### 源码地图

| 文件 | 角色 |
|---|---|
| [`src/index.ts`](src/index.ts) | `StockController`：`stock` 服务与 Remote 命名空间、`Config`、四项读取、seam 失败映射，以及窗口与上限校验 |
| [`src/vendor.ts`](src/vendor.ts) | vendor 行读取器与行投影；唯一读取 vendor 字段名的地方 |
| [`src/types.ts`](src/types.ts) | 线上词汇，作为 `./types` 发布给 Client 包 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器插件与 `ctx.stockClient` |
| — | 不发布运行时 invariant 伴随包；该服务不持有任何可能产生分歧观察的状态，每个答案都在调用时从 seam 推导。 |

Typert 生成由 `./typert` 与 `./remote` 暴露的 Host 与 Client Remote 产物。

### 为什么读取面只有 A 股

标的检索按资产类别过滤，因为本包读取的快照、K 线与文档能力都只服务该universe：该范围之外的匹配会进入一个永远无法为它取快照的列表。接纳另一种资产类别意味着同时放宽该过滤器和这些读取。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [行情数据](../../stock/stock/README.zh.md) —— 该 seam 的端点注册表、`StockResult`、provider 选择与错误分类。
- [同花顺 provider](../../stock/stock-hithink/README.zh.md) —— 提供快照、K 线与标的检索能力的传输层。
- [问财 provider](../../stock/stock-iwencai/README.zh.md) —— 提供文档检索的网关。
- [面向模型的行情工具](../../stock/tool-stock/README.zh.md) —— 同一 seam 面向模型的 consumer。
- [新增 Remote API](../../../docs/cookbook/adding-a-remote-api.zh.md) —— 本包 Host 与 Client 面遵循的五个步骤。

-----

<a id="model-experience"></a>
## 模型体验

间接地，经由 `dsh-tool-stock`，它拥有同一 seam 的每一个面向模型的投影。

#### KV Cache effect

无；本包既不组装也不发送 provider 请求，也不注册任何会被挂载的 consumer 加入的工具 schema 或 prompt 段。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅限 A 股** —— 标的检索过滤到该universe，而快照、K 线与文档读取不服务其他资产类别。
- **文档相关性由网关决定** —— 检索接收自然语言查询，因此可能出现一篇关于另一只标的、正文提到本标的的行；界面展示来源与时间，让用户自行判断某一行，而不是信任排序。
- **无订阅与推送** —— seam 不发布订阅，因此浏览器按需读取，并持有它最后一次取到的内容。
- **不做 K 线聚合** —— 序列就是 vendor 自己的；vendor 未发布的周期无法请求。
- **一次 K 线读取只针对一只标的** —— vendor 拒绝多标的窗口，因此想要多条序列的调用方要发起多次读取。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
