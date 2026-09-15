---
description: "The Hithink (同花顺) REST backend for ctx.stock: how a deployment points the stock capability seam at fuyao.aicubes.cn with a resolved API key, a bounded transport policy, and the vendor's own row field names."
kind: "package-reference"
---

# @deepseek-ai/dsh-stock-hithink

English | [中文](README.zh.md)

## Summary

With `dsh-stock-hithink`, the harness can query the Hithink financial-data REST API through the stock service (`ctx.stock`) and get normalized rows plus batch facts. Choose it when a composition must reach `fuyao.aicubes.cn` with a resolved `X-api-key` credential, a per-attempt deadline, a bounded concurrency gate, retries limited to throttling and the two transient upstream codes, and a mapped failure taxonomy. Rows keep the vendor's own field names. The model-facing tools live in `dsh-tool-stock`, which renders what this provider returns.

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

Mount the provider in a composition that already loads the stock service. It registers the `hithink` provider, so `ctx.stock` resolves it automatically when it is the only usable provider, or a deployment pins it with `provider: hithink`.

### When to choose it

Choose this provider to reach the Hithink REST API with one resolved credential, a per-attempt deadline, a concurrency ceiling, and a retry policy that refuses to amplify a hard failure. It speaks the vendor's published envelope and maps the vendor's business codes onto the seam's failure taxonomy, so consumers branch on `STOCK_*` codes instead of on numeric vendor codes.

### Minimal configuration

Load the stock service and the provider. Every field has a default, and an invalid bound fails at plugin construction rather than producing a provider with nonsensical limits.

```yaml
- name: '@deepseek-ai/dsh-stock'
- name: '@deepseek-ai/dsh-stock-hithink'
```

| Field | Default | Meaning |
|---|---|---|
| `apiKey` | — | Literal API key. Prefer `apiKeyEnv`, so no secret enters a configuration file. |
| `apiKeyEnv` | `HITHINK_FINANCE_API_KEY` | Credential reference resolved per call through `ctx.credentials`, falling back to the launch environment. |
| `baseUrl` | `https://fuyao.aicubes.cn` | Vendor origin. Must be an absolute HTTP(S) URL. |
| `timeoutMs` | `30000` | Deadline for one attempt, not for the whole retry sequence. |
| `maxAttempts` | `3` | Total attempts for one call, including the first. |
| `maxConcurrency` | `4` | Maximum requests this provider keeps in flight. |

### Endpoint coverage

The provider serves the 82 capabilities in the generated vendor registry, which is the join of the vendor's MCP tool schemas, its CLI capability map, and its documented tool-to-path table. `ctx.stock.catalog()` reads that registry; `ctx.stock.call()` validates arguments against the same record before any request is issued.

<a id="understand-the-implementation"></a>
## Understand the implementation

One call resolves the API key, waits for a concurrency slot, then runs the attempt loop. Each attempt fetches under its own deadline with `redirect: 'error'`, because the request carries a credential and a redirect must never forward it. A response is read as `{ code, message, request_id, data }`; throttling may instead arrive as HTTP 429 with a shortened body, which the reader tolerates.

Only HTTP 429 and the business codes `4001`, `5002`, and `5003` are retried, after an exponential backoff with jitter. A vendor outage reported as a bare HTTP failure is not retried, so a hard failure reaches the caller instead of being amplified. A `Retry-After` header, which the vendor does not document, is honored when it parses.

Normalization keeps the vendor's field names and normalizes only the envelope: rows come from `data.item`, `asOf` from `data.timestamp`, and `total` from `data.total`. A record with no `item` member becomes one row rather than no data. `data` values pass through unchanged, so an undisclosed financial value stays `null` instead of becoming a zero.

A full page on a paging capability becomes `next`: the request's own parameters with the page position advanced, so a caller re-issues the same query. The reported total decides whether more rows exist when the vendor reports one; otherwise a full page is the trigger, and a shorter page produces nothing. This is why a capability whose paging parameters are ignored when a bulk selector is present never advertises a continuation — it returns fewer rows than the page size.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: the credential resolution chain, the `Config` schema, and the `HithinkProvider` registered on `ctx.stock` |
| [`src/http.ts`](src/http.ts) | Transport: concurrency gate, attempt loop, per-attempt deadline, redirect rejection, and backoff schedule |
| [`src/envelope.ts`](src/envelope.ts) | Vendor envelope reading and the mapping from vendor business codes onto seam error codes |
| [`src/normalize.ts`](src/normalize.ts) | Row extraction from `data` and the batch facts that accompany them |
| [`src/query.ts`](src/query.ts) | Query-string serialization of validated wire parameters |
| [`src/catalog/generated.ts`](src/catalog/generated.ts) | The generated capability registry this provider serves |
| — | No runtime invariant companion is published; this provider registers into `ctx.stock` and enforces its transport policy on each call, so it owns no independent registry or lifecycle stream whose observations could diverge. |

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough.

- [Stock subsystem](../../../docs/subsystems/stock.md) — the seam's endpoint registry, failure taxonomy, and result vocabulary.
- [dsh-tool-stock](../tool-stock/README.md) — the model-facing tools that render this provider's rows.
- [Contract snapshots](contracts/README.md) — where the generated registry's inputs come from and how to refresh them.

<a id="model-experience"></a>
## Model Experience

### Rows and failures rendered by `dsh-tool-stock`

#### What the model sees

This provider contributes no prompt text and no tool schema; `dsh-tool-stock` owns the model-facing text. What the model reads from this provider is data-dependent: each capability's rows keep the vendor's own field names exactly as `data.item` supplied them, including `thscode`, `last_price`, and `price_change_ratio_pct`, with the vendor's `null` preserved for an undisclosed value. The batch facts `total` and `asOf` accompany the rows only when the vendor reported them. A failure reaches the model as the seam's error code, never as the vendor's numeric code.

#### Token effect

Data-dependent, and bounded by consumers rather than here: this provider caps neither row count nor rendered bytes. The seam's `maxRows` bound and the result-spill policy are the only limits between a vendor response and a model request.

#### KV Cache effect

No direct invalidation: the provider registers no prompt section and no tool schema, so it cannot change a reusable request prefix. A changed `baseUrl` or credential changes response data only.

## Known Limitations and Deferred Work

- **Rows are not renamed or unit-converted** — the provider reports the vendor's fields as published, so `last_price` is in yuan, `price_change_ratio_pct` is a percentage number, and a financial indicator's `value` may arrive as a string; a consumer that needs a canonical shape owns that mapping.
- **Retries cover throttling and two transient codes only** — a refused connection, a deadline, or an HTTP 5xx without an envelope fails immediately, so a caller that must survive a network blip owns its own retry.
- **No offline or cached mode** — every call reaches the vendor; a deployment that needs local history data must add a second provider.
- **`Retry-After` handling is best-effort** — the vendor does not document the header, so an unparsable value falls back to the local backoff schedule.
- **The credential is resolved per call** — an authenticated-response cache is deliberately absent, so a rotated key takes effect on the next call.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The capability registry under `src/catalog/generated.ts` is a checked-in generated artifact; `pnpm run gen-stock-catalog` regenerates it from `contracts/`, and `pnpm run verify-stock-catalog` re-generates without network access and diffs, which is the freshness gate. Never edit the generated file by hand.

The vendor publishes no OpenAPI document, so the generator joins three sources: the six MCP services' `tools/list` schemas, the npm CLI package's `schemas/capabilities.json`, and the documented tool-to-path table. `contracts/README.md` records each source and its version.

The transport rejects redirects because every request carries `X-api-key`. That behavior is pinned by a test that starts a second server, answers with a 302 pointing at it, and asserts the second server was never contacted.

</details>
