---
description: "Web stock Agents catalog, specialist conversations, and interactive stock dashboards."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-agents

English | [中文](README.zh.md)

## Summary

The Web client registers one stock-analysis sidebar entry, builds specialist cards from Host skill metadata, and adds native dragon-tiger, hot-rank, sector-linkage, and closing-limit pulse dashboards. Opening a dashboard reads market data without creating a Session. Asking a dashboard question creates a stock-analysis Session on the first question and reuses it for follow-ups. Agents-owned labels use Simplified Chinese regardless of the app locale.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Mount it beside the Session service, stock Agents Remote, stock data client, locale, and slots. Selecting an immediate specialist card creates a fresh Session and starts analysis in one click; an input card waits for the submitted query. Each run selects `stock-analysis` before the first turn, sends an explicit `/skill-name` prompt, and shows the streaming Conversation inside Agents. Selecting 龙虎榜观察 opens the latest common trading date's three boards. Selecting 热股榜监控 opens four current attention lists; selecting a stock reads its last 30 calendar days of daily ranking. The 概念板块联动 card matches a concept or industry name, then shows daily index candles beside current constituents. The 涨停情绪市场脉冲 card links recent closing-limit counts, the bounded ladder matrix, seal amounts, and reason distribution; clicking a date changes the ladder and detail panels. Use 问看板 to ask about the selected dashboard. The composer shows scope tags for the board, selected item, date, or chart window. Question examples remain editable follow-ups after a Session starts. The panel shows the Session transcript and a notice when the board or selection changes after a question. Stocks mentioned in the latest answer appear as buttons that select and reveal their dashboard records. The history rail contains specialist Sessions and can be collapsed in every view.

<a id="understand-the-implementation"></a>
## Understand the implementation

Specialist card metadata comes from `metadata.stockAgent` in bundled skills. The panel owns launch state, dashboard state, and temporary rail visibility; the Session log owns answers and follow-ups. It reuses the `conversation.content` factory for Session results. The dashboards use `ctx.stockClient` reads; dashboard questions submit a bounded current-data snapshot in the logged prompt. Sector questions include only daily index observations in the selected calendar-day chart window. Pulse questions carry the selected date, pool completeness, ladder sample, and recent day summaries. The dragon-tiger dashboard shows returned-sample rise/fall counts, trading amount, stock change percentages, and available signed amounts; missing fields remain unavailable. Opening an Agent record does not change the ordinary Conversation selection. Removed skills leave history open but have no rerun card.

<a id="further-exploration"></a>
## Further Exploration

See the [stock Agents proposal](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.md) and [Host catalog](../../api/stock-agents-controller/README.md).

<a id="dev-note"></a>
## Dev Note

New conversation specialists belong in `packages/bundle/web-app/skills/<name>/SKILL.md`. Native data views such as 龙虎榜观察, 热股榜监控, 概念板块联动, and 涨停情绪市场脉冲 live in this package and use browser-facing data clients.

<a id="model-experience"></a>
## Model Experience

### Explicit card invocation

#### What the model sees

The first turn contains the user's selected request prefixed with `/stock-…`; immediate tasks use the Chinese prompt stored with the card. The Host skill loader then logs the selected skill body as a separate instruction message. The stock preset and its skills require Simplified Chinese replies. The UI registers no tool schema.

#### Token effect

Skill card discovery and history listing add no request tokens; only the submitted prompt and loaded skill body do. Dashboard questions add the current bounded board snapshot to each submitted prompt so the model can read it and the Session log can reconstruct it. Opening or refreshing a dashboard adds no model tokens.

#### KV Cache effect

The first prompt and skill instruction are durable messages, so later turns retain their existing prefix and append new context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Conversation specialist results use the shared Conversation view. The catalog needs the Host Remote to be available before specialist cards appear; the dashboards need the stock provider to serve their data. Sector membership describes the current list and does not establish historical membership or single-stock concept relevance.
- Dashboard inquiry Sessions appear in the Agents history rail and reopen with their dashboard and transcript. Data refreshes on reopen; the next question includes the refreshed snapshot.
- The pulse ladder provides a limited sample per board height. A day whose closing-limit pool exceeds the configured page bound shows lower-bound counts and amounts. The chart's percentile mode ranks the returned 30 trading days; it is not a 60-day market percentile.
- No runtime invariant companion is published; this panel renders Host-owned Session and catalog state without keeping an independent durable copy.
