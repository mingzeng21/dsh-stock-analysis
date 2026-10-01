---
description: "Host catalog and Session projection for skill-backed stock research Agents."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-stock-agents-controller

English | [中文](README.zh.md)

## Summary

This Host package lists only marked skills shipped with the Web stock application and records a specialist's identity in each Session projection. The `stockAgents.list()` Remote returns card metadata from DSH skill discovery without loading instruction bodies.

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

Mount it with the `stock-analysis` preset, skill registry, Session projection registry, and the Web startup service `stockAgentSkillDir`. Its Client read face calls `stockAgents.list()` for cards. A valid bundled `SKILL.md` with `metadata.stockAgent` adds a card without another controller change.

<a id="understand-the-implementation"></a>
## Understand the implementation

The catalog leases the current stock preset scope and lists its winning skills. It accepts only skills whose source path is inside the bundled skill directory and validates their bilingual title, summary, launch mode, examples, and immediate prompt. The `stockAgent` projection folds the human prompt immediately preceding the first explicit `skill-invocation` message into `{ name, query }`, which the normal Session list can expose while the Session is cold. Later turns reload that skill from the current catalog and append its instructions to the committed model input. If the skill is missing, the turn is refused.

<a id="further-exploration"></a>
## Further Exploration

See the [stock Agents proposal](../../../.agents/notes/proposed/feature/2026-10-01-skill-backed-stock-agents.md) and [skill package](../../skill/skill/README.md).

<a id="dev-note"></a>
## Dev Note

The controller belongs in `packages/api/`; market-data tools and providers remain in `packages/stock/`.

<a id="model-experience"></a>
## Model Experience

### Follow-up skill instructions

#### What the model sees

On a specialist follow-up, the model receives the current SKILL.md body through a logged `skill-invocation` user message after the human question. The controller registers no tool schema.

#### Token effect

The skill body adds tokens to each follow-up request; catalog listing adds none.

#### KV Cache effect

The new instruction message extends the existing Session prefix. Editing a skill changes the appended suffix of later turns without rewriting earlier messages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The projection records the first explicit invocation and its prompt. Renaming a skill requires a deliberate record migration if old Sessions must continue under the new name.
- No runtime invariant companion is published; the Session projection is the sole owner of specialist identity, and the catalog is computed from the current skill registry.
