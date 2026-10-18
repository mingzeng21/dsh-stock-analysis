/** Durable personal research vocabulary shared by Host and browser. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** Stable source identity. */
export type ResearchSourceId = Branded<'ResearchSourceId'>
/** Stable wiki page identity. */
export type ResearchPageId = Branded<'ResearchPageId'>
/** Stable study identity. */
export type ResearchStudyId = Branded<'ResearchStudyId'>

/** The four authored wiki page categories. */
export type ResearchPageKind = 'entity' | 'concept' | 'topic' | 'source'
/** Study workflow stage. */
export type ResearchStage = 'question' | 'chain' | 'bottleneck' | 'evidence' | 'falsifiers' | 'memo'

/** Immutable original material; text and file bytes are never edited after admission. */
export interface ResearchSource {
  readonly id: ResearchSourceId
  readonly title: string
  readonly createdAt: number
  readonly publishedAt?: string | undefined
  readonly url?: string | undefined
  readonly text?: string | undefined
  readonly file?: { readonly attachmentId: string; readonly name: string; readonly bytes: number } | undefined
  /** Research report retained from one completed Session Turn. */
  readonly report?: { readonly sessionId: SessionId; readonly turn: number } | undefined
}

/** Original report admission, keyed by the completed Session Turn. */
export interface AddResearchReportRequest {
  readonly title: string
  readonly markdown: string
  readonly sessionId: SessionId
  readonly turn: number
}

/** The retained original and current library after idempotent admission. */
export interface ResearchReportReceipt {
  readonly sourceId: ResearchSourceId
  readonly snapshot: ResearchSnapshot
}

/** One published wiki revision. Page links use stable ids. */
export interface ResearchPage {
  readonly id: ResearchPageId
  readonly kind: ResearchPageKind
  readonly title: string
  readonly summary: string
  readonly markdown: string
  readonly sourceIds: readonly ResearchSourceId[]
  readonly links: readonly ResearchPageId[]
  readonly revision: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** User-directed topic with its current research notes. */
export interface ResearchStudy {
  readonly id: ResearchStudyId
  readonly title: string
  readonly question: string
  readonly stage: ResearchStage
  readonly notes: string
  readonly sessionId?: string | undefined
  readonly createdAt: number
  readonly updatedAt: number
}

/** Pending model-authored page edit, never visible as a published page. */
export interface ResearchProposal {
  readonly id: string
  readonly pageId?: ResearchPageId | undefined
  readonly expectedRevision?: number | undefined
  readonly kind: ResearchPageKind
  readonly title: string
  readonly summary: string
  readonly markdown: string
  readonly sourceIds: readonly ResearchSourceId[]
  readonly links: readonly ResearchPageId[]
  readonly createdAt: number
}

/** One published user-visible action. */
export interface ResearchActivity {
  readonly id: string
  readonly at: number
  readonly action: 'source' | 'page' | 'study' | 'proposal'
  readonly title: string
}

/** Whole published research state; one durable write is one commit. */
export interface ResearchSnapshot {
  readonly sources: readonly ResearchSource[]
  readonly pages: readonly ResearchPage[]
  readonly history: readonly ResearchPage[]
  readonly studies: readonly ResearchStudy[]
  readonly proposals: readonly ResearchProposal[]
  readonly activity: readonly ResearchActivity[]
  readonly templates: Readonly<Record<ResearchPageKind, string>>
}

/** Plain-text source admission. */
export interface AddResearchSourceRequest {
  readonly title: string
  readonly text?: string
  readonly url?: string
  readonly publishedAt?: string
  readonly fileName?: string
  readonly fileBase64?: string
}

/** User-authored or accepted wiki page. */
export interface SaveResearchPageRequest {
  readonly id?: ResearchPageId
  readonly expectedRevision?: number
  readonly kind: ResearchPageKind
  readonly title: string
  readonly summary: string
  readonly markdown: string
  readonly sourceIds: readonly ResearchSourceId[]
  readonly links: readonly ResearchPageId[]
}

/** Study state update. */
export interface SaveResearchStudyRequest {
  readonly id?: ResearchStudyId
  readonly title: string
  readonly question: string
  readonly stage: ResearchStage
  readonly notes: string
  readonly sessionId?: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'research/not-found': { readonly id: string }
    'research/conflict': { readonly id: string }
    'research/limit-reached': { readonly limit: number }
  }
}
