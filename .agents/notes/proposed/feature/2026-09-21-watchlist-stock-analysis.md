# Agent Note: Watchlist stock-analysis panel for the Web client

Status: proposed

English | [中文](2026-09-21-watchlist-stock-analysis.zh.md)

## Problem

The harness can already read A-share market data and already ships an agent that knows how to use it: the `web-app` composition mounts `ctx.stock` with the 同花顺 market-data provider and the 问财 research gateway, and the `stock-analysis` agent preset gives one session every registered capability as a native tool. Both are model-facing only. A person using the Web client cannot keep a list of instruments, look at one, read its candles, research reports, announcements, and news, and ask the agent about it without composing a chat message that carries the whole context by hand.

Two shipped mechanisms would carry that experience and neither has ever been exercised.

`main` is a root-scoped keyed slot whose only occupant in the shipped composition is `conversation`, and `sidebar.panellist` is a root-scoped list whose rows select a `main` key through `ctx.layout.selectPanel`. Together they are the Web client's global-panel mechanism, owned by [Global main panels without default UI additions](../../implemented/architecture/2026-09-08-global-main-panels.md), which records that the shipped composition registers no panel entry — the mechanism exists, is typed, is tested, and no product surface has ever used it.

`ctx.stock` is host-plane. Capabilities are reachable from an agent, from a host plugin, or from nothing at all; the browser has no Remote namespace that returns a candle series, a quote batch, or a document list, and the seam deliberately keeps vendor field names, which is a row format no view should render directly.

There is also no durable place to keep a personal instrument list. `ctx.storageDomain` backs workspace records and session sidecars on the host; nothing user-owned and browser-visible uses it.

The mechanism's own note records what an occupant inherits: an extension panel has no right Sidebar, panel selection is transient, and the shipped composition registers no panel entry at all. This proposal accepts the first two, and it is the first occupant of the third — a product decision, because the mechanism itself still adds no navigation control or reserved space to the default application.

What the first occupant does expose is that the list has no conversation row. Nothing in the repository calls `selectPanel(null)`, and `ui-sidebar-right` and `DocumentTitle` both key off `activePanelId === null`, so once a panel exists the conversation is addressable only by the code that left it. A panel is also on its own for a header, because the frame's center column renders the `main` entry and nothing else.

## Proposal

Add a watchlist panel: one global-panel Tab that combines a personal instrument list, a candlestick chart, the instrument's documents, and an inline agent conversation.

### Placement and Tab semantics

The panel registers two slots for its own lifetime, inside one `ctx.effect`:

```ts ignore-check
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
  { name: 'sidebar.panellist', id: 'watchlist', order: 10, label: () => t('panel.nav') },
  WatchlistPanelIcon,
))
ctx.slots.inject('main', () => ctx.slots.register(
  { name: 'main', key: 'watchlist', locale: NS, store, inject: injectProps },
  WatchlistPanel,
))
```

The rows beside it stay the product's own: `sidebar.panellist` is a list, so this contributes an additive row instead of replacing the shell.

Completing the Tab strip is part of this proposal rather than a later cleanup, because a navigation row that cannot be left is not a Tab. Three small changes make the conversation a peer row:

| File | Change |
|---|---|
| `packages/client/ui-conversation/src/client/` | Register the reserved `conversation` panellist row, so the strip lists "conversation" and "watchlist" as peers |
| `packages/client/ui-layout/src/client/service.ts` | Normalize `selectPanel('conversation')` to the `null` the layout store already means by "the conversation", so `panelInfo`, `DocumentTitle`, and the right column keep their existing semantics |
| `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | Treat the reserved row's `active` state as `activePanelId === null` |

`ui-layout` owns the reservation and names it in `CONVERSATION_MAIN_KEY`, but a feature package may not import another feature package's values and may not widen `dsh.client.external` to obtain them. `ui-conversation` (the row id and its own `main` key) and `ui-sidebar` (the row's selection comparison) therefore each spell the same reserved string behind a locally declared constant whose comment names the owner. That is the price of the rule, not an oversight; it replaces the two loose literals the frame and the conversation already carried.

The alternative — a "back to conversation" button owned by the panel — is recorded under Alternatives considered.

This is a peer row in the one existing selection list, not the second navigation stack the mechanism note rejected. There is still one `panelInfo.activePanelId`, no history, and no saved return destination; what that note called unnecessary was a back button plus a remembered destination, and a row that addresses the conversation exactly the way every other row addresses its panel needs neither.

### Panel layout

The panel is the center column, so it draws its own header and its own internal geometry.

- **Left rail** — the watchlist: rows carry the instrument name, ticker, last price and change, with add and remove affordances and a reorder handle. Adding opens a search box backed by symbol disambiguation; a query that matches several instruments lists every candidate rather than guessing a market suffix.
- **Right side** — the selected instrument, split vertically. The upper part is the chart with a period switch, the lower part is a document list with `report`, `announcement`, and `news` tabs.
- **Agent conversation** — a resizable, collapsible pane below the documents; the split ratio and the collapsed state are panel view state, not durable data.

Selecting a different row never discards the analysis pane's scroll or the document tab; per-instrument chart and document results are cached in the panel store and refetched only when stale.

### Package topology

| Package | Responsibility |
|---|---|
| `packages/api/stock-controller` | Host `stock` Remote namespace and its Client model: symbol search, quote batches, candle series, and document search over `ctx.stock` |
| `packages/api/watchlist-controller` | Host `watchlist` Remote namespace and its Client model: the durable personal instrument list over `ctx.storageDomain` |
| `packages/client/ui-watchlist` | The Tab: panellist row, `main` registration, instrument list, chart module, document lists, agent conversation, panel store, and zh/en dictionaries |

The chart lives inside `ui-watchlist` as a module (`src/client/chart/`) rather than as its own package, because it has exactly one consumer; it is written against a narrow input (a candle array plus theme tokens) so promoting it later is a move rather than a rewrite.

### Market-data surface

`ctx.stock` exposes 82 vendor capabilities and keeps vendor field names on purpose. The [stock seam note](../../implemented/architecture/2026-09-14-stock-market-data-capability-seam.md) rejects a canonical result type per capability "for now: no current consumer reads those fields, and fixing 82 shapes before one exists would encode the wrong model"; the watchlist is that consumer. Normalization therefore happens in a new consumer, once, in the controller, and the browser never sees a vendor row. The seam itself does not change.

```ts ignore-check
interface InstrumentMatch {
  thscode: string
  ticker: string
  name: string
  assetType?: string
  exchange?: string
}

interface QuoteBatch {
  asOf?: number
  quotes: Quote[]
}

interface Quote {
  thscode: string
  last: number
  change: number
  changePct: number
  open: number
  high: number
  low: number
  prevClose: number
  volume: number
  turnover: number
}

interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface DocumentRow {
  kind: 'report' | 'announcement' | 'news'
  title: string
  source?: string
  publishedAt: number
  summary: string
  summaryTruncated: boolean
  url?: string
}
```

Four reads back the surface, each a thin composition over one or two seam capabilities:

| Remote method | Seam capabilities | Notes |
|---|---|---|
| `stock.searchSymbols({ query, limit })` | `meta.tickers.search` | Cross-market disambiguation; returns candidates, never a guessed suffix |
| `stock.quotes({ thscodes })` | `a-share.prices.snapshot` | One batched call for every visible row |
| `stock.candles({ thscode, interval, adjust, start, end })` | `a-share.prices.historical` | `interval` is the vendor's own `1d`/`1w`/`1mo`, so period switching needs no client aggregation |
| `stock.documents({ name, kind, size })` | `iwencai.search.report`, `iwencai.search.announcement`, `iwencai.search.news` | The gateway takes a natural-language `query` and matches on text rather than on an instrument identity, so the controller composes the query from the display name and the channel's own word |

Every seam failure keeps its `StockError` code and reaches the browser as a `stock/*` Remote failure, so the panel branches on a code instead of a message. A capability the vendor has closed (`availability !== 'open'`) surfaces as the seam's own `STOCK_CAPABILITY_CLOSED` rather than an empty list, because an empty list would read as "this instrument has no announcements".

### Watchlist durability

The list is user data, not configuration, so it belongs in `ctx.storageDomain` beside workspace records rather than in a settings namespace, and it is host-owned so a later agent-facing tool can read the same list the browser shows.

```ts ignore-check
interface WatchlistEntry {
  thscode: string
  name: string
  order: number
  addedAt: number
}
```

Order and records are two halves of one fact, so the domain holds them as one durable value — a `global` singleton listing the entries in display order — and declares no record table. That makes every mutation a single durable write, which is what removes the interleaving in which the two could disagree.

`watchlist.list()`, `watchlist.add({ thscode })`, `watchlist.remove({ thscode })`, and `watchlist.reorder({ thscodes })` are the whole mutation surface, and every mutation answers with the complete new list rather than a delta, so the browser replaces one authoritative value instead of merging increments. Adding resolves the symbol through the stock seam first, so an unresolved instrument fails with `watchlist/unknown-symbol` instead of entering the list as an unrenderable row. Duplicate adds fail with `watchlist/duplicate`; removing an absent instrument fails with `watchlist/not-found`. Both are user-visible outcomes of a stale browser tab, not wiring mistakes, so both are declared codes rather than throws.

### Chart rendering

The chart is `klinecharts` (Apache-2.0, zero dependencies, actively maintained). It is a K-line library rather than a generic charting library: it ships the crosshair, the zoom and pan, the volume pane, and the built-in indicator set this feature needs (MA, EMA, VOL, MACD, BOLL, KDJ, RSI, SAR, BIAS, DMI, OBV), plus a `zh-CN` locale. Its distribution contains no dynamic `import()` and no worker or WebAssembly payload, so it inlines into a client bundle's CommonJS factory without a runtime surprise; the panel's bundle is about 105 KB gzip with it.

Version 10 is pull-based: the chart asks a data loader for bars rather than accepting a pushed array, so the wrapper holds the current series and answers every request from it, and replacing the series is one `resetData`. Because a canvas cannot resolve a CSS variable, the wrapper reads the `--dsw-*` tokens as computed values and repaints through `setStyles` when the theme revision moves, rather than rebuilding the chart.

The deciding difference from `lightweight-charts` is the license, not the code: that library's Apache-2.0 distribution carries a NOTICE requiring the integrator to name TradingView as the product creator and link to `tradingview.com` on the page the user sees. A charting library that requires a third-party brand inside our own analysis surface is a product commitment we should not make for a feature that a permissively licensed alternative already covers.

A charting dependency is a genuine net deletion here, not a capability purchase. The hand-rolled version of this surface — candles, axes, volume, crosshair hit-testing, zoom, and one moving average — is the part of the panel most likely to accumulate edge cases we would then own and test. The library is declared as a `devDependencies` entry of `ui-watchlist`, exactly as `packages/client/ui-sidebar-documentpreview` declares `pdfjs-dist` and `shiki`, and `pnpm run gen-third-party-notices` records it.

The chart module owns the boundary in one direction only: it receives candles, a period, and resolved theme colors, and returns a canvas. It does not call Remote, read the panel store, or know a thscode.

### Agent conversation

The conversation pane reuses the shipped session machinery instead of inventing a chat client.

The panel owns one dedicated analysis session, created lazily the first time a question is asked, composed from the shipped `stock-analysis` preset through the existing `agentPresets/select` path, and stored in the panel store. One session is shared across instruments rather than one session per instrument: the selected instrument travels in the prompt as explicit context (`当前标的：贵州茅台 600519.SH`) and in the conversation history, so browsing the list never creates sessions and follow-up questions keep their thread.

The chat body renders through a child slot the panel declares with `session` scope, which is allowed for a root-scoped entry — `main.conversation` declares `conversation.session` the same way. The framework's `SessionProvider` then binds that body to the current session, and `useChat`, the session-scoped standard hook `ui-chat` already provides to every session-scoped slot, supplies the assembled transcript snapshot. The body renders a compact transcript, and the composer is a plain input that registers a submission echo through `ISession.beginSubmission` and sends through `ISession.prompt`, so a question travels the same durable path as any other prompt and the agent's answer is an ordinary logged turn.

Because `SessionProvider` follows the current selection, asking a question makes the analysis session current; the panel store records that identity and `ctx.sessions.open(id)` restores it on the next visit. A "open in conversation" action calls the same selection and then `ctx.layout.selectPanel(null)`, so a long analysis continues in the full conversation surface with every shipped affordance. The analysis session deliberately uses the same instrument as the working directory: the current session's workspace, then the most recent workspace, matching how the sidebar's New Session resolves one.

### Data and refresh policy

The panel loads the list baseline once, then one batched `quotes` call for every visible row. Quotes refresh on panel entry, on manual refresh, and after an add; the first version runs no timer and no server push, because the seam publishes no subscription and polling a vendor that states no rate contract is worse than a price the user can see is stale through its `asOf`.

Candles and documents load on selection and are cached per `(thscode, interval)` and `(thscode, kind)`. A seam failure renders inside the affected pane with its code and a retry, and never empties a neighbouring pane.

### Delivery stages

1. Land both host controllers with their failure codes, the Client models, and the Remote generation. This layer depends on no product decision and is what everything else consumes.
2. Land the Tab: the panellist row, the `main` registration, the conversation row and its normalization, the instrument list, add and remove, the batched quote column, and the locale dictionaries.
3. Land the chart module and the instrument header over `stock.candles`.
4. Land the document lists over `stock.documents`.
5. Land the agent conversation: the dedicated session, the `SessionProvider` child body, the compact transcript, the composer, and the "open in conversation" handoff.

All five stages are built: both Host controllers with their Client models; the Tab with its list, quotes, add and remove; the chart module over `stock.candles`; the document channel tabs over `stock.documents`; and the analysis pane, which creates one session from the `stock-analysis` preset, prompts it with the selected instrument as prompt context, renders the Chat target's turn previews, and hands off to the conversation. One acceptance criterion is unverified locally: the answer itself needs a model key, so only the question, the session, the preset selection, and the handoff have been exercised against a real Host. The pane also renders the transcript only while its own session is the current one, because the session-scoped area binds to the current selection; the composer is a plain form rather than the shipped composer, and the pane's split ratio and collapsed state are fixed rather than stored.

## Alternatives considered

**Reuse the right Sidebar's tab-type registry instead of a global panel.** A `ctx.sidebarRightTabs` kind would place the analysis beside the conversation and reuse the docking surface. Rejected because that surface is per-session and inside the conversation's own column, so a watchlist would appear once per session and vanish whenever a panel is selected; the three-pane layout the feature needs does not fit a 300px column; and the right column is deliberately mounted only while the conversation is selected, which is exactly the state a dedicated Tab leaves.

**Let the panel render the full Chat view by extending the slot runtime.** `SessionProvider` could take an explicit session identity, after which a root panel could embed a conversation it owns. Rejected as insufficient on its own: the Chat renderer is registered by `ui-chat` into `conversation.view`, which `ui-conversation` declares, so embedding the real view also requires making that shell embeddable — three core packages changed to avoid writing one compact transcript and one input.

**Keep the panel-local "back to conversation" button and leave the Tab strip alone.** Rejected because it leaves the mechanism half-built for the next occupant: the conversation becomes unaddressable from the navigation list, and no future panel would fix that either. The [mechanism note](../../implemented/architecture/2026-09-08-global-main-panels.md) rejected a back button *plus a remembered destination*; a peer row needs neither, and the whole change is three files and one reserved id.

**Serve market data by exposing the seam directly to the browser.** A Remote namespace that forwards `ctx.stock.call(id, params)` would need no per-capability work and would let the client follow the vendor catalog. Rejected because it puts 82 vendor row shapes, vendor parameter vocabularies, and vendor capability ids into the browser, and makes every future vendor change a client change. The browser gets four narrow reads with normalized types.

**Store the watchlist in the browser.** `localStorage` needs no host package and works today. Rejected because the list then differs per browser and per machine, survives no profile migration, and is invisible to the agent that is supposed to reason about it in the same product.

**Draw the chart ourselves with SVG.** No dependency, exact theme tokens, and full control of the interaction model. Rejected under the repository's dependency policy: the deleted surface is real (candles, axes, volume, crosshair, zoom, indicators) and the maintained library is healthy, zero-dependency, and permissively licensed, so the swap genuinely shrinks what we own.

## Acceptance criteria

- The sidebar lists a conversation row and a watchlist row; either selects the center column; the selected row is the active one; and the browser title and the right column behave exactly as they do today when the conversation row is selected.
- Adding an instrument resolves it through symbol disambiguation and refuses an unresolved or duplicate entry with its declared code; removing and reordering persist; a reload, a second browser, and a restarted host all show the same list.
- The list shows a batched quote per row with the seam's `asOf`; a vendor failure renders a code and a retry without emptying the list.
- Selecting an instrument renders candles for the selected period with no client-side aggregation, and renders the instrument's reports, announcements, and news from the gateway, each tab failing independently.
- The agent pane asks a question about the selected instrument, the answer is an ordinary logged turn in the analysis session, and "open in conversation" lands in that session with its full history. Switching instruments never creates a session and never loses the thread.
- No vendor field name, vendor capability id, or vendor parameter name appears in any client-side type consumed by the panel.
- Loading the plugin disposes its panellist row, its `main` registration, and its stores through the owning fiber, and the layout falls back to the conversation because `retainMainPanels` no longer lists the key.
- Client component tests cover the list, add and remove, the quote column, the chart module's pure inputs, the document tabs, and the composer; the client catalog, the i18n gate, the Cordis config gate, and the third-party notices are regenerated; and the GUI change carries a recorded GIF.

## Risks

The panel is the first occupant of a mechanism with no shipped precedent, so its rough edges become design precedent. The conversation row and the `selectPanel` normalization are the minimum that makes the mechanism usable; anything beyond that should wait for a second panel rather than be generalized from one.

Opening a panel removes the right column, because the right Sidebar mounts only while the conversation is selected. The [mechanism note](../../implemented/architecture/2026-09-08-global-main-panels.md) records that as an accepted consequence rather than an oversight, and this proposal keeps it: documents render inside the panel and cannot be floated beside the conversation. Relaxing that rule touches `ui-sidebar-right`'s ownership of its own visibility and is out of scope here.

Making the analysis session current is a global selection with visible effects: the session list highlights it, and the sidebar's session browser follows it. A user who opens the watchlist and switches back to the conversation lands on the analysis session rather than the session they left. The panel store restores the previous session on leaving only if the user left from the conversation; both behaviors are defensible and only usage will settle which is right.

`klinecharts` is a smaller project than the largest alternatives (roughly 4k stars against 17k), which is a maintenance risk. It is offset by zero dependencies, an active release cadence, and a small integration surface: the chart module depends on its create, data-loader, and indicator APIs and nothing else, so replacing it means rewriting one module behind an unchanged interface.

The gateway's document search takes a natural-language query rather than an instrument identity, so relevance and ordering are the vendor's. A query built from a name and ticker can return a document about a different instrument whose text mentions both; the panel therefore shows the source and time so a user can judge a row instead of trusting the list.

The chart dependency is inlined into a boot-preloaded client bundle, so its bytes reach every user whether or not the tab is opened. At roughly 100KB gzip that is measurable but small beside the shipped `ui-sidebar-documentpreview` bundle, and the client module system has no lazy-loading path to spend instead.
