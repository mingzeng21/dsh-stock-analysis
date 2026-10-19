---
description: "Inline A-share names and codes in settled assistant answers, with market quotes at the right edge."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-mentions

English | [中文](README.zh.md)

## Summary

Click a recognized A-share name or code where it appears in a completed assistant answer to inspect its quote at the right edge, or use the adjacent action to add it to the watchlist in one click. Only a unique exact match from the configured stock search service becomes interactive. The panel shows the latest quote, recent daily candlesticks, related news, and the same watchlist action.

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

The Web composition mounts this plugin beside Chat, the stock and watchlist clients, and the root shell overlay. It has no plugin configuration. A name or code remains ordinary text while the answer streams, when search fails, or when search does not return one exact instrument. The fixed right-edge quote panel can open from Conversation and global pages such as Agents. The adjacent add action stays visible beside each recognized name or code. Existing entries show their membership; the Host list is authoritative for additions, and transient results appear in a toast.

The latest price stays neutral; its change against the previous close is red when positive, green when negative, and neutral at zero. Daily candle colors compare close with open, as the chart label states.

Turnover and volume use compact Chinese market units, while quote and document timestamps use Shanghai time. Quote, candle, and news reads settle independently: a failed section reports its own error and retry action, and a refresh retains the last available content.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Chat reads this plugin's optional annotation service after a text block settles. The service bounds candidate extraction and resolves candidates through `stockClient`; the Markdown renderer adds buttons only to prose text nodes. Clicking a name opens one fixed right-edge panel across all main pages. The adjacent button and the panel header share one watchlist action, read membership from `watchlist.entries`, and publish Host additions through `watchlist.add`. The panel reads quote, daily candlestick, and news data through `stockClient` without retaining market data in the Session log.

</details>

**Runtime invariant:** No companion is published. The annotation cache and quote panel state belong to this browser plugin instance; behavior specs cover candidate resolution, panel updates, and disposal.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Stock controller](../../api/stock-controller/README.md) — normalized market-data reads.
- [Chat](../ui-chat/README.md) — settled assistant rendering.
- [Right sidebar](../ui-sidebar-right/README.md) — resource tabs and Session state.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser plugin adds no tool, prompt text, or Session event and does not change model requests.

#### KV Cache effect

None. Quote navigation and market reads are client-side actions and do not enter model history.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The stock data client has no A-share intraday series, so the quote tab shows daily closes rather than a minute-by-minute chart.
- Name extraction is bounded and may miss names split across Markdown formatting or buried in unusually long continuous Chinese text.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
