/** Browser contribution for the skill-backed stock Agents catalog. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-stock-agents-controller/remote'
import type {} from '@deepseek-ai/dsh-api-stock-agents-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { AgentsPanel, type AgentsPanelInjected } from './AgentsPanel.tsx'
import { AgentBadge, type AgentBadgeInjected } from './AgentBadge.tsx'
import { AgentConversation } from './AgentConversation.tsx'
import { en, NS, zh, type StockAgentsKey } from './locales.ts'
import { StockAgentsIcon } from './PanelIcon.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    stockAgents: StockAgentsKey
  }
  interface SlotMap {
    /** Selected Session body inside the Agents main panel. */
    'stock-agents.conversation': { kind: 'single'; scope: 'session-maybe' }
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Temporary reference while a specialist's first prompt starts. */
    stockAgent: unknown
  }
}

const PANEL_ID = 'stock-agents' as MainPanelId
export const inject = ['slots', 'locale', 'layout', 'sessions', 'uiWorkspace', 'stockAgentsClient', 'remote', 'remote.agentPresets']

/** Register the single navigation row and its catalog/history panel. */
export function apply(ctx: Context): void {
  const catalog = createSnapshotStore<readonly StockAgentCard[]>([])
  const catalogReady = createSnapshotStore(false)
  const catalogError = createSnapshotStore<string | null>(null)
  const loadCatalog = () => {
    void ctx.stockAgentsClient.list().then((result) => {
      if (result.ok) {
        catalog.set(result.value)
        catalogError.set(null)
        catalogReady.set(true)
      } else {
        catalogError.set(result.error.code)
        ctx.logger.warn(`Stock Agents catalog failed: ${result.error.code}`)
      }
    }).catch((error: unknown) => {
      catalogError.set(String(error))
      ctx.logger.warn(`Stock Agents catalog failed: ${String(error)}`)
    })
  }
  loadCatalog()
  const start = async (card: StockAgentCard, query: string): Promise<SessionId> => {
    const rows = ctx.sessions.list.getSnapshot()
    const current = ctx.uiWorkspace.currentSessionId
    const cwd = current === undefined ? undefined : rows.byId[current]?.cwd
    const target = cwd === undefined ? {} : { cwd }
    const id = await ctx.sessions.create(target)
    const selected = await ctx.remote.agentPresets.select(id, 'stock-analysis')
    if (!selected.ok) throw new Error(selected.error.code)
    const reference = ctx.sessions.retain(id, { source: 'stockAgent' })
    try {
      await reference.ready
      const face = ctx.sessions.binding(id)?.session
      if (face === undefined) throw new Error('session/not-found')
      const prompt = card.launch === 'immediate'
        ? card.prompt?.zh
        : query
      if (prompt === undefined || prompt.trim() === '') throw new Error('agent/empty-query')
      const text = `/${card.name} ${prompt}`
      const submission = face.beginSubmission({ mode: 'queue', text, attachments: [] })
      const result = await face.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
      if (!result.ok) throw new Error(result.error.code)
      ctx.uiWorkspace.selectSession(id)
      return id
    } finally {
      reference.release()
    }
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-stock-agents: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 9, label: () => t('panel.nav'),
  }, StockAgentsIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS,
    children: { 'stock-agents.conversation': { kind: 'single', scope: 'session-maybe' } },
    inject: (): AgentsPanelInjected => ({
      hooks: { catalog, sessions: ctx.sessions.list, catalogError },
      loadCatalog,
      start,
      openSession: (sessionId: SessionId) => { ctx.uiWorkspace.selectSession(sessionId) },
    }),
  }, AgentsPanel))
  ctx.slots.inject('stock-agents.conversation', () => ctx.slots.register({
    name: 'stock-agents.conversation',
  }, AgentConversation))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: 'stock-agent-identity', order: 5, locale: NS,
    inject: (): AgentBadgeInjected => ({ hooks: { catalog, sessions: ctx.sessions.list, catalogReady } }),
  }, AgentBadge))
}
