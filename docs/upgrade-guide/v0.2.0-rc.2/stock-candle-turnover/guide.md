---
kind: upgrade-guide
description: "Custom stock candle producers must supply historical turnover for the watchlist overview."
---

# Supply turnover on stock candles

English | [中文](guide.zh.md)

## Change

`@deepseek-ai/dsh-api-stock-controller/client` now includes a required `turnover` number on each `Candle`. The Host reads the vendor's historical `turnover` field and reports `stock/malformed-row` if it is absent. Custom `IStockClient` implementations and fixtures that construct candles must add the field. Code that only reads candles needs no change.

## Migration

1. Add `turnover` in the instrument's original currency units to every `Candle` returned by custom `IStockClient.candles` implementations and test fixtures. Do not substitute a calculated value from adjusted OHLC prices.
2. Run TypeScript typecheck for the affected consumer. Open the watchlist and confirm that the 20-bar average turnover and recent-bar turnover show values from the historical response.
