# 个人研究知识库

[English](research.md) | 中文

个人研究知识库为股票分析 Web 预设保存原始资料、经过审阅的 Wiki 页面和用户发起的专题研究。用户输入一个主题词即可启动 L1–L5 研究会话；每份完成的报告都提供明确的录入按钮，保存报告原文并要求 Agent 生成待审阅的 Wiki 提案。宿主控制器管理一个持久存储领域；浏览器面板和模型工具读取同一份已发布快照。

## 记录与发布

`ResearchSourceId` 和 `ResearchPageId` 是稳定的品牌 ID。`AddResearchSourceRequest` 摄入原始文本、网址或文件字节；`AddResearchReportRequest` 按 Session 轮次只保存一次完整报告。资料摄入后不可修改。`ResearchPageKind` 区分实体、概念、主题和来源摘要页。`SaveResearchPageRequest` 携带完整 Markdown、资料引用、页面关联以及预期的前一版本。`SaveResearchStudyRequest` 记录主题与 Session ID；阶段和笔记字段也用于保留已有专题。`ResearchSnapshot` 包含已发布记录、页面历史版本、待审阅提案、模板与操作记录。控制器串行写入完整快照；写入失败时继续保留上一份已发布状态。

Agent 通过 `research_propose` 暂存页面修改。用户逐条审阅并接受后才会发布。发布时核对前一版本和引用 ID。恢复旧版会创建一个新版本，并保留被替换的版本。关系图只绘制已发布页面的显式关联，不从正文推断事实或关系。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
