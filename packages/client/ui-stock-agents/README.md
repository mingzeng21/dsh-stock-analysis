---
description: "Web stock Agents catalog, skill-based conversations, and a native dragon-tiger dashboard."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-agents

English | [中文](README.zh.md)

## Summary

The Web client registers one stock-analysis sidebar entry, builds specialist cards from Host skill metadata, and adds a native dragon-tiger dashboard card. Specialist Sessions appear in a collapsible history rail inside Agents; the dashboard reads current market data directly and creates no Session. Conversation history contains ordinary conversations; Agent records and results stay in Agents. Agents-owned labels use Simplified Chinese regardless of the app locale.

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

Mount it beside the Session service, stock Agents Remote, stock data client, locale, and slots. Selecting an immediate specialist card creates a fresh Session and starts analysis in one click; an input card waits for the submitted query. Each run selects `stock-analysis` before the first turn, sends an explicit `/skill-name` prompt, and shows the streaming Conversation inside Agents. Selecting 龙虎榜观察 instead opens a dashboard immediately and reads the latest common trading date's three boards. Its tabs, signed amount charts, stock sorting, and seat details are interactive; refresh reads again. The history rail contains specialist Sessions and can be collapsed in every view.

<a id="understand-the-implementation"></a>
## Understand the implementation

Specialist card metadata comes from `metadata.stockAgent` in bundled skills. The panel owns launch state, dashboard state, and temporary rail visibility; the Session log owns specialist answers and follow-ups. It reuses the `conversation.content` factory for specialist results. The dashboard uses `ctx.stockClient.dragonTiger()` and never invokes a skill or the model. It shows returned-sample rise/fall counts, trading amount, stock change percentages, and available signed amounts; missing upstream fields remain unavailable. Opening an Agent record does not change the ordinary Conversation selection. Removed skills leave history open but have no rerun card.

<a id="further-exploration"></a>
## Further Exploration

See the [stock Agents proposal](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.md) and [Host catalog](../../api/stock-agents-controller/README.md).

<a id="dev-note"></a>
## Dev Note

New conversation specialists belong in `packages/bundle/web-app/skills/<name>/SKILL.md`. Native data views such as 龙虎榜观察 live in this package and use browser-facing data clients.

<a id="model-experience"></a>
## Model Experience

### Explicit card invocation

#### What the model sees

The first turn contains the user's selected request prefixed with `/stock-…`; immediate tasks use the Chinese prompt stored with the card. The Host skill loader then logs the selected skill body as a separate instruction message. The stock preset and its skills require Simplified Chinese replies. The UI registers no tool schema.

#### Token effect

Only the submitted prompt and loaded skill body add request tokens; card discovery and history listing do not.

#### KV Cache effect

The first prompt and skill instruction are durable messages, so later turns retain their existing prefix and append new context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Conversation specialist results use the shared Conversation view. The catalog needs the Host Remote to be available before specialist cards appear; the dragon-tiger dashboard needs the stock provider to serve its data.
- No runtime invariant companion is published; this panel renders Host-owned Session and catalog state without keeping an independent durable copy.
