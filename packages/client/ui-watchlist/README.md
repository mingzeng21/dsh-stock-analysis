---
description: "Web watchlist global panel: the durable instrument list with a batched quote per row, the selected instrument's chart and published documents, and the analysis conversation session."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-watchlist

English | [中文](README.zh.md)

## Summary

Use this package for the Web client's watchlist: one global panel that keeps a personal instrument list beside the Conversation. The left rail lists each instrument with its latest quote, adds one through symbol disambiguation, and removes one. The analysis side shows the selected instrument's quote, its candlestick chart, the reports, announcements, and news published about it, and one analysis session the reader can question. It reads the durable list through `dsh-api-watchlist-controller`, market data through `dsh-api-stock-controller`, and its analysis session through the shipped session service; it holds no transport and caches nothing.

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

Mount the two controller packages and their stock provider, then this panel. It registers three slots for its own lifetime, inside one `ctx.effect`:

| Registration | Slot | What it is |
|---|---|---|
| `{ id: 'watchlist', order: 10, label }` | `sidebar.panellist` | The navigation row, labelled from this package's dictionary |
| `{ key: 'watchlist' }` | `main` | The panel the row selects |
| `{ }` | `watchlist.analysis` | The analysis transcript, declared by the `main` registration and `session`-scoped so the renderer binds it to the current session |

The row id and the main key are the same string by construction, because selecting the row is what dispatches the `main` entry.

### Reading and refreshing

The panel reads the list and its quote batch when it mounts, which is what returning to the panel does: the entry unmounts whenever another panel or the Conversation is selected. The rail's refresh control re-reads the batch, and the retry control on a failed batch does the same. There is no timer and no server push, because neither the watchlist nor the stock Remote publishes a subscription.

Every read is published with a phase, and a failed one carries the Remote failure code. A newer read supersedes an older one: a read that is no longer current publishes nothing, so a slow first read can never replace a fast second one.

### Adding an instrument

The add control opens one search box and one candidate list. A search resolves the text through the Host's symbol disambiguation, and picking a candidate appends it to the durable list. The instrument's display name is resolved by the Host, never by the panel, so the row it renders is the name the list stores.

Adding is refused rather than silently ignored: a duplicate, an unresolved symbol, a lookup failure, and a full list each answer with their own `watchlist/*` code, which the panel renders beside the search box. Rows are removed from the same place, and a removal that the Host refuses renders its code too.

### The chart

The chart is one canvas, drawn by `klinecharts` and wrapped so the rest of the panel never touches the library. The wrapper receives bars and returns a canvas: it does not read Remote, does not see the panel store, and is not told which instrument it draws — the panel header names it directly above.

Three periods are offered — `1d`, `1w`, `1mo` — and each asks the Host for its own history length (about one, three, and ten years). One read is issued per instrument and period, and the controller drops a response a newer read has already superseded, so switching instruments quickly never leaves the earlier series on screen. A failed read keeps the last series drawn and renders its code with a retry. When the seam capped the series, `truncated` renders as a note rather than silently shortening the chart.

Colors come from the same `--dsw-*` tokens the markup around the chart uses. A canvas cannot resolve a CSS variable, so the wrapper reads them as computed values and repaints when the theme revision moves; it never re-creates the chart for a theme change.

### Documents

Three tabs — research, announcements, and news — list what the gateway publishes about the selected instrument. One read is issued per instrument and channel, and the controller drops a response a newer read has already superseded, so switching tabs quickly never renders one channel's rows under another's label. Each channel fails on its own: a failure renders its code and a retry inside that tab without emptying the chart beside it, and the last successful channel keeps its rows while a newer read is in flight.

A row shows its title, the source and publication date that let a reader judge it, and the vendor's excerpt. The title links to the original document when the vendor supplied one; a channel that carries no links renders the same row as text rather than as a broken link. When the Host cut the excerpt at its configured bound, the row says so.

### The analysis session

One session serves every instrument. It is created the first time the reader asks for it, composed from the shipped `stock-analysis` preset, and remembered by the panel store, so browsing the list never creates a session and a follow-up question keeps its thread. The preset is selected while the session is still blank, because the Host refuses a composition swap once history exists under another one.

The selected instrument travels in the prompt itself — the panel prefixes the question with the instrument's name and thscode from its own dictionary — so the agent answers about what the reader is looking at without a per-instrument session. The composer sends through the session's own submission echo, so the question appears immediately and retires when the durable user message arrives.

The transcript renders the bounded prompt and response previews the session's Chat target already publishes, not another feature's node renderers: the client layering keeps one feature plugin from importing another's components, and the previews are the widest plain-text projection available. "Open in conversation" makes the analysis session current and leaves the panel, so a long analysis continues in the full conversation surface with every shipped affordance.

### Selection

The selected instrument lives in a declared store, not in component state, so switching to another panel and back returns to the instrument you were reading. Removing the selected instrument clears the selection; removing a different one leaves it. The analysis session's identity lives in the same store: returning to the panel makes it current again, and a session the Host no longer lists is forgotten.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Two layers

`controller.ts` is React-free: it owns the published quote batch and the phase of each read, performs the reads and mutations, and classifies every failure into a code. `WatchlistPanel.tsx` renders what those snapshots hold and calls the injected callbacks; it owns only the add flow, which no other surface observes.

The durable list itself is not copied into either. It stays in the `watchlist` Client model and reaches the render through the inject face's `hooks` compartment, so the panel holds one projection of it and no second authority.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | The plugin body: dictionaries, the navigation row, and the `main` registration |
| [`src/client/controller.ts`](src/client/controller.ts) | `WatchlistSurface`: the quote batch, read phases, supersession, and the add, remove, and search outcomes |
| [`src/client/store.ts`](src/client/store.ts) | The panel's view store: the selected instrument, the chart period, the document channel, and the analysis session |
| [`src/client/analysis.ts`](src/client/analysis.ts) | `AnalysisSession`: create, compose, select, resume, and prompt the one analysis session |
| [`src/client/AnalysisTranscript.tsx`](src/client/AnalysisTranscript.tsx) | The session-scoped transcript: the turn previews the Chat target publishes |
| [`src/client/failures.ts`](src/client/failures.ts) | The one failure-to-code rule every pane renders through |
| [`src/client/WatchlistPanel.tsx`](src/client/WatchlistPanel.tsx) | The panel, its rows, its add flow, and its failure surfaces |
| [`src/client/chart/index.ts`](src/client/chart/index.ts) | The chart wrapper: create, replace the series, repaint, dispose |
| [`src/client/chart/colors.ts`](src/client/chart/colors.ts) | Design tokens to concrete canvas colors |
| [`src/client/chart/styles.ts`](src/client/chart/styles.ts) | A palette to the library's style tree, as a pure function |
| [`src/client/CandleChart.tsx`](src/client/CandleChart.tsx) | The canvas element: build once, repaint on a theme change, replace on new bars |
| [`src/client/PanelIcon.tsx`](src/client/PanelIcon.tsx) | The navigation row's glyph |
| [`src/index.ts`](src/index.ts) | The Node half, which contributes no host behavior |
| — | No runtime invariant companion is published; the panel owns one projection of another service's state and reconciles nothing independently. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Watchlist controller](../../api/watchlist-controller/README.md) — the durable list this panel reads and mutates.
- [Stock controller](../../api/stock-controller/README.md) — the normalized market-data reads behind every quote.
- [Web Client Slots](../../../docs/subsystems/slots.md) — the registry and the props shares this panel composes from.
- [Sidebar shell](../ui-sidebar/README.md) — the navigation column whose panel list the row joins.
- [Layout](../ui-layout/README.md) — the `main` slot and the panel selection the row addresses.
- [Chat](../ui-chat/README.md) — the session-scoped `chat` hook whose turn previews the transcript renders.
- [Agent presets](../../preset/agent-presets/README.md) — the `stock-analysis` preset the analysis session is composed from.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser-side panel registers no tool, contributes no prompt section, and appends no session event. The analysis pane's question is an ordinary user turn sent through the session service, so this package adds nothing to a request that any other message does not.

#### KV Cache effect

None of its own. A question extends the session's cached prefix exactly as any other user message does, because the instrument context is part of that message rather than a separate prompt section.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The analysis transcript is a preview** — it renders the Chat target's bounded prompt and response previews, not the full transcript with tool rows, images, and process steps; that surface is one handoff away.
- **The analysis pane is not resizable yet** — it is a fixed-height block under the documents. The split ratio and the collapsed state the design calls for are panel view state that is not built.
- **Document channels are not cached** — each channel is read on selection and on tab switch; the per-instrument, per-channel cache the design calls for is not built.
- **Candle series are not cached either** — a period switch re-reads the series rather than reusing one already loaded for that instrument.
- **Fixed chart periods** — `1d`, `1w`, and `1mo` are the vendor's own intervals, and no client-side aggregation exists, so a period the vendor does not publish cannot be asked for.
- **The chart carries the charting library's bytes** — `klinecharts` is inlined into this plugin's browser bundle (about 105 KB gzip) and reaches every user whether or not the panel is opened, because the client module system has no lazy-loading path.
- **Volume and turnover are not rendered** — the wire types carry them, and no compact number format exists yet, so a surface that shows them needs one first.
- **No polling or push** — quotes refresh only on panel entry, on the rail control, on retry, and after a mutation; a stale price stays on screen until one of those happens.
- **One batch per refresh** — the whole list is quoted in one call, so the Host's batch cap bounds how many instruments the panel can quote at once rather than the list's length.
- **Rows are not reorderable yet** — the controller exposes `reorder`, and the panel has no drag affordance for it.
- **No chart overlays or extra indicators** — the drawing tools and indicator set the library ships are not surfaced; the pane shows moving averages and volume.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
