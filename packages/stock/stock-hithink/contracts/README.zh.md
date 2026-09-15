# 契约快照

[English](README.md) | 中文

这三个文件是 `pnpm run gen-stock-catalog` 生成 `src/catalog/generated.ts` 时读取的输入。它们被签入仓库，因此生成注册表可以在不访问网络的情况下被校验。厂商不发布 OpenAPI 文档，所以没有任何单一来源承载完整契约；下表中每个文件提供其中一部分。

| 文件 | 来源 | 采集时间 | 提供内容 |
|---|---|---|---|
| `mcp-tools.snapshot.json` | 六个托管 MCP 服务（`/mcp/a-share`、`/mcp/a-share-index`、`/mcp/fund`、`/mcp/futures`、`/mcp/options`、`/mcp/meta`）的 `tools/list` | 2026-09-14 | 72 个镜像能力的参数名、类型、默认值、必填标记与描述 |
| `cli-capabilities.snapshot.json` | `@hithink-tech/hithink-finance-cli@0.1.10` 包内的 `schemas/capabilities.json` | 2026-09-14 | CLI 发布的每个远程能力的 REST 路径、HTTP 方法、分页模型与历史窗口 |
| `mcp-tool-to-rest.snapshot.json` | 厂商的 MCP 工具总览页 `https://fuyao.aicubes.cn/docs/mcp/overview/` | 2026-09-14 | MCP 工具名到 REST 路径的映射，它把前两个文件接在一起 |

## 由这些文件生成的内容

`src/catalog/generated.ts` 中的 `STOCK_ENDPOINTS`：厂商当前向 API Key 客户端暴露的每个能力一条记录，承载上述字段的并集。其中十条记录没有 MCP schema，而由 CLI 映射与文档化字段表拼装；它们各自通过 `source: 'manual'` 字段说明这一点。

生成文件是提供方、面向模型的工具与工具目录的共同权威。它被提交进仓库，因此契约变化以可评审的 diff 出现，而不是成为运行时的意外。

## 刷新方式

刷新需要网络访问，但不需要 API Key：六次 `tools/list` 调用与 npm 包下载都是匿名的。另外两个来源是一个文档页与一个已发布的包。

```sh
pnpm run gen-stock-catalog          # re-fetch every source and rewrite src/catalog/generated.ts
pnpm run verify-stock-catalog       # regenerate offline and diff, which is the freshness gate
```

`verify-stock-catalog` 是 CI 中运行的门禁。它从不访问网络，因此它恰好只在签入的快照与签入的生成文件不一致时失败。
