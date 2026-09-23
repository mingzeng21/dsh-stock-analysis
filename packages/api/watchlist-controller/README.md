---
description: "The durable personal instrument list as a storage-domain-backed Remote namespace: list, add, remove, and reorder for a watchlist of complete thscodes."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-watchlist-controller

English | [中文](README.zh.md)

## Summary

Use this package when a browser surface keeps a personal list of instruments. It stores one ordered list of complete thscodes through the [storage-domain facility](../../storage/storage-domain/README.md), so the list survives a host restart, a browser change, and a profile move, and it exposes the four mutations a list needs over the `watchlist` Remote namespace. Adding resolves the instrument through the [stock capability seam](../../stock/stock/README.md) first, so an entry always carries the display name every surface renders. The service registers no tool and contributes no prompt.

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

Mount the package beside `dsh-storage`, a backend, `dsh-storage-domain`, and `dsh-stock`. A Client calls `remote.watchlist.list()`, `add({ thscode })`, `remove({ thscode })`, or `reorder({ thscodes })`; no method takes a Session, because the list belongs to the person rather than to a conversation.

| Method | Returns | Purpose |
|---|---|---|
| `list()` | `readonly WatchlistEntry[]` | The whole list, in display order |
| `add({ thscode })` | `readonly WatchlistEntry[]` | Resolve the instrument and append it |
| `remove({ thscode })` | `readonly WatchlistEntry[]` | Drop one entry |
| `reorder({ thscodes })` | `readonly WatchlistEntry[]` | Replace the order |

### Every mutation returns the whole list

The list is small and is always read whole, so a mutation answers with the complete new list rather than a delta. That makes the browser's projection a wholesale replacement of one authoritative value and removes the merge rules a per-entry increment would need. Reads come from the loaded domain value, so the answer costs no persistence access.

### Addition resolves before it stores

`add` resolves the thscode through the seam's symbol disambiguation and stores the resolved display name. An instrument the seam does not know never enters the list as an unrenderable row: it fails with `watchlist/unknown-symbol`. A thscode that matches a candidate differing only in case is accepted, and the vendor's own spelling is what the list keeps.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `maxEntries` | `200` | Inclusive cap on list entries; adding beyond it fails instead of growing the list |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-api-watchlist-controller) is the exhaustive source for every accepted field and its JSDoc.

### Failures

Each failure is one `RemoteError` code with typed details; callers branch on the code and never on message text.

| Code | Details | Meaning |
|---|---|---|
| `watchlist/duplicate` | `{ thscode }` | The instrument is already on the list |
| `watchlist/not-found` | `{ thscode }` | No entry carries that thscode |
| `watchlist/unknown-symbol` | `{ thscode }` | The seam resolved no instrument for it |
| `watchlist/lookup-failed` | `{ thscode, reason }` | The seam failed before resolution; `reason` is its own code |
| `watchlist/limit-reached` | `{ maxEntries }` | The list already holds as many entries as this deployment allows |

A duplicate and a missing entry are outcomes of a browser tab holding a stale list, not wiring mistakes, so both are declared codes rather than thrown programming errors. `reorder` refuses a list that does not name every entry exactly once, or that names an unknown entry, with `gateway/bad-request`.

### Client model

The browser export provides `ctx.watchlist` and requires `remote` and `remote.watchlist`. The model owns one observable snapshot of the list and publishes the Host's answer from every successful command; a failed command throws the Gateway's failure and leaves the published list untouched. It does not read on construction, so a surface that needs the list calls `refresh()` and renders its own loading and failure states rather than the model producing an unobserved rejection.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### One durable value, not two

Order and records are two halves of one fact, so the domain keeps them in one document: a global singleton holding the entries in display order. A mutation is therefore a single durable write, and there is no interleaving in which the order and the records could disagree — which is why this domain needs neither a pending-mutation marker nor a load-time repair path, and why it declares no record table. The [workspace registry](../../workspace/workspace/README.md) keeps a keyed table instead because it looks records up by id and reconciles them against session persistence; this list is only ever read and written whole.

### Serialized mutations

Mutations run on one chain, so an addition's read of the current list and its write are one step and two concurrent additions cannot both observe the same predecessor. The symbol lookup runs inside that step, so a slow lookup delays later mutations instead of letting them overtake it.

### Cancellation

The seam's symbol lookup and the domain write are both non-cancellable, so a call whose signal is already aborted is refused at the entry point with `gateway/cancelled` rather than pretending the work can be interrupted mid-flight.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `WatchlistController`: the `watchlist` service and Remote namespace, `Config`, the four operations, the symbol resolution, and the serialized mutation chain |
| [`src/spec.ts`](src/spec.ts) | The domain declaration: record schema and the `defineDomain` spec |
| [`src/types.ts`](src/types.ts) | Wire vocabulary, published as `./types` for Client packages |
| [`src/client/index.ts`](src/client/index.ts) | Browser plugin and the `ctx.watchlist` model |
| — | No runtime invariant companion is published; the loaded order and the stored entries are one value, so no independent observation can diverge, and the domain's own schema validation runs at the durable boundary. |

Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Stock market data](../../stock/stock/README.md) — the seam that resolves an added instrument.
- [Storage domain form](../../storage/storage-domain/README.md) — `defineDomain`, opening a domain, and durable write semantics.
- [Workspace registry](../../workspace/workspace/README.md) — the sibling durable consumer that needs a record table and a recovery marker.
- [Adding a Remote API](../../../docs/cookbook/adding-a-remote-api.md) — the five steps this package's Host and Client faces follow.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **One list per host** — there is no grouping, no second list, and no per-workspace or per-Session scope; the domain name is a single singleton.
- **No model-facing reader** — the agent cannot read the list yet; a tool over this service is what would expose it, and the service is host-owned so that tool can reuse it.
- **The list is whole-value write** — every mutation rewrites the entire stored document, so a very large list costs a proportional write; `maxEntries` bounds that and nothing compresses or diffs it.
- **Addition is a lookup plus a write** — an upstream lookup failure costs the caller the attempt and returns `watchlist/lookup-failed` rather than queueing the instrument for later.
- **No concurrency token** — two browsers editing the list both succeed, and the later write wins; the model replaces its snapshot with the Host's answer, so the loser sees the newer list rather than a conflict.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
