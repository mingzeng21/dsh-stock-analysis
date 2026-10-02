---
description: "Web sidebar catalog, launch form, and history for skill-backed stock Agents."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-stock-agents

English | [中文](README.zh.md)

## Summary

The Web client registers one stock-analysis sidebar entry, builds cards from Host skill metadata, and lists durable specialist Sessions. Agents-owned labels use Simplified Chinese regardless of the app locale, and the stock preset requires Simplified Chinese replies. A card opens an input form or starts immediately according to its `SKILL.md` metadata.

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

Mount it beside the Session service, stock Agents Remote, locale, slots, and Workspace UI. Selecting an immediate card creates a fresh Session and starts analysis in one click; an input card waits for submitted conditions. Each run selects `stock-analysis` before the first turn, sends an explicit `/skill-name` prompt, and shows the streaming Conversation inside the panel. The panel shows all specialist records from Session list projections; rerunning starts another Session with editable prior conditions.

<a id="understand-the-implementation"></a>
## Understand the implementation

Card metadata comes from `metadata.stockAgent` in bundled skills, and the panel displays its Chinese fields. The panel owns launch state only; the Session log owns answers and follow-ups. It reuses the `conversation.content` factory for results and follow-ups without leaving the panel. A Conversation header badge shows specialist identity when the same Session is opened in ordinary Chat. Removed skills leave history open but have no rerun card.

<a id="further-exploration"></a>
## Further Exploration

See the [stock Agents proposal](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.md) and [Host catalog](../../api/stock-agents-controller/README.md).

<a id="dev-note"></a>
## Dev Note

New specialist content belongs in `packages/bundle/web-app/skills/<name>/SKILL.md`; the UI has no per-specialist branches.

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

- Specialist results use the shared Conversation view inside Agents rather than a dedicated dashboard. The catalog needs the Host Remote to be available before cards appear.
- No runtime invariant companion is published; this panel renders Host-owned Session and catalog state without keeping an independent durable copy.
