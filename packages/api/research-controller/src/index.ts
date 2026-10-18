/** Host-owned personal research library and browser Remote namespace. */
import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-attachment'
import type { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { researchDomainSpec } from './spec.ts'
import type {
  AddResearchReportRequest, AddResearchSourceRequest, ResearchActivity, ResearchPage, ResearchPageId, ResearchPageKind,
  ResearchProposal, ResearchSnapshot, ResearchSource, ResearchSourceId, ResearchStudy,
  ResearchStudyId, ResearchReportReceipt, SaveResearchPageRequest, SaveResearchStudyRequest,
} from './types.ts'

export type * from './types.ts'
export { researchDomainSpec } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Personal research library shared by browser and agent tools. */
    researchController: ResearchController
  }
}

/** Deployment bounds on admitted and retained research content. */
export interface Config {
  /** Maximum original file bytes accepted by one browser call. */
  readonly maxFileBytes: number
  /** Maximum text characters in one source or page. */
  readonly maxTextChars: number
  /** Maximum published pages. */
  readonly maxPages: number
  /** Maximum original sources. */
  readonly maxSources: number
}

/** Refuse empty or overlong user and model text at the owning operation. */
function required(value: string, max: number, label: string): string {
  const text = value.trim()
  if (text === '' || text.length > max) {
    throw new RemoteError('gateway/bad-request', `${label} must contain 1–${max} characters`, {})
  }
  return text
}

/** Refuse a call already cancelled by its carrier. */
function live(signal: AbortSignal): void {
  if (signal.aborted) throw new RemoteError('gateway/cancelled', 'research call cancelled', {})
}

/** Resolve one validated item id from a published collection. */
function present<T extends { readonly id: string }>(items: readonly T[], id: string): T {
  const found = items.find(item => item.id === id)
  if (found === undefined) throw new RemoteError('research/not-found', `research item ${id} was not found`, { id })
  return found
}

/** A new activity row for the published operation. */
function activity(action: ResearchActivity['action'], title: string): ResearchActivity {
  return { id: randomUUID(), at: Date.now(), action, title }
}

/** Extract selectable PDF text while retaining the original bytes separately. */
async function extractPdfText(bytes: Uint8Array, maxChars: number): Promise<string | undefined> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const document = await loading.promise
  try {
    const parts: string[] = []
    let length = 0
    for (let number = 1; number <= document.numPages && length < maxChars; number++) {
      const page = await document.getPage(number)
      const content = await page.getTextContent()
      const text = content.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ')
      parts.push(text)
      length += text.length
    }
    const text = parts.join('\n').slice(0, maxChars).trim()
    return text === '' ? undefined : text
  } finally {
    await loading.destroy()
  }
}

/** Durable research state and the review gate for model-authored pages. */
export class ResearchController extends TypertRemoteService {
  static inject = ['storageDomain', 'attachments']
  static Config: z<Config> = z.object({
    maxFileBytes: z.number().step(1).min(1).default(5_000_000),
    maxTextChars: z.number().step(1).min(1).default(100_000),
    maxPages: z.number().step(1).min(1).default(500),
    maxSources: z.number().step(1).min(1).default(200),
  })

  private global?: DomainGlobal<ResearchSnapshot>
  private chain: Promise<unknown> = Promise.resolve()

  /** @param ctx - Host context with durable domain and file attachments. @param config - content bounds. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'researchController', { namespace: 'research' })
  }

  /** Open the authoritative library before any Remote call. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(researchDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'research.domainClose')
    this.global = domain.global
  }

  /** Read the authoritative published research state.
   * @returns Current state, including pending proposals.
   */
  current(): ResearchSnapshot {
    if (this.global === undefined) throw new Error('research domain is not open')
    return this.global.get()
  }

  /** Return the full library to an authorized browser.
   * @param signal - Caller cancellation.
   * @returns The published state and pending proposals.
   */
  @Remote
  snapshot(signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return Promise.resolve(this.current())
  }

  /** Admit immutable original material.
   * @param request - Original text, URL, or file.
   * @param signal - Caller cancellation.
   * @returns State after the source is stored.
   */
  @Remote
  async addSource(request: AddResearchSourceRequest, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    const title = required(request.title, 240, 'title')
    if (request.text === undefined && request.fileBase64 === undefined && request.url === undefined) {
      throw new RemoteError('gateway/bad-request', 'source content or URL is required', {})
    }
    if (request.text !== undefined && request.text.length > this.config.maxTextChars) {
      throw new RemoteError('gateway/bad-request', 'source text exceeds the configured limit', {})
    }
    if (request.url !== undefined && (request.url.length > 2048 || !/^https?:\/\//i.test(request.url))) {
      throw new RemoteError('gateway/bad-request', 'source URL must be HTTP or HTTPS', {})
    }
    if (request.fileName !== undefined && request.fileName.length > 255) {
      throw new RemoteError('gateway/bad-request', 'file name is too long', {})
    }
    if (this.current().sources.length >= this.config.maxSources) {
      throw new RemoteError('research/limit-reached', 'source limit reached', { limit: this.config.maxSources })
    }
    let file: ResearchSource['file']
    let extractedText = request.text
    if (request.fileBase64 !== undefined) {
      const encoded = request.fileBase64
      if (encoded.length > Math.ceil(this.config.maxFileBytes / 3) * 4) {
        throw new RemoteError('research/limit-reached', 'source file exceeds the configured limit', { limit: this.config.maxFileBytes })
      }
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new RemoteError('gateway/bad-request', 'invalid file encoding', {})
      }
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.byteLength > this.config.maxFileBytes || bytes.byteLength === 0) {
        throw new RemoteError('research/limit-reached', 'source file exceeds the configured limit', { limit: this.config.maxFileBytes })
      }
      if (extractedText === undefined && request.fileName?.toLowerCase().endsWith('.pdf')) {
        extractedText = await extractPdfText(bytes, this.config.maxTextChars)
      } else if (extractedText === undefined && /\.(?:md|markdown|txt|html|htm)$/i.test(request.fileName ?? '')) {
        try {
          extractedText = new TextDecoder('utf-8', { fatal: true }).decode(bytes).slice(0, this.config.maxTextChars)
        } catch (error) {
          throw new RemoteError('gateway/bad-request', `text source must be UTF-8: ${String(error)}`, {})
        }
      }
      const ref = await this.ctx.attachments.saveFile({
        data: bytes, ...(request.fileName === undefined ? {} : { name: request.fileName }),
      })
      file = { attachmentId: ref.attachmentId, name: ref.name, bytes: ref.bytes }
    }
    const record: ResearchSource = {
      id: brandString<ResearchSourceId>(randomUUID()), title, createdAt: Date.now(),
      ...(request.publishedAt === undefined ? {} : { publishedAt: request.publishedAt }),
      ...(request.url === undefined ? {} : { url: request.url }),
      ...(extractedText === undefined ? {} : { text: extractedText }),
      ...(file === undefined ? {} : { file }),
    }
    return this.mutate((state) => {
      if (state.sources.length >= this.config.maxSources) {
        throw new RemoteError('research/limit-reached', 'source limit reached', { limit: this.config.maxSources })
      }
      return { ...state, sources: [...state.sources, record], activity: [...state.activity, activity('source', title)] }
    })
  }

  /** Retain a completed research report once per Session Turn before wiki extraction.
   * @param request - Exact published report and its Session Turn.
   * @param signal - Caller cancellation.
   * @returns Stable original source id and current library.
   */
  @Remote
  addReport(request: AddResearchReportRequest, signal: AbortSignal): Promise<ResearchReportReceipt> {
    live(signal)
    if (request.sessionId.trim() === '' || request.sessionId.length > 256 || !Number.isSafeInteger(request.turn) || request.turn < 1) {
      throw new RemoteError('gateway/bad-request', 'a completed Session Turn is required', {})
    }
    const title = required(request.title, 240, 'title')
    const markdown = required(request.markdown, this.config.maxTextChars, 'report')
    return this.mutate((state) => {
      const existing = state.sources.find(source => source.report?.sessionId === request.sessionId
        && source.report.turn === request.turn)
      if (existing !== undefined) return state
      if (state.sources.length >= this.config.maxSources) {
        throw new RemoteError('research/limit-reached', 'source limit reached', { limit: this.config.maxSources })
      }
      const source: ResearchSource = {
        id: brandString<ResearchSourceId>(randomUUID()), title, text: markdown, createdAt: Date.now(),
        report: { sessionId: request.sessionId, turn: request.turn },
      }
      return { ...state, sources: [...state.sources, source], activity: [...state.activity, activity('source', title)] }
    }).then((snapshot) => {
      const source = snapshot.sources.find(item => item.report?.sessionId === request.sessionId
        && item.report.turn === request.turn)
      if (source === undefined) throw new Error('report source missing after admission')
      return { sourceId: source.id, snapshot }
    })
  }

  /** Read exact saved original file bytes.
   * @param sourceId - Stored original source.
   * @param signal - Caller cancellation.
   * @returns Original file encoded as base64.
   */
  @Remote
  async sourceFile(sourceId: ResearchSourceId, signal: AbortSignal): Promise<string> {
    live(signal)
    const source = present(this.current().sources, sourceId)
    if (source.file === undefined) throw new RemoteError('research/not-found', 'source has no file', { id: sourceId })
    const chunks: Uint8Array[] = []
    let size = 0
    for await (const chunk of this.ctx.attachments.readFileStream({
      attachmentId: brandString<AttachmentId>(source.file.attachmentId), name: source.file.name, bytes: source.file.bytes,
    }, signal)) {
      size += chunk.byteLength
      if (size > this.config.maxFileBytes) throw new RemoteError('research/limit-reached', 'file exceeds download limit', { limit: this.config.maxFileBytes })
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('base64')
  }

  /** Publish a user-authored page revision after checking its predecessor.
   * @param request - Page content and expected predecessor revision.
   * @param signal - Caller cancellation.
   * @returns State with the published page.
   */
  @Remote
  savePage(request: SaveResearchPageRequest, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return this.mutate((state) => {
      const prior = request.id === undefined ? undefined : present(state.pages, request.id)
      if (prior !== undefined && request.expectedRevision !== prior.revision) {
        throw new RemoteError('research/conflict', 'page changed since it was opened', { id: prior.id })
      }
      if (prior === undefined && state.pages.length >= this.config.maxPages) {
        throw new RemoteError('research/limit-reached', 'page limit reached', { limit: this.config.maxPages })
      }
      for (const id of request.sourceIds) present(state.sources, id)
      for (const id of request.links) present(state.pages, id)
      const title = required(request.title, 240, 'title')
      const now = Date.now()
      const page: ResearchPage = {
        id: prior?.id ?? brandString<ResearchPageId>(randomUUID()), kind: request.kind,
        title, summary: request.summary.slice(0, 500),
        markdown: required(request.markdown, this.config.maxTextChars, 'page'),
        sourceIds: [...new Set(request.sourceIds)], links: [...new Set(request.links)],
        revision: (prior?.revision ?? 0) + 1, createdAt: prior?.createdAt ?? now, updatedAt: now,
      }
      return {
        ...state, pages: prior === undefined ? [...state.pages, page] : state.pages.map(item => item.id === prior.id ? page : item),
        history: prior === undefined ? state.history : [...state.history, prior],
        activity: [...state.activity, activity('page', title)],
      }
    })
  }

  /** Restore a saved page version as a new revision.
   * @param pageId - Published page.
   * @param revision - Saved version to restore.
   * @param signal - Caller cancellation.
   * @returns State with the restored content published.
   */
  @Remote
  restorePage(pageId: ResearchPageId, revision: number, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return this.mutate((state) => {
      const current = present(state.pages, pageId)
      const older = state.history.find(item => item.id === pageId && item.revision === revision)
      if (older === undefined) throw new RemoteError('research/not-found', `revision ${revision} was not found`, { id: pageId })
      const restored: ResearchPage = { ...older, revision: current.revision + 1, updatedAt: Date.now() }
      return {
        ...state,
        pages: state.pages.map(item => item.id === pageId ? restored : item),
        history: [...state.history, current],
        activity: [...state.activity, activity('page', restored.title)],
      }
    })
  }

  /** Save a user-directed topic study and its current stage.
   * @param request - Topic study fields.
   * @param signal - Caller cancellation.
   * @returns State with the saved study.
   */
  @Remote
  saveStudy(request: SaveResearchStudyRequest, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return this.mutate((state) => {
      const prior = request.id === undefined ? undefined : present(state.studies, request.id)
      const now = Date.now()
      const study: ResearchStudy = {
        id: prior?.id ?? brandString<ResearchStudyId>(randomUUID()),
        title: required(request.title, 240, 'title'),
        question: required(request.question, 2000, 'question'),
        stage: request.stage, notes: request.notes.slice(0, this.config.maxTextChars),
        ...(request.sessionId === undefined ? {} : { sessionId: request.sessionId }),
        createdAt: prior?.createdAt ?? now, updatedAt: now,
      }
      return { ...state,
        studies: prior === undefined ? [...state.studies, study] : state.studies.map(item => item.id === prior.id ? study : item),
        activity: [...state.activity, activity('study', study.title)] }
    })
  }

  /** Replace one page template.
   * @param kind - Template category.
   * @param markdown - Replacement template.
   * @param signal - Caller cancellation.
   * @returns State with the saved template.
   */
  @Remote
  saveTemplate(kind: ResearchPageKind, markdown: string, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return this.mutate(state => ({ ...state, templates: { ...state.templates, [kind]: required(markdown, 10_000, 'template') } }))
  }

  /** Stage a model-authored page for human review without publishing it.
   * @param request - Proposed complete page.
   * @returns State with the pending proposal.
   */
  propose(request: SaveResearchPageRequest): Promise<ResearchSnapshot> {
    return this.mutate((state) => {
      if (request.id !== undefined) present(state.pages, request.id)
      for (const id of request.sourceIds) present(state.sources, id)
      for (const id of request.links) present(state.pages, id)
      const title = required(request.title, 240, 'title')
      const proposal: ResearchProposal = {
        id: randomUUID(), ...(request.id === undefined ? {} : {
          pageId: request.id, expectedRevision: present(state.pages, request.id).revision,
        }),
        kind: request.kind, title, summary: request.summary.slice(0, 500),
        markdown: required(request.markdown, this.config.maxTextChars, 'page'),
        sourceIds: [...new Set(request.sourceIds)], links: [...new Set(request.links)], createdAt: Date.now(),
      }
      return { ...state, proposals: [...state.proposals, proposal] }
    })
  }

  /** Publish a reviewed proposal if its predecessor is current.
   * @param proposalId - Pending proposal to publish.
   * @param signal - Caller cancellation.
   * @returns State with the proposed page published.
   */
  @Remote
  acceptProposal(proposalId: string, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return this.mutate((state) => {
      const proposal = present(state.proposals, proposalId)
      const prior = proposal.pageId === undefined ? undefined : present(state.pages, proposal.pageId)
      if (prior !== undefined && prior.revision !== proposal.expectedRevision) {
        throw new RemoteError('research/conflict', 'page changed after this proposal was written', { id: prior.id })
      }
      if (prior === undefined && state.pages.length >= this.config.maxPages) {
        throw new RemoteError('research/limit-reached', 'page limit reached', { limit: this.config.maxPages })
      }
      const now = Date.now()
      const page: ResearchPage = {
        id: prior?.id ?? brandString<ResearchPageId>(randomUUID()), kind: proposal.kind,
        title: proposal.title, summary: proposal.summary, markdown: proposal.markdown,
        sourceIds: proposal.sourceIds, links: proposal.links, revision: (prior?.revision ?? 0) + 1,
        createdAt: prior?.createdAt ?? now, updatedAt: now,
      }
      return { ...state,
        pages: prior === undefined ? [...state.pages, page] : state.pages.map(item => item.id === prior.id ? page : item),
        history: prior === undefined ? state.history : [...state.history, prior],
        proposals: state.proposals.filter(item => item.id !== proposalId),
        activity: [...state.activity, activity('proposal', page.title)],
      }
    })
  }

  /** Discard a pending proposal without changing published pages.
   * @param proposalId - Pending proposal to discard.
   * @param signal - Caller cancellation.
   * @returns State without the proposal.
   */
  @Remote
  rejectProposal(proposalId: string, signal: AbortSignal): Promise<ResearchSnapshot> {
    live(signal)
    return this.mutate((state) => {
      present(state.proposals, proposalId)
      return { ...state, proposals: state.proposals.filter(item => item.id !== proposalId) }
    })
  }

  /** Serialize all mutations so each complete snapshot is one durable commit. */
  private mutate(change: (state: ResearchSnapshot) => ResearchSnapshot): Promise<ResearchSnapshot> {
    const run = async (): Promise<ResearchSnapshot> => {
      const next = change(this.current())
      if (this.global === undefined) throw new Error('research domain is not open')
      await this.global.set(next)
      return next
    }
    const result = this.chain.then(run, run)
    this.chain = result.then(() => undefined, () => undefined)
    return result
  }
}

export default ResearchController
