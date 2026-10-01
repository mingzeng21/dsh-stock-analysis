/** Specialist identity beside the full Conversation title. */
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AgentsPanel.module.css'

/** React bindings for the mounted Session and the shared catalog. */
export interface AgentBadgeInjected {
  hooks: {
    catalog: ObservableSnapshot<readonly StockAgentCard[]>
    sessions: ObservableSnapshot<SessionListState>
    locale: ObservableSnapshot<LocaleSnapshot>
    catalogReady: ObservableSnapshot<boolean>
  }
}

/** Show a durable Agent name on any Chat view of a specialist record. */
export function AgentBadge({
  sessionId, useCatalog, useSessions, useLocale, useCatalogReady, t,
}: PropsRuntime<'conversation.session.header.actions'> & InjectFace<AgentBadgeInjected> & PropsLocale<'stockAgents'>) {
  const catalog = useCatalog(value => value)
  const record = useSessions(value => value.byId[sessionId]?.projectionValues?.stockAgent)
  const lang = useLocale(value => value.active === 'en' ? 'en' : 'zh')
  const ready = useCatalogReady(value => value)
  if (record === undefined || record === null) return null
  const card = catalog.find(item => item.name === record.name)
  return <span className={css.badge}>{card?.title[lang] ?? record.name}{ready && card === undefined ? ` · ${t('panel.unavailable')}` : ''}</span>
}
