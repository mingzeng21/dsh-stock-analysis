---
description: "Package map for the stock-market data capability family: the market-data service, its vendor provider, and the model-facing tools that consume them."
kind: "package-group"
---

# stock/ — stock-market data capability family

English | [中文](README.zh.md)

## Summary

The `stock/` packages let models read A-share, index, fund, futures, and options data from a financial data vendor through model-facing tools, and let other plugins read the same data programmatically through `ctx.stock`. The vendor serves every asset class from one API with one credential and one response envelope; deployments can swap vendors behind the provider contract without changing what a consumer sees. Use this family for market data retrieval, not for trading, order placement, or investment advice.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Three packages play the stock roles; the subsystem reference owns the exhaustive vocabulary, provider contract, and error taxonomy.

| Package | Role | ctx key |
|---|---|---|
| [`stock/`](stock/README.md) | Market-data service: the endpoint registry, parameter validation, bounded results, and symbol disambiguation | `ctx.stock` |
| [`stock-hithink/`](stock-hithink/README.md) | Serves market data through the vendor REST API | registers on `ctx.stock` |
| [`tool-stock/`](tool-stock/README.md) | Exposes every registered capability to the model as one native tool | registers on `ctx.tools` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the endpoint registry, result envelope, and error taxonomy.

- [Stock market data subsystem](../../docs/subsystems/stock.md) — `StockEndpoint`, `StockResult`, provider selection, `StockError`, and symbol disambiguation.
- [Adding a tool](../../docs/cookbook/adding-a-tool.md) — the contracts a model-facing tool must satisfy.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The endpoint registry is generated, not hand-written: `pnpm run gen-stock-catalog` joins the vendor's MCP `tools/list` schemas with its CLI capability map, and `pnpm run verify-stock-catalog` fails when the committed registry drifts. The vendor publishes no OpenAPI document, so those snapshots under `stock-hithink/contracts/` are the contract of record; refresh them deliberately and review the generated diff.

</details>
