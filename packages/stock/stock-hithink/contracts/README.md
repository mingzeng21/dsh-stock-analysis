# Contract snapshots

English | [中文](README.zh.md)

These three files are the inputs `pnpm run gen-stock-catalog` reads to produce `src/catalog/generated.ts`. They are checked in so the generated registry can be verified without network access. The vendor publishes no OpenAPI document, so no single source carries the whole contract; each file below supplies one part of it.

| File | Source | Captured | Supplies |
|---|---|---|---|
| `mcp-tools.snapshot.json` | `tools/list` on the six hosted MCP services (`/mcp/a-share`, `/mcp/a-share-index`, `/mcp/fund`, `/mcp/futures`, `/mcp/options`, `/mcp/meta`) | 2026-09-14 | Parameter names, types, defaults, required flags, and descriptions for the 72 mirrored capabilities |
| `cli-capabilities.snapshot.json` | `schemas/capabilities.json` inside `@hithink-tech/hithink-finance-cli@0.1.10` | 2026-09-14 | REST path, HTTP method, paging model, and history window for every remote capability the CLI publishes |
| `mcp-tool-to-rest.snapshot.json` | The vendor's MCP tool overview page, `https://fuyao.aicubes.cn/docs/mcp/overview/` | 2026-09-14 | The MCP tool name to REST path mapping, which is what ties the first two files together |

## What is generated from these files

`STOCK_ENDPOINTS` in `src/catalog/generated.ts`: one record per capability the vendor currently exposes to API-key clients, carrying the union of the fields above. Ten records have no MCP schema and are assembled from the CLI map and the documented field tables instead; each says so through its `source: 'manual'` field.

The generated file is authoritative for the provider, the model-facing tools, and the tool catalog. It is committed, so a contract change appears as a reviewable diff rather than as a runtime surprise.

## Refreshing

Refreshing needs network access but no API key: the six `tools/list` calls and the npm package download are anonymous. The other two sources are a documentation page and a published package.

```sh
pnpm run gen-stock-catalog          # re-fetch every source and rewrite src/catalog/generated.ts
pnpm run verify-stock-catalog       # regenerate offline and diff, which is the freshness gate
```

`verify-stock-catalog` is the gate that runs in CI. It never touches the network, so it fails exactly when the committed snapshot and the committed generated file disagree.
