---
description: "Web Personal Research Lab with a wiki directory, one-field L1–L5 topic research, report import, proposal review, and relation graph."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-research

English | [中文](README.zh.md)

## Summary

This browser plugin registers the fourth global sidebar row, Personal Research Lab, and its `main` panel. It presents three views over the Host-owned library: a folder-like directory, topic studies, and a linked-page graph.


## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

The directory groups immutable sources, attachments, published entities, concepts, topics, source notes, an index, an activity log, and editable page templates under reader-facing labels. The index groups published pages by kind and opens each page directly. The underlying `raw/` and `wiki/` paths remain durable record views. Users can add text, URLs, and files; view source text; download the original file; create and revise pages; assign sources and links; inspect and restore earlier revisions; and review or discard Agent proposals. A proposal preview shows its complete Markdown before publication.

An empty library opens with actions to add a source, start a topic study, or create a page. Once content exists, the directory becomes available. On narrow screens, readers can open the directory above a full-width article.

Topic research starts from one topic field. The panel opens a `stock-analysis` Session and asks the Agent for a complete L1–L5 report: end demand, supply-chain stack, hard-to-replace bottlenecks, cross-checked evidence, then directional conclusions with risks, falsifiers, and monitoring points. Follow-up messages and corrections remain in that Session; the request tells the Agent to issue a revised complete report. A completed L1–L5 report in that Session shows **Add to knowledge base** beneath the answer. Clicking it retains the exact report as an immutable source once per Session Turn and queues a second Agent request to propose source, topic, and supported entity or concept pages with links. The Agent's page edits remain proposals until the user publishes them. Starting source compilation also asks the Agent to read the saved source and stage wiki changes.

The graph displays up to 30 published pages and their explicit links. Selecting a node opens the page. When pages have no explicit links, it presents a page list instead of isolated nodes. It does not infer unsupported relationships from prose. When the graph has no pages, it offers a direct path to create one.

## Understand the implementation

`src/client/index.ts` owns Remote calls and one observable library snapshot. `ResearchPanel.tsx` owns the three views and their local form state. `ResearchReportAction.tsx` reads the completed Turn and contributes the import button to `conversation.chat.turnTail`. The sidebar row uses `sidebar.panellist`; the panel uses the matching `main` key. The package holds no durable browser-local copy. No runtime invariant companion is published because the Host owns all durable research state.

## Further Exploration

- [Research controller](../../api/research-controller/README.md) owns durable state and proposal publication.
- [Sidebar shell](../ui-sidebar/README.md) owns global navigation.

## Dev Note

The package README and its Chinese pair describe the shipped behavior; generated catalogs own exhaustive configuration and tool schemas.

## Model Experience

Indirectly, through the Session request that starts L1–L5 research and the separate Wiki extraction request sent after the user selects report import.

#### KV Cache effect

Starting the Session adds one user message; importing a report adds another. Browsing the panel adds no model context.

## Known Limitations and Deferred Work

- The graph uses explicit page links and a 30-node display bound. Directory paths are UI views over durable records, not writable filesystem folders. The panel displays PDF extracted text but has no inline PDF viewer. It does not create scheduled study updates or automatically refresh a thesis when an external source changes.
