# DSH Stock Research

English | [中文](README.zh.md)

DSH Stock Research is an A-share research agent for people who want to investigate companies, sectors, and market developments through a conversation. It combines market data, company information, and research workflows in one interface. Users can start with a question; they do not need to assemble an agent or choose a workspace.

This project is a fork of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Its general conversation and session infrastructure remains the foundation, while the shipped Web experience is focused on stock research.

## What you can do

- **Conversation:** Ask research questions and return to previous conversations in a collapsible history panel. New conversations use the fixed **股票分析** preset.
- **Agents:** Start focused research workflows from cards and review their results in a separate analysis history.
- **Watchlist:** Save A-share stocks and inspect quotes, price charts, and related announcements, reports, and news. Ask follow-up questions about a selected stock.

The stock preset includes a basic research persona and stock and Web tools. It does not yet enforce a detailed research method or task-specific tool limits. Responses are research material, not personalized trading or position advice; check the source and time of any market data before relying on it.

<a id="run"></a>

<a id="run-from-source"></a>

## Run from source

Install Node.js `^22.19.0` or `>=24.0.0` and pnpm `11.7.0`, then run:

```sh
git clone https://github.com/mingzeng21/dsh-stock-analysis.git
cd dsh-stock-analysis
pnpm install
pnpm run build
pnpm dsh web
```

Open the complete URL printed by `pnpm dsh web`. On a local launch, the browser normally opens automatically. In **Settings → Models**, save a [DeepSeek API key](https://platform.deepseek.com/) before starting a conversation.

Stock data is provided through the configured Hithink Finance and iWenCai services. To use their live data, supply `HITHINK_FINANCE_API_KEY` and `IWENCAI_API_KEY` in the process environment before launching the app. Without a required provider key or access to a particular capability, the corresponding data request can fail; the model key alone does not provide market data.

New research sessions use a writable application data directory by default, so the user does not need to select a workspace. Existing workspaces retain their recorded paths.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md), the [development guide](docs/development.md), and [architecture](docs/architecture.md). Repository agents follow [AGENTS.md](AGENTS.md). The stock Web composition lives in [web-app](packages/bundle/web-app/README.md); its market-data integration is described in the [stock subsystem](docs/subsystems/stock.md).

## License

[MIT](LICENSE). Third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
