# Agent Note: Stock market data capability seam

Status: implemented

English | [中文](2026-09-14-stock-market-data-capability-seam.zh.md)

## Problem

Agents asked about listed companies must answer from real market data: prices, financial statements, valuations, index membership, fund holdings, and futures positions. The vendor publishes 82 capabilities that an API key reaches, split across six MCP services, and it publishes no OpenAPI document. Any integration therefore has to answer three questions the vendor does not: where the machine-readable contract lives, how many tools the model should see at once, and what other plugins call when they need the same data.

Mounting the vendor's MCP servers directly answers none of them. It registers all 72 mirrored tools into every request, the MCP client has no tool filter to narrow them, six capabilities that exist over REST are absent from MCP, the vendor's errors arrive inside a JSON-RPC result rather than as protocol failures, and vendor tool names (`get_a_share_special_data_limit_up_pool`) are near-synonymous with their siblings. The vendor also accepts only complete thscodes, rejects bare codes, returns no Chinese name in quote responses, and uses four incompatible date encodings, three pagination models, and a different default adjustment per family.

## Decision

Market data is a capability seam with three roles under `packages/stock/`: [the service definition](../../../../packages/stock/stock/src/index.ts) (`ctx.stock`), [the vendor provider](../../../../packages/stock/stock-hithink/src/index.ts), and [the model-facing consumer](../../../../packages/stock/tool-stock/src/index.ts). The provider owns transport and wire normalization; the service owns the registry, parameter validation, result bounds, and symbol disambiguation. A second provider can therefore replace the vendor without changing what a consumer calls. The three-role split follows the [capability seam decision](2026-06-13-capability-seams.md), and provider selection, duplicate rejection, and the stable error-code taxonomy follow [the web seam](2026-06-24-web-capability-seam.md).

The endpoint registry is generated, not hand-written. `pnpm run gen-stock-catalog` joins three machine-readable contracts — the six MCP `tools/list` schemas, the vendor CLI package's `schemas/capabilities.json`, and the documented tool-to-path table — into 82 committed records; `pnpm run verify-stock-catalog` re-derives them offline, so drift fails without a credential or a network call. Ten capabilities with no MCP mirror carry transcribed parameters and are marked `source: 'manual'`. Each record states the vendor's own availability, pagination model, history window, and date encoding, which is what keeps that variation out of every consumer.

`StockResult` normalizes the envelope — data-readiness timestamp, total, truncation, next-page arguments — and deliberately keeps the vendor's field names on rows. Rows carry the vendor's field names because 82 capabilities return 82 row shapes and no consumer yet justifies a canonical type per shape ([require a current owner and need](../../../../packages/AGENTS.md)). The provider turns a full page on a paging capability into `next`: the request's own parameters with the page position advanced. The vendor's reported total decides whether more rows exist when it reports one; otherwise a full page is the only available signal, and a shorter page is necessarily the last.

All 82 capabilities become native tools, and they are mounted only by the new `stock-analysis` preset. `standard` and `ptc` are unchanged: the measured payload is 31,446 characters of tool schemas (approximately 11,900 tokens by character class), which those agents must not carry in every request. The service and its provider stay on the host plane in the `web-app` bundle, where they register no tools and cost nothing, so any preset or host plugin reads the same `ctx.stock`.

Each tool's description reaches the model as the vendor's own `title` and `summary` with the vendor's MCP tool names rewritten to the registered ones, followed by three curated additions in [`describe.ts`](../../../../packages/stock/tool-stock/src/describe.ts): the instrument-code hint, the `口径` clause that separates near-synonym capabilities, and a pool-membership note for a capability whose vendor prose names the accepted suffixes but not the instruments its pool omits — the index pool carries neither 北证50 (`899050.BJ`) nor 中证2000 (`932000.CSI`), so a call naming one fails with `Unknown thscode` instead of returning an empty result.

A preset is a complete agent composition rather than an overlay, so `stock-analysis` repeats `standard`'s rows and adds `tool-stock`. A drift guard asserts that the copy's rows equal `standard`'s exactly, with `tool-stock` as the only permitted difference.

## Alternatives considered

**Mount the vendor's MCP servers through `dsh-mcp-client`.** Zero code, and rejected: it registers 72 tools into every request with no way to narrow them, omits six capabilities that REST serves, routes failures through JSON-RPC results, and leaves symbol disambiguation and Chinese-name resolution to the model.

**Register the capabilities across `standard` and `ptc`.** Rejected on measured cost: each native tool's schema is part of every request's stable prefix, and the market-data surface is irrelevant to most sessions.

**One service per asset class.** Rejected: the vendor serves every class from one host with one credential, one response envelope, and one pagination convention. Splitting them would multiply provider registration and error handling without changing what a caller does.

**A canonical result type per capability.** Rejected for now: no current consumer reads those fields, and fixing 82 shapes before one exists would encode the wrong model.

## Consequences

Adding a capability to the vendor's contract is a registry regeneration plus review; a capability the vendor withdraws fails the offline check rather than surfacing as a runtime error. Parameter constraints the tool DSL cannot express — required keys, types, enumerations, and defaults — are enforced in one place, `resolveParams`, before any request is issued.

Tool schemas reach the model through the existing request path, so no Session event type changed; the tool catalog and its schema pins record the new surface. The subsystem page, group README, and the shipped-preset expectations move with it.

A second provider followed on the same seam: the 问财 gateway registers document search and natural-language research queries beside the market-data registry. Because a capability id is the handle callers write down, the seam routes each call to the provider that registered the id and rejects a duplicate id at registration, so serving two vendors needed no selection rule and no change to consumers. The service therefore holds one catalog and one error taxonomy across vendors.
