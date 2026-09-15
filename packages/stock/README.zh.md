---
description: "股票行情数据能力家族的包映射：行情数据服务、其厂商提供方，以及消费它们的面向模型工具。"
kind: "package-group"
---

# stock/：股票行情数据能力家族

[English](README.md) | 中文

## 概述

`stock/` 包让模型通过面向模型的工具读取 A 股、指数、基金、期货与期权数据，也让其他插件通过 `ctx.stock` 以程序方式读取同一批数据。厂商用一套 API、一份凭据与同一个响应信封服务全部资产类别；部署可以在提供方契约之后更换厂商，而消费者看不到变化。该家族用于行情数据读取，不用于交易、下单或投资建议。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发者说明](#dev-note)

-----

<a id="packages"></a>
## 包

三个包承担股票角色；子系统参考页负责完整的词汇、提供方契约与错误分类。

| 包 | 角色 | ctx 键 |
|---|---|---|
| [`stock/`](stock/README.zh.md) | 行情数据服务：接口注册表、参数校验、有界结果与标的消歧 | `ctx.stock` |
| [`stock-hithink/`](stock-hithink/README.zh.md) | 通过厂商 REST API 提供行情数据 | 注册到 `ctx.stock` |
| [`tool-stock/`](tool-stock/README.zh.md) | 把每个已注册能力作为一个原生工具暴露给模型 | 注册到 `ctx.tools` |

-----

<a id="related-documentation"></a>
## 相关文档

从子系统参考页开始，它记录了接口注册表、结果信封与错误分类。

- [股票行情数据子系统](../../docs/subsystems/stock.zh.md) — `StockEndpoint`、`StockResult`、提供方选择、`StockError` 与标的消歧。
- [新增工具](../../docs/cookbook/adding-a-tool.zh.md) — 面向模型的工具必须满足的契约。

<a id="dev-note"></a>
## 开发者说明

<details>
<summary>维护者工作上下文——点击展开</summary>

接口注册表是生成的，不是手写的：`pnpm run gen-stock-catalog` 把厂商的 MCP `tools/list` schema 与其 CLI 能力表合并，`pnpm run verify-stock-catalog` 在已提交注册表漂移时失败。厂商不提供 OpenAPI 文档，因此 `stock-hithink/contracts/` 下的快照就是契约本体；刷新它们要有意识地做，并审查生成的差异。

</details>
