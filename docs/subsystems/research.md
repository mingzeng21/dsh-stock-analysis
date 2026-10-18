# Personal research library

English | [中文](research.zh.md)

The personal research library keeps original source material, reviewed wiki pages, and user-directed topic studies for the stock-analysis Web preset. One topic field starts an L1–L5 research Session; each completed report offers an explicit import action that retains its exact text and asks the Agent for reviewed Wiki proposals. Its Host controller owns a single durable storage domain; the browser panel and model tools read the same published snapshot.

## Records and publication

`ResearchSourceId` and `ResearchPageId` are stable branded ids. `AddResearchSourceRequest` admits original text, a URL, or file bytes; `AddResearchReportRequest` retains the exact report once per Session Turn. Sources are immutable after admission. `ResearchPageKind` selects entity, concept, topic, or source-note pages. `SaveResearchPageRequest` carries complete Markdown, source references, page links, and the expected predecessor revision. `SaveResearchStudyRequest` records the topic and Session id; its stage and notes fields also preserve existing studies. `ResearchSnapshot` contains published records, prior page revisions, pending Agent proposals, templates, and activity. The controller serializes whole-snapshot writes; a failed write leaves the previous published state visible.

The Agent stages page changes through `research_propose`. A person reviews and accepts each proposal before publication. Publication checks the predecessor revision and referenced ids. Restoring an earlier page creates a new revision and retains the displaced version. The graph draws explicit page links from the published snapshot; it does not infer facts or relationships from prose.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxresearchcontroller--researchcontroller"></a>

### `ctx.researchController` — `ResearchController`

Durable research state and the review gate for model-authored pages.

```ts cordis-catalog
/** Read the authoritative published research state.
 * @returns Current state, including pending proposals.
 */
current(): ResearchSnapshot

/** Return the full library to an authorized browser.
 * @param signal - Caller cancellation.
 * @returns The published state and pending proposals.
 */
@Remote snapshot(signal: AbortSignal): Promise<ResearchSnapshot>

/** Admit immutable original material.
 * @param request - Original text, URL, or file.
 * @param signal - Caller cancellation.
 * @returns State after the source is stored.
 */
@Remote async addSource(request: AddResearchSourceRequest, signal: AbortSignal): Promise<ResearchSnapshot>

/** Retain a completed research report once per Session Turn before wiki extraction.
 * @param request - Exact published report and its Session Turn.
 * @param signal - Caller cancellation.
 * @returns Stable original source id and current library.
 */
@Remote addReport(request: AddResearchReportRequest, signal: AbortSignal): Promise<ResearchReportReceipt>

/** Read exact saved original file bytes.
 * @param sourceId - Stored original source.
 * @param signal - Caller cancellation.
 * @returns Original file encoded as base64.
 */
@Remote async sourceFile(sourceId: ResearchSourceId, signal: AbortSignal): Promise<string>

/** Publish a user-authored page revision after checking its predecessor.
 * @param request - Page content and expected predecessor revision.
 * @param signal - Caller cancellation.
 * @returns State with the published page.
 */
@Remote savePage(request: SaveResearchPageRequest, signal: AbortSignal): Promise<ResearchSnapshot>

/** Restore a saved page version as a new revision.
 * @param pageId - Published page.
 * @param revision - Saved version to restore.
 * @param signal - Caller cancellation.
 * @returns State with the restored content published.
 */
@Remote restorePage(pageId: ResearchPageId, revision: number, signal: AbortSignal): Promise<ResearchSnapshot>

/** Save a user-directed topic study and its current stage.
 * @param request - Topic study fields.
 * @param signal - Caller cancellation.
 * @returns State with the saved study.
 */
@Remote saveStudy(request: SaveResearchStudyRequest, signal: AbortSignal): Promise<ResearchSnapshot>

/** Replace one page template.
 * @param kind - Template category.
 * @param markdown - Replacement template.
 * @param signal - Caller cancellation.
 * @returns State with the saved template.
 */
@Remote saveTemplate(kind: ResearchPageKind, markdown: string, signal: AbortSignal): Promise<ResearchSnapshot>

/** Stage a model-authored page for human review without publishing it.
 * @param request - Proposed complete page.
 * @returns State with the pending proposal.
 */
propose(request: SaveResearchPageRequest): Promise<ResearchSnapshot>

/** Publish a reviewed proposal if its predecessor is current.
 * @param proposalId - Pending proposal to publish.
 * @param signal - Caller cancellation.
 * @returns State with the proposed page published.
 */
@Remote acceptProposal(proposalId: string, signal: AbortSignal): Promise<ResearchSnapshot>

/** Discard a pending proposal without changing published pages.
 * @param proposalId - Pending proposal to discard.
 * @param signal - Caller cancellation.
 * @returns State without the proposal.
 */
@Remote rejectProposal(proposalId: string, signal: AbortSignal): Promise<ResearchSnapshot>
```

Source: [`packages/api/research-controller/src/index.ts`](../../packages/api/research-controller/src/index.ts)
<!-- END GENERATED cordis-surface -->
