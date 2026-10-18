---
description: "Host-owned personal research library: immutable source admission, published wiki pages, topic studies, revision history, and reviewed Agent proposals."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-research-controller

English | [中文](README.zh.md)

## Summary

This package owns the personal research library used by the Web panel and the `stock-analysis` Agent. It stores original text or file references, published Markdown pages, topic studies, page revisions, pending Agent proposals, templates, and activity in one `personal_research` storage domain. A mutation writes one complete snapshot before it becomes visible. Original source records have no edit or delete operation.


## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

Mount it once on the Host beside `storageDomain` and `attachments`. The `research` Remote namespace provides `snapshot`, `addSource`, `addReport`, `sourceFile`, `savePage`, `restorePage`, `saveStudy`, `saveTemplate`, `acceptProposal`, and `rejectProposal`. `addReport` retains one exact completed report per Session Turn as an immutable text source and returns its source id; repeating that Turn returns the existing source without replacing its text. The model-side `propose` method stages a page without publishing it. A proposal against an existing page records its revision and fails with `research/conflict` if that page changes before acceptance. Direct page edits also require the exact preceding revision. `restorePage` publishes an earlier version as a new revision and retains the displaced version in history.

`addSource` accepts pasted text, an HTTP(S) URL, or a base64 file. File bytes enter the durable attachment store before the source record is published. PDFs with selectable text and UTF-8 Markdown, text, or HTML files also receive extracted text for Agent reading; a scanned PDF keeps its original file but has no extracted text. A URL alone stores its address, not the page body. The browser caps uploads at 5 MB, matching the shipped Host default; Host `Config` owns the actual file, text, page, and source limits. `sourceFile` verifies and returns exact saved bytes.

The storage domain uses one JSON document under the shipped `$DSH_HOME/storages` root. This keeps multi-page publication, the activity log, and the generated index consistent through one durable write. The browser derives `wiki/index.md` and `wiki/log.md` views from the published pages and activity; they are not independent records.

## Understand the implementation

`src/spec.ts` validates every record when the domain opens. `src/index.ts` serializes writes; a failed write leaves the preceding snapshot visible. `src/types.ts` carries stable branded source, page, and study ids over the Remote boundary. No runtime invariant companion is published because the domain global is the sole authoritative observation.

## Further Exploration

- [Storage domains](../../storage/storage-domain/README.md) own durable writes and version checks.
- [Local attachments](../../attachment/attachment-local/README.md) own immutable original file bytes.
- [Personal Research Lab UI](../../client/ui-research/README.md) renders the directory, studies, and graph.

## Dev Note

The package README and its Chinese pair describe the shipped behavior; generated catalogs own exhaustive configuration and tool schemas.

## Model Experience

Indirectly, through dsh-tool-research when an Agent reads saved material or proposes a page.

#### KV Cache effect

The stored library does not enter every request; tool calls add only their bounded results.

## Known Limitations and Deferred Work

- The whole library is rewritten on each mutation, so `maxPages` and `maxSources` bound its size. File transfer uses base64 Remote calls and is limited to 5 MB by default. PDF extraction reads selectable text only. Stored raw files have no automatic deletion or cross-device sync. The library is one per Host, not one per Workspace or Session.
