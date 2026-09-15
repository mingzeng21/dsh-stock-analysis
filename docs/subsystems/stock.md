# Stock market data

English | [中文](stock.zh.md)

The stock subsystem is the reference for `ctx.stock`, the capability seam through which the harness reads market data from a financial data vendor. [architecture.md](../architecture.md) places it among the other seams; this page owns its vocabulary, provider contract, and error taxonomy.

## Why one service serves every asset class

A-share quotes, fund holdings, futures positions, and index constituents arrive from one vendor with one authentication scheme, one response envelope, and one pagination convention. Splitting them into several services would multiply provider registration and error handling without changing what a caller does: name a capability, pass its parameters, read bounded rows. The seam therefore owns one registry and one provider contract, and separates capabilities by *universe* rather than by service.

The provider owns transport and wire normalization. It never decides which capabilities exist, which parameters are legal, or how many rows a caller may see; those are seam policy and stay in one place. Swapping vendors changes one provider package and nothing a consumer sees.

## The endpoint registry

The vendor publishes no OpenAPI document. The registry is therefore derived from three machine-readable contracts, joined by `pnpm run gen-stock-catalog` and committed as `STOCK_ENDPOINTS`:

| Contract | Supplies |
|---|---|
| Six MCP `tools/list` responses | Parameter names, types, defaults, required flags, and descriptions |
| The vendor CLI package's `schemas/capabilities.json` | REST request path, pagination model, and bounded history window |
| The documented MCP-tool-to-REST-path table | The join between the two |

Capabilities the vendor does not mirror as MCP tools — fund backtesting, fund indicators, QDII quotas, and the anomaly-reason list — carry hand-transcribed parameters and are marked `source: 'manual'`. `pnpm run verify-stock-catalog` re-derives the registry offline and fails when a committed record drifts from its contract.

Each `StockEndpoint` records what a caller must know before issuing a request: the HTTP path, whether the vendor currently permits external access (`availability`), how the endpoint pages (`paging`), the longest history window it accepts (`window`), and how it encodes dates (`dateEncoding`). The vendor uses four incompatible date encodings, three pagination models, and a different default adjustment per family; recording them as data is what keeps that variation out of every consumer.

## Parameter validation

The model-facing tool DSL constrains values only through `enum`, `const`, `default`, and required keys. It cannot express the vendor's required keys, numeric bounds, or value formats. `resolveParams` is therefore the single place that turns untrusted arguments into wire parameters: it rejects unknown keys rather than forwarding them, coerces numeric and boolean strings, enforces declared types and enumerations, applies vendor defaults, and reports a missing required key before any request is issued.

## Results

One call returns `StockResult`: normalized rows plus batch facts. Rows keep the vendor's field names — 82 capabilities return 82 row shapes, and inventing a canonical type per shape without a consumer would fix the wrong model. What *is* normalized is everything a caller would otherwise re-derive: the data-readiness timestamp (`asOf`, milliseconds since the Unix epoch in `Asia/Shanghai`), the vendor's total count, whether the seam capped the rows (`truncated`), and the arguments for the next page (`next`).

The seam applies `maxRows` to the completed result and sets `truncated` when it drops rows. The provider's transport is where the vendor's own bounds apply.

## Pagination

Six capabilities page, under two models the registry records: a page number with a page size, and an offset with a limit. The provider turns a full page into `next` — the request's own parameters with the page position advanced — so a caller re-issues the same query instead of reconstructing it. When the vendor reports a total, that total decides whether a continuation exists; when it reports none, a full page is the only signal available, and a page smaller than its size produces no continuation because it is necessarily the last one. A response that returns fewer rows than the page size — which is also what a capability backed by a bulk selector does when its paging parameters are ignored — therefore never advertises a next page.

## Symbol disambiguation

The vendor accepts only complete thscodes (`600519.SH`) and rejects bare codes, and its quote responses carry no Chinese name. `StockRuntime.resolveSymbols` therefore runs the cross-market search capability, projects rows onto `SymbolMatch`, and caches the result for a configured lifetime. It returns every candidate rather than guessing a market suffix, because the vendor documents that suffix inference is wrong for over-the-counter funds and for exchanges the caller may not know.

## Provider availability

Selection is resolved per call and never depends on registration order:

- A configured provider id that is registered and usable is selected.
- A configured id that is not registered fails with `STOCK_PROVIDER_CONFIGURED_MISSING`.
- A configured id that is registered but unusable fails with `STOCK_PROVIDER_UNAVAILABLE`.
- Without a configured id, exactly one usable provider is required; none fails with `STOCK_PROVIDER_UNAVAILABLE` and several fail with `STOCK_PROVIDER_AMBIGUOUS`.

## Errors

`StockError` carries a stable code. Callers branch on the code, never on the message:

| Code | Meaning |
|---|---|
| `STOCK_PROVIDER_UNAVAILABLE` | No usable provider, or the configured one cannot serve |
| `STOCK_PROVIDER_CONFIGURED_MISSING` | The configured provider id is not registered |
| `STOCK_PROVIDER_AMBIGUOUS` | Several usable providers and none configured |
| `STOCK_DUPLICATE_PROVIDER` | A provider with that id is already registered |
| `STOCK_UNKNOWN_ENDPOINT` | The capability id is not in the registry |
| `STOCK_INVALID_PARAMS` | Arguments failed seam validation before any request |
| `STOCK_CAPABILITY_CLOSED` | Published by the vendor but not open to external access |
| `STOCK_CANCELLED` | The call was cancelled through its signal |
| `STOCK_UNAUTHENTICATED` | The vendor refused the credential, or it is missing |
| `STOCK_FORBIDDEN` | The credential lacks permission for this capability |
| `STOCK_NOT_FOUND` | The instrument does not exist |
| `STOCK_NO_DATA` | The instrument exists but has no data for the window |
| `STOCK_UNSUPPORTED_ASSET` | The instrument's asset type does not support the capability |
| `STOCK_RATE_LIMITED` | The vendor throttled the request |
| `STOCK_UPSTREAM` | The vendor or an upstream data source failed |
| `STOCK_MALFORMED_RESPONSE` | The response did not match the published envelope |

## The service

<a id="cordis-surface"></a>

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
