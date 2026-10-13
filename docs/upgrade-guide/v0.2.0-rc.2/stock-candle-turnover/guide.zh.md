---
kind: upgrade-guide
description: "自定义股票 K 线生产者需提供历史成交额，供自选股行情摘要使用。"
---

# 为股票 K 线提供成交额

[English](guide.md) | 中文

## 变更

`@deepseek-ai/dsh-api-stock-controller/client` 的每个 `Candle` 现在必须包含数值字段 `turnover`。Host 读取供应商历史行情的 `turnover` 字段；字段缺失时返回 `stock/malformed-row`。自行实现 `IStockClient` 或构造 K 线的测试样例需要补充该字段。仅仅读取 K 线的代码无需修改。

## 迁移

1. 在自定义 `IStockClient.candles` 实现及测试样例返回的每个 `Candle` 中加入原始货币单位的 `turnover`。不要根据复权后的开高低收价格推算成交额。
2. 对受影响的调用方运行 TypeScript 类型检查。打开自选股，确认 20 根 K 线平均成交额和最近 K 线成交额来自历史行情响应。
