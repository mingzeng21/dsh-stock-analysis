# 股票行情数据

[English](stock.md) | 中文

股票子系统是 `ctx.stock` 的参考页——harness 通过这个能力 seam 从金融数据厂商读取行情数据。[architecture.md](../architecture.zh.md) 把它放在其余 seam 之间；本页负责它的词汇、提供方契约与错误分类。

## 为什么一个服务承载全部资产类别

A 股行情、基金持仓、期货持仓与指数成分股来自同一家厂商，共用同一套鉴权方式、同一个响应信封与同一种分页约定。把它们拆成多个服务只会成倍增加提供方注册与错误处理，而不会改变调用方所做的事：指定一个能力、传入它的参数、读取有界的行。因此这个 seam 拥有一个注册表与一份提供方契约，并按**标的宇宙**而不是按服务来区分能力。

提供方负责传输与线上格式归一化。它从不需要决定有哪些能力、哪些参数合法、调用方能看多少行；这些是 seam 的策略，集中在一处。更换厂商只会换掉一个提供方包，消费者看不到任何变化。

## 接口注册表

厂商不提供 OpenAPI 文档，因此注册表由三份机器可读契约派生，经 `pnpm run gen-stock-catalog` 合并后提交为 `STOCK_ENDPOINTS`：

| 契约 | 提供的内容 |
|---|---|
| 六份 MCP `tools/list` 响应 | 参数名、类型、默认值、必填标记与描述 |
| 厂商 CLI 包的 `schemas/capabilities.json` | REST 请求路径、分页模型与历史窗口上限 |
| 文档中的 MCP 工具到 REST 路径对照表 | 前两者的连接键 |

厂商没有镜像为 MCP 工具的能力——基金回测、基金指标、QDII 额度与异动原因列表——携带人工转写的参数，并标记为 `source: 'manual'`。`pnpm run verify-stock-catalog` 会离线重新派生注册表，并在已提交记录与其契约发生漂移时失败。

每条 `StockEndpoint` 记录了调用方在发起请求前必须知道的信息：HTTP 路径、厂商当前是否允许外部访问（`availability`）、端点如何分页（`paging`）、它接受的最长历史窗口（`window`），以及它如何编码日期（`dateEncoding`）。厂商使用了四套互不兼容的日期编码、三种分页模型，且每个能力族的默认复权方式不同；把这些记录成数据，才能让这种差异不渗透进每个消费者。

## 参数校验

面向模型的工具 DSL 只能通过 `enum`、`const`、`default` 和必填键约束取值，无法表达厂商的必填项、数值边界或取值格式。因此 `resolveParams` 是唯一把不可信参数变成线上参数的环节：它拒绝而不是转嫁未知参数，强制转换数值与布尔字符串，校验声明的类型与枚举，套用厂商默认值，并在发起任何请求之前报告缺失的必填项。

## 结果

一次调用返回 `StockResult`：归一化后的行，加上批次级事实。行保留厂商的字段名——82 个能力返回 82 种行结构，在没有消费者的情况下为每种结构发明一个规范类型，只会固化错误的模型。真正被归一化的是调用方否则必须自行推导的一切：数据就绪时间戳（`asOf`，`Asia/Shanghai` 下的 Unix 毫秒）、厂商给出的总数、seam 是否截断了行（`truncated`），以及下一页的参数（`next`）。

seam 对完整结果应用 `maxRows`，并在丢弃行时置位 `truncated`。厂商自身的边界由提供方的传输层负责。

## 分页

有六个能力分页，分属注册表记录的两种模型：页码加页大小，以及偏移量加条数上限。提供方把满页转换成 `next`——即请求自身的参数、只把页码位置前移——因此调用方重新发起同一查询，而不必自行重建它。厂商报告了总数时，由总数判定是否还存在下一页；未报告时，满页是唯一可用的信号，而小于页大小的返回不产生续页，因为它必然是最后一页。因此返回行数少于页大小的响应——当能力的批量选择参数使分页参数被忽略时也是这种情况——永远不会声称还有下一页。

## 标的消歧

厂商只接受完整 thscode（`600519.SH`）并拒绝裸代码，而且它的行情响应不返回中文名。因此 `StockRuntime.resolveSymbols` 会调用跨市场检索能力，把行投影为 `SymbolMatch`，并按配置的存活时间缓存结果。它返回全部候选而不是猜测市场后缀，因为厂商明确说明：对场外基金以及调用方可能不了解的交易所，推断后缀是错误的。

## 提供方可用性

选择在每次调用时解析，且从不依赖注册顺序：

- 已配置的提供方 id 若已注册且可用，即被选中。
- 已配置的 id 未注册时，以 `STOCK_PROVIDER_CONFIGURED_MISSING` 失败。
- 已配置的 id 已注册但不可用时，以 `STOCK_PROVIDER_UNAVAILABLE` 失败。
- 未配置 id 时，要求恰好一个可用提供方；没有可用提供方以 `STOCK_PROVIDER_UNAVAILABLE` 失败，存在多个则以 `STOCK_PROVIDER_AMBIGUOUS` 失败。

## 错误

`StockError` 携带稳定 code。调用方按 code 分支，绝不解析 message：

| Code | 含义 |
|---|---|
| `STOCK_PROVIDER_UNAVAILABLE` | 没有可用提供方，或已配置的提供方无法服务 |
| `STOCK_PROVIDER_CONFIGURED_MISSING` | 已配置的提供方 id 未注册 |
| `STOCK_PROVIDER_AMBIGUOUS` | 存在多个可用提供方且未配置 |
| `STOCK_DUPLICATE_PROVIDER` | 该 id 的提供方已注册 |
| `STOCK_UNKNOWN_ENDPOINT` | 该能力 id 不在注册表中 |
| `STOCK_INVALID_PARAMS` | 参数未通过 seam 校验，未发起任何请求 |
| `STOCK_CAPABILITY_CLOSED` | 厂商已发布但未开放外部访问 |
| `STOCK_CANCELLED` | 调用经其 signal 被取消 |
| `STOCK_UNAUTHENTICATED` | 厂商拒绝了凭据，或凭据缺失 |
| `STOCK_FORBIDDEN` | 凭据无权调用该能力 |
| `STOCK_NOT_FOUND` | 标的不存在 |
| `STOCK_NO_DATA` | 标的存在的但该窗口内没有数据 |
| `STOCK_UNSUPPORTED_ASSET` | 标的类型不支持该能力 |
| `STOCK_RATE_LIMITED` | 厂商限流 |
| `STOCK_UPSTREAM` | 厂商或上游数据源失败 |
| `STOCK_MALFORMED_RESPONSE` | 响应不符合已发布的信封 |

## 服务

<a id="cordis-surface"></a>

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxstock--stockruntime"></a>

### `ctx.stock` — `StockRuntime`

The stock data service, registered as `ctx.stock`.

Capabilities from every registered usable provider form one catalog, and a call routes to the provider that registered the capability id. A configured `provider` restricts the seam to that one provider. Capability ids are unique across providers, which registration enforces, so routing never depends on registration order.

```ts cordis-catalog
/**
 * Register a provider.
 *
 * Throws {@link StockError} `STOCK_DUPLICATE_PROVIDER` when its id is taken,
 * and `STOCK_DUPLICATE_ENDPOINT` when any capability id it serves is already
 * registered by another provider: a capability id is the handle callers and
 * feature code write down, so two owners would make it ambiguous. The
 * registration unwinds with the calling fiber.
 *
 * @param provider - the provider; its `id` is the registry key.
 * @returns the disposer that unregisters it.
 */
register(provider: StockProvider): () => void

/**
 * List registry records matching a query, across every usable provider.
 * @param query - optional text and universe filters.
 * @returns matching endpoints, ordered by provider registration then registry order.
 */
catalog(query: StockCatalogQuery = {}): readonly StockEndpoint[]

/**
 * Execute one capability. Arguments are validated against the registry record
 * before any request is issued, and the row count is bounded before the
 * result reaches a caller.
 *
 * The capability's owning provider is found by registry record, not by
 * provider selection: several vendors answer different capabilities through
 * the same seam, and an id belongs to exactly one of them.
 *
 * @param endpointId - capability id from {@link StockRuntime.catalog}.
 * @param params - untrusted arguments, normally model-authored.
 * @param signal - optional cancellation forwarded to the provider.
 * @returns normalized rows plus batch facts.
 */
async call(endpointId: string, params: Readonly<Record<string, unknown>> = {}, signal?: AbortSignal): Promise<StockResult>

/**
 * Resolve a company name, bare code, or thscode fragment to complete
 * instruments. Results are cached per query for `symbolCacheTtlMs`, because
 * disambiguation is a prerequisite for nearly every other call.
 * @param query - user-facing text, e.g. `中际旭创` or `300308`.
 * @param options - asset-type filter and result bound.
 * @returns matches in vendor order, capped to `options.limit`.
 */
async resolveSymbols(query: string, options: SymbolQueryOptions = {}): Promise<readonly SymbolMatch[]>
```

Source: [`packages/stock/stock/src/index.ts`](../../packages/stock/stock/src/index.ts)
<!-- END GENERATED cordis-surface -->
