---
description: "Model-facing personal research search, read, and reviewed wiki page proposal tools."
kind: "package-reference"
---

# @deepseek-ai/dsh-tool-research

English | [中文](README.zh.md)

## Summary

Mount this package inside `stock-analysis` to let its Agent consult the personal research library and submit page edits for human review. It requires `tools` and the Host's `researchController`.


## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Use this package

`research_search` searches published page titles, summaries, bodies, and saved source text. `research_read` reads one exact page or source id in bounded chunks; callers pass `nextOffset` to continue. `research_propose` stages a complete Markdown page with source and page references; it never publishes. The Research Lab panel owns acceptance and rejection. Search and read results obey the configured `maxSearchResults` and `maxResultChars` bounds. A URL-only source yields metadata rather than an invented page body.

## Understand the implementation

The controller validates referenced ids when a proposal is submitted and again when an existing page is published. No runtime invariant companion is published because this tool package keeps no separate search index or revision state.

## Further Exploration

- [Research controller](../../api/research-controller/README.md) owns the durable library and review gate.

## Dev Note

The package README and its Chinese pair describe the shipped behavior; generated catalogs own exhaustive configuration and tool schemas.

## Model Experience

### Research tools

#### What the model sees

The model receives `research_search`, `research_read`, and `research_propose` schemas. Search and read results are bounded JSON text; proposed pages stay pending until a user publishes them.

#### Token effect

The three tool schemas appear in each request composed with this package. A call adds its bounded result to that turn.

#### KV Cache effect

The schemas keep a stable prefix while the mounted preset and package version stay the same; tool results affect later request suffixes.

## Known Limitations and Deferred Work

- Search uses case-insensitive substring matching over the bounded library; no semantic or full-text index is built. PDF images have no OCR, and a file-only source offers metadata until text is supplied or extracted.
