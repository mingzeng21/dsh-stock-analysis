---
description: "Abstract stock-market data capability seam (ctx.stock) for the DeepSeek Harness — provider registry, endpoint vocabulary, bounded results, symbol disambiguation, and the StockError taxonomy."
kind: "package-reference"
---

# @deepseek-ai/dsh-stock

English | [中文](README.zh.md)

## Summary

Use `dsh-stock` to give the harness one provider-neutral way to read market data. It owns the endpoint vocabulary, argument validation, result bounds, symbol disambiguation, and the error taxonomy; a provider owns transport and wire normalization, and a consumer exposes whatever the model or a feature plugin needs. Mount it with a provider; without one, every call fails with `STOCK_PROVIDER_UNAVAILABLE` rather than silently reaching a default backend.

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

Mount the service on the host plane and register a provider beside it.

```yaml
- name: '@deepseek-ai/dsh-stock'

- name: '@deepseek-ai/dsh-stock-hithink'
  config:
    apiKeyEnv: HITHINK_FINANCE_API_KEY
    maxConcurrency: 4
```

| Field | Default | Meaning |
|---|---|---|
| `provider` | — | Explicit provider id; omitted selects the only usable registered provider |
| `maxRows` | `500` | Upper bound on rows one call returns before the result is marked truncated |
| `symbolCacheTtlMs` | `300000` | Lifetime of one cached symbol lookup |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-stock) is the exhaustive source for every accepted field and its JSDoc.

### What a caller does

`ctx.stock.catalog()` lists capabilities, `ctx.stock.call(id, params)` executes one, and `ctx.stock.resolveSymbols(text)` turns a company name or bare code into complete thscodes. A feature plugin composes them programmatically; the model-facing consumer turns each capability into a tool.

<a id="understand-the-implementation"></a>
## Understand the implementation

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: the `StockRuntime` service, provider selection, catalog filtering, result caps, and symbol resolution |
| [`src/registry.ts`](src/registry.ts) | Vocabulary: `StockEndpoint`, `StockParam`, and the vendor-variation fields (`availability`, `paging`, `window`, `dateEncoding`) |
| [`src/params.ts`](src/params.ts) | `resolveParams`: the single place untrusted arguments become wire parameters |
| [`src/types.ts`](src/types.ts) | The provider contract, `StockResult`, and the symbol-match vocabulary |
| [`src/error.ts`](src/error.ts) | The stable code taxonomy; callers branch on a code and never parse a message |
| — | No runtime invariant companion is published; the provider map and symbol cache are private, selection and result caps are enforced on every call, and the seam publishes no independent registry or observation stream. |

Provider selection resolves per call and never depends on registration order: a configured id must be registered and usable, and without one exactly one usable provider must exist.

<a id="further-exploration"></a>
## Further Exploration

- [Stock market data subsystem](../../../docs/subsystems/stock.md) — the endpoint registry, `StockResult`, provider selection, and symbol disambiguation.
- [dsh-stock-hithink](../stock-hithink/README.md) — the vendor provider, its retry and concurrency policy, and the response envelope it normalizes.

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-stock`, which renders this seam's normalized rows to the model while the service itself contributes no prompt section and no tool schema.

#### KV Cache effect

No direct invalidation; the named consumer owns the request-prefix contribution that a mounted toolset adds.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the service is incomplete on its own. They are current package constraints.

- **Rows keep the vendor's field names** — 82 capabilities return 82 row shapes, and no current consumer reads normalized domain objects, so no canonical `Quote`/`Bar` types exist yet. Adding them is a deliberate future change with a named consumer.
- **No caching of data responses** — only symbol lookups are cached. Repeated market-data reads in one turn issue repeated vendor requests, bounded by the provider's concurrency gate rather than by a cache.
- **No cross-endpoint join** — a quote does not carry the Chinese name; `resolveSymbols` returns the name separately, and a caller that needs both issues two calls.
- **Bounded history is the vendor's, not the seam's** — `window` records the vendor's limit per endpoint; the seam enforces only its own `maxRows`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: canonical domain types

Rows deliberately preserve vendor field names. The first feature plugin that needs a stable `Quote` or `Bar` should introduce it here, with that consumer as the evidence, rather than anticipating it now.

</details>
