---
description: "问财 (iwencai) OpenAPI gateway provider for the DeepSeek Harness stock capability seam: document search and natural-language research queries, with the gateway's per-skill identity headers."
kind: "package-reference"
---

# @deepseek-ai/dsh-stock-iwencai

English | [中文](README.zh.md)

## Summary

Use `dsh-stock-iwencai` to register 问财 gateway capabilities on `ctx.stock` beside the market-data provider. It contributes what the 同花顺 market-data API does not have: announcement, research-report, and news search, plus natural-language screening and queries over fundamentals, macro data, shareholder structure, and company business. The gateway has one origin, one credential, and two endpoints; a capability is a skill identity over one of them, so adding one is a registry row rather than a new plugin.

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

Mount the seam, then this provider.

```yaml
- name: '@deepseek-ai/dsh-stock'

- name: '@deepseek-ai/dsh-stock-iwencai'
  config:
    apiKeyEnv: IWENCAI_API_KEY
    maxConcurrency: 4
```

| Field | Default | Meaning |
|---|---|---|
| `apiKey` | — | Literal API key; prefer `apiKeyEnv` so no secret enters configuration files |
| `apiKeyEnv` | `IWENCAI_API_KEY` | Credential reference resolved for each call |
| `baseUrl` | `https://openapi.iwencai.com` | Gateway origin; must be an absolute HTTP(S) URL |
| `timeoutMs` | `30000` | Per-attempt deadline |
| `maxAttempts` | `3` | Total attempts for one call, including the first |
| `maxConcurrency` | `4` | Cap on in-flight requests |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-stock-iwencai) is the exhaustive source for every accepted field and its JSDoc.

### Registered capabilities

| Capability id | Tool | Gateway |
|---|---|---|
| `iwencai.search.announcement` | `iwencai_announcement_search` | search, `announcement` channel |
| `iwencai.search.report` | `iwencai_report_search` | search, `report` channel |
| `iwencai.search.news` | `iwencai_news_search` | search, `news` channel |
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
## Understand the implementation

Every capability's identity and request family come from the generated registry; the transport adds the gateway's identity headers.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | The plugin: `name`, `inject`, `Config`, `apply`, the provider, and the credential chain |
| [`src/http.ts`](src/http.ts) | The transport: identity headers, concurrency slot, deadline, bounded retry |
| [`src/envelope.ts`](src/envelope.ts) | HTTP and `status_code` classification onto the seam's failure taxonomy |
| [`src/normalize.ts`](src/normalize.ts) | Rows and totals from the two response shapes |
| [`src/catalog/generated.ts`](src/catalog/generated.ts) | Generated registry records and the gateway identity table |
| — | No runtime invariant companion is published; the provider holds no durable state beyond a concurrency counter, the seam enforces result bounds, and nothing here publishes an observation stream. |

### Adding a capability

`pnpm run gen-iwencai-catalog` reads `contracts/iwencai-skills.snapshot.json` and the curated naming in the generator, and writes both the registry records and the identity table. `pnpm run verify-iwencai-catalog` re-derives them offline. Extending coverage is a snapshot entry plus a curated selection, never a new transport.

### The identity gate

The gateway refuses a request that carries no `X-Claw-Skill-Id` header: measured, it answers `401` with "当前 Skill 版本过低" whether or not the credential is valid. Measured too: the *value* of that header is not validated — a version other than the recorded one, and a skill name the store does not publish, both succeed. The provider therefore sends the identity matching the capability, which is the documented contract, and keeps it a generated constant so a vendor tightening the rule is a regeneration rather than a redesign.

<a id="further-exploration"></a>
## Further Exploration

- [Stock market data subsystem](../../../docs/subsystems/stock.md) — the seam this provider registers into: registry vocabulary, result envelope, provider routing, and the error taxonomy.
- [dsh-stock-hithink](../stock-hithink/README.md) — the sibling provider, and the vendor-variation fields the registry records.

<a id="model-experience"></a>
## Model Experience

### Rows and failures rendered by `dsh-tool-stock`

#### What the model sees

This provider contributes no prompt text and no tool schema; `dsh-tool-stock` owns the model-facing text. What the model reads from this provider is data-dependent. A document search returns the gateway's own fields — `title`, `summary`, `url`, `publish_date` — and a natural-language query returns the columns the gateway's parser chose for that query, which are Chinese and carry the reporting date inside the name, for example `涨停[20260915]` or `单位净值增长率[20250916-20260915]`. The batch fact `total` accompanies the rows only when the gateway reported one. A failure reaches the model as the seam's error code carrying the gateway's own message, never as a bare HTTP status.

#### Token effect

Data-dependent, and bounded by consumers rather than here: this provider caps neither row count nor rendered bytes. The seam's `maxRows` bound and the consumer's render budget are the only limits between a gateway response and a model request.

#### KV Cache effect

No direct invalidation; the provider contributes no request-prefix tokens, so mounting it changes a prefix only through the tool schemas `dsh-tool-stock` registers for its capabilities.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These are current constraints of the package, not cleanup items.

- **The version sent is not the store's version** — the checked-in snapshot records the store's `version` per skill, but the identity table pins the value the vendor's own skill scripts send, which differs (`1.0.1` recorded against `1.0.0` sent for the three search skills). The gateway accepted both when measured; the script's value is used because it is what the vendor's client sends.
- **Result columns are chosen by the gateway, not by this provider** — a natural-language query returns Chinese column names that embed the reporting date, so a consumer that reads a column by name is coupled to the vendor's parser. A workflow that needs a stable column set must name the query it issues and validate the columns it receives.
- **Document search has no continuation** — the gateway documents no page parameter for the search endpoint, so those three capabilities register `paging: 'none'` and return only the requested `size`, even though the response reports a larger total.
- **The vendor's matched-object count is not surfaced** — a natural-language query reports both `row_count` (the rows it can return) and `code_count` (the securities it matched), and the seam's `total` carries `row_count` because that is the quantity a caller paginating needs. A consumer that wants "how many instruments matched" has to read it from the rows it received.
- **The gateway's business codes are unclassified** — only `0` is documented as success, so any other `status_code` maps to the seam's upstream failure with the vendor's message attached rather than to a code table that does not exist.
- **A request costs against a daily allowance** — the vendor documents `429` as the daily limit being reached rather than as a burst limit, so a retry that exhausts its attempts is reported, not retried indefinitely.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: curated named queries

The gateway routes by query content, not by skill identity, so a fixed workflow can pin a query string today and receive whatever columns the parser produces. Promoting a frequently used query to a named capability with a checked column set is worth doing once a feature depends on it, and not before.

</details>
