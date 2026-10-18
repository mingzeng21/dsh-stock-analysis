/** Browser contribution for the personal research library. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-research-controller/remote'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  AddResearchSourceRequest, ResearchPageKind, ResearchSnapshot, ResearchStudy,
  ResearchSource,
  SaveResearchPageRequest, SaveResearchStudyRequest,
} from '@deepseek-ai/dsh-api-research-controller/types'
import { ResearchPanel, type ResearchPanelInjected } from './ResearchPanel.tsx'
import { ResearchReportAction, type ResearchReportActionInjected } from './ResearchReportAction.tsx'
import { ResearchIcon } from './PanelIcon.tsx'
import { en, NS, zh, type ResearchKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    research: ResearchKey
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Session retained while launching a personal topic study. */
    researchStudy: unknown
    /** Session retained while compiling one original source. */
    researchSource: unknown
    /** Session retained while importing a completed research report. */
    researchImport: unknown
  }
}

const PANEL_ID = 'research' as MainPanelId
const EMPTY: ResearchSnapshot = {
  sources: [], pages: [], history: [], studies: [], proposals: [], activity: [],
  templates: { entity: '', concept: '', topic: '', source: '' },
}

/** Services required by the research panel and its study launcher. */
export const inject = [
  'slots', 'locale', 'layout', 'remote', 'remote.research', 'remote.agentPresets', 'sessions', 'uiWorkspace', 'uiConversation',
]

/** Register the navigation row and all research views in one main panel. */
export function apply(ctx: Context): void {
  const library = createSnapshotStore<ResearchSnapshot>(EMPTY)
  const phase = createSnapshotStore<'loading' | 'ready' | 'error'>('loading')
  const publish = (state: ResearchSnapshot): ResearchSnapshot => { library.set(state); phase.set('ready'); return state }
  const unwrap = <T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Error }): T => {
    if (result.ok) return result.value
    throw result.error
  }
  let pendingLoad: Promise<void> | undefined
  const load = (): Promise<void> => {
    if (pendingLoad !== undefined) return pendingLoad
    phase.set('loading')
    pendingLoad = (async () => {
      const result = await ctx.remote.research.snapshot()
      if (result.ok) publish(result.value)
      else phase.set('error')
    })().finally(() => { pendingLoad = undefined })
    return pendingLoad
  }
  const ensureLoaded = (): Promise<void> => phase.getSnapshot() === 'ready' ? Promise.resolve() : load()
  const saveSource = async (request: AddResearchSourceRequest): Promise<void> => {
    publish(unwrap(await ctx.remote.research.addSource(request)))
  }
  const savePage = async (request: SaveResearchPageRequest): Promise<void> => {
    publish(unwrap(await ctx.remote.research.savePage(request)))
  }
  const saveStudy = async (request: SaveResearchStudyRequest): Promise<void> => {
    publish(unwrap(await ctx.remote.research.saveStudy(request)))
  }
  const send = async (sessionId: SessionId, text: string, source: 'researchStudy' | 'researchSource' | 'researchImport'): Promise<void> => {
    const reference = ctx.sessions.retain(sessionId, { source })
    try {
      await reference.ready
      const face = ctx.sessions.binding(sessionId)?.session
      if (face === undefined) throw new Error('session/not-found')
      const submission = face.beginSubmission({ mode: 'queue', text, attachments: [] })
      const sent = await face.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
      if (!sent.ok) throw sent.error
      ctx.uiWorkspace.openSession(sessionId)
    } finally {
      reference.release()
    }
  }
  const launch = async (text: string, source: 'researchStudy' | 'researchSource'): Promise<SessionId> => {
    const sessionId = await ctx.sessions.create()
    const selected = await ctx.remote.agentPresets.select(sessionId, 'stock-analysis')
    if (!selected.ok) throw selected.error
    await send(sessionId, text, source)
    return sessionId
  }
  const startStudy = async (topic: string): Promise<void> => {
    const text = t('prompt.study', { topic })
    const sessionId = await launch(text, 'researchStudy')
    await saveStudy({ title: topic, question: topic, stage: 'question', notes: '', sessionId })
  }
  const runSource = async (source: ResearchSource): Promise<void> => {
    const text = t('prompt.source', { title: source.title, id: source.id })
    await launch(text, 'researchSource')
  }
  const openStudy = (study: ResearchStudy): void => {
    if (study.sessionId !== undefined) ctx.uiWorkspace.openSession(brandString<SessionId>(study.sessionId))
  }
  const importReport = async (sessionId: SessionId, turn: number, report: string, topic: string): Promise<void> => {
    const result = unwrap(await ctx.remote.research.addReport({
      title: t('report.sourceTitle', { topic, turn: String(turn) }),
      markdown: report, sessionId, turn,
    }))
    publish(result.snapshot)
    await send(sessionId, t('prompt.import', { topic, turn: String(turn), sourceId: result.sourceId }), 'researchImport')
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-research: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 11, label: () => t('nav'),
  }, ResearchIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS,
    inject: (): ResearchPanelInjected => ({
      hooks: { library, phase }, load, saveSource, savePage, startStudy, runSource, openStudy,
      restorePage: async (id, revision) => { publish(unwrap(await ctx.remote.research.restorePage(id, revision))) },
      acceptProposal: async (id) => { publish(unwrap(await ctx.remote.research.acceptProposal(id))) },
      rejectProposal: async (id) => { publish(unwrap(await ctx.remote.research.rejectProposal(id))) },
      sourceFile: async id => unwrap(await ctx.remote.research.sourceFile(id)),
      saveTemplate: async (kind: ResearchPageKind, markdown: string) => {
        publish(unwrap(await ctx.remote.research.saveTemplate(kind, markdown)))
      },
    }),
  }, ResearchPanel))
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: 'research-report-import', order: 30, locale: NS,
    inject: (sessionId: SessionId): ResearchReportActionInjected => {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`ui-research: unknown session "${sessionId}"`)
      const chat = ctx.uiConversation.binding(binding).target('chat')
      return {
        hooks: { library }, ensureLoaded,
        keyedHooks: { report: (turn) => {
          const snapshot = chat.getSnapshot()
          if (snapshot === undefined) throw new Error('ui-research: Chat target is unavailable')
          return snapshot.nodes.turnDataSource(Number(turn), 'turn-tail')
        } },
        importReport: (turn, report, topic) => importReport(sessionId, turn, report, topic),
        sessionId,
      }
    },
  }, ResearchReportAction))
}
