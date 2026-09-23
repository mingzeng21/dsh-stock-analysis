---
description: "Browser-facing market-data reads over the stock capability seam: normalized symbol matches, quote batches, candle series, and research documents on the stock Remote namespace."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-stock-controller

English | [中文](README.zh.md)

## Summary

Use this package when a browser surface needs market data. It performs four reads a view can render — cross-market symbol disambiguation, a batched quote, one instrument's candle series, and one instrument's research documents — over the [stock capability seam](../../stock/stock/README.md), and resolves the vendor's field names, date encodings, and search vocabulary once on the Host. It registers no tool and contributes no prompt, so mounting it costs no tool-schema tokens; `dsh-tool-stock` remains the model-facing consumer of the same seam.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package beside `dsh-stock` and one provider. A Client calls `remote.stock.searchSymbols(query, limit)`, `quotes(thscodes)`, `candles(request)`, or `documents(request)`; no method takes a Session, because market data belongs to no Session.

| Method | Returns | Purpose |
|---|---|---|
| `searchSymbols(query, limit)` | `readonly InstrumentMatch[]` | Cross-market disambiguation of a name, bare code, or thscode fragment |
| `quotes(thscodes)` | `QuoteBatch { asOf?, quotes }` | One batched quote per named instrument |
| `candles(request)` | `CandleSeries { thscode, interval, asOf?, truncated, candles }` | One instrument's bars over a window |
| `documents(request)` | `readonly DocumentRow[]` | One instrument's reports, announcements, or news |

### Normalization

The seam keeps the vendor's own field names on its rows, because 82 capabilities return 82 row shapes and no consumer existed to justify a canonical type per shape. This package is that consumer, so the mapping happens here and the browser never reads a vendor row.

| Wire field | Vendor field |
|---|---|
| `Candle.time` | `date_ms` |
| `Candle.open` / `high` / `low` / `close` | `open_price` / `high_price` / `low_price` / `close_price` |
| `Candle.volume` | `volume` |
| `Quote.last` / `change` / `changePct` | `last_price` / `price_change` / `price_change_ratio_pct` |
| `Quote.open` / `high` / `low` / `prevClose` | `open_price` / `high_price` / `low_price` / `prev_price` |
| `Quote.volume` / `turnover` | `volume` / `turnover` |
| `DocumentRow.publishedAt` | `publish_time`, whole seconds converted to milliseconds |
| `DocumentRow.source` | a report's `extra.organization`, a news row's `extra.real_publish_source` then `extra.publish_source` |
| `DocumentRow.url`, `title`, `summary` | `url`, `title`, `summary` |

A row that cannot supply a value the surface needs fails the whole read with `stock/malformed-row` naming the field; it is never dropped and never becomes a zero, because a dropped row reads as "this instrument has none" and a zero reads as a disclosed value. A numeric string is accepted for a numeric field, because the vendor is inconsistent about JSON number encoding.

Because the vendor's quote rows carry no instrument name, `Quote` has none: the caller already holds the name it listed the instrument under.

### Periods, adjustments, and windows

`interval` is the vendor's own `1d`, `1w`, or `1mo`, so a period switch needs no client-side aggregation. `adjust` defaults to `forward`. The vendor accepts at most ten years per request, so a window is refused with `gateway/bad-request` when `end` precedes `start`, when either bound is not an integer millisecond timestamp, or when `end` is later than `start` plus ten calendar years. The seam bounds rows independently, and `CandleSeries.truncated` reports that bound rather than hiding it.

### Documents

Announcements, reports, and news come from the 问财 gateway, whose search takes a natural-language query rather than an instrument identity. This package composes that query from the instrument's display name and the channel's own word, so the caller passes the name it already has:

| `kind` | Query | Capability |
|---|---|---|
| `report` | `<name> 研报` | `iwencai.search.report` |
| `announcement` | `<name> 公告` | `iwencai.search.announcement` |
| `news` | `<name> 新闻` | `iwencai.search.news` |

`summary` is the gateway's own excerpt, cut to `maxSummaryChars` with `summaryTruncated` set when it was. `source` is the publishing brokerage for a report and the outlet for news; it is absent for an announcement, whose channel has none, so the surface renders its own localized label.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `maxQuotes` | `50` | Inclusive cap on instruments one quote batch may name; a larger batch is refused |
| `maxDocuments` | `30` | Inclusive cap on rows one document search may return; a larger request is capped |
| `maxSummaryChars` | `400` | Inclusive character cap on one document excerpt |
| `maxSymbolMatches` | `20` | Inclusive cap on symbol-search candidates; a larger request is capped |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-stock-controller) is the exhaustive source for every accepted field and its JSDoc.

### Failures

Every seam failure keeps a distinct Remote code, so a caller branches on the code and never parses a message. Each carries `{ endpoint, thscode? }` naming the read that failed.

| Remote code | Seam codes it covers |
|---|---|
| `stock/provider-unavailable` | No usable provider, or a configured one that is missing or ambiguous |
| `stock/unavailable-capability` | The capability id is in no registry |
| `stock/invalid-params` | The seam refused the arguments before any request |
| `stock/unauthenticated` / `stock/forbidden` | The vendor refused the credential, or it lacks permission |
| `stock/not-found` / `stock/no-data` / `stock/unsupported-asset` | The instrument is unknown, has no data for the window, or is the wrong asset class |
| `stock/rate-limited` / `stock/upstream` | The vendor throttled, failed, or answered outside its published envelope |
| `stock/capability-closed` | The vendor publishes the capability but has not opened external access |
| `stock/cancelled` | The caller's signal was already aborted |
| `stock/malformed-row` | A vendor row omitted a value this package's vocabulary requires; details add `field` |

Seam codes are compared as strings rather than by class identity, because the `StockError` class belongs to whichever seam instance the composition loaded and no instance is shared across the package edge. An error that carries no `STOCK_` code propagates unchanged instead of being folded into a stock failure.

### Client read face

The browser export provides `ctx.stockClient` and requires `remote` and `remote.stock`. Each method unwraps the Gateway's `RemoteResult` into its value or throws its failure, so a caller writes one `try`/`catch` and branches on `code`. The service holds no state and no cache; a surface that caches per instrument owns when that cache goes stale.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `StockController`: the `stock` service and Remote namespace, `Config`, the four reads, the seam-failure mapping, and window and cap validation |
| [`src/vendor.ts`](src/vendor.ts) | Vendor-row readers and the row projections; the one place vendor field names are read |
| [`src/types.ts`](src/types.ts) | Wire vocabulary, published as `./types` for Client packages |
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin and `ctx.stockClient` |
| — | No runtime invariant companion is published; the service holds no state whose observations could diverge, and every answer is derived from the seam at call time. |

Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

### Why the read surface is A-share only

Symbol search filters by asset type because the quote, candle, and document capabilities this package reads all serve that universe: a match outside it would enter a list that could never quote it. Admitting another asset class means widening the filter and those reads together.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Stock market data](../../stock/stock/README.md) — the seam's endpoint registry, `StockResult`, provider selection, and error taxonomy.
- [Hithink provider](../../stock/stock-hithink/README.md) — the transport that serves the quote, candle, and symbol capabilities.
- [问财 provider](../../stock/stock-iwencai/README.md) — the gateway that serves document search.
- [Model-facing stock tools](../../stock/tool-stock/README.md) — the same seam's model-facing consumer.
- [Adding a Remote API](../../../docs/cookbook/adding-a-remote-api.md) — the five steps this package's Host and Client faces follow.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-stock`, which owns every model-facing projection of the same seam.

#### KV Cache effect

None; this package neither assembles nor sends a provider request, and it registers no tool schema or prompt section that a mounted consumer would add.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **A-share only** — symbol search filters to that universe, and the quote, candle, and document reads serve no other asset class.
- **Document relevance is the gateway's** — the search takes a natural-language query, so a row about a different instrument whose text mentions this one can appear; the surface shows the source and time so a user judges a row rather than trusting the order.
- **No subscription or push** — the seam publishes none, so the browser reads on demand and holds whatever it last fetched.
- **No candle aggregation** — the series is the vendor's own; a period the vendor does not publish cannot be requested.
- **One instrument per candle read** — the vendor rejects a multi-instrument window, so a caller wanting several series issues several reads.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
