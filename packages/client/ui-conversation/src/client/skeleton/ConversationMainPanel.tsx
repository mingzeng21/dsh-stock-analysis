import { useState } from 'react'
import type {} from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import { IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationSlotProps } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'
import { ConversationWidthControls } from './ConversationWidthControls.tsx'
import css from './ConversationRoot.module.css'

const CONTENT_SLOTS = { widthControls: ConversationWidthControls }

/**
 * Render the main Conversation frame and optional stock research history rail.
 * @param props - the original `main.conversation` Slot props.
 * @returns the Conversation page.
 */
export function ConversationMainPanel(props: ConversationSlotProps) {
  const {
    sessionId, useSession, useSessions, useWorkspaces, useConversation,
    renderSlot, renderFactorySlot, openHistory, startSession, stockResearchHome, t,
  } = props
  const [historyVisible, setHistoryVisible] = useState(true)
  const session = useSession(s => s)
  const conversation = useConversation(s => s)
  const archived = useWorkspaces(s => s.archivedSessionIds)
  const history = useSessions(list => list.ids
    .flatMap((id) => {
      const row = list.byId[id]
      return row === undefined || row.blank || row.origin === 'subagent'
        || row.projectionValues?.stockAgent != null || archived.includes(id) ? [] : [row]
    })
    .sort((a, b) => b.updatedAt - a.updatedAt))
  const shellPhase = session === undefined || conversation === undefined
    ? 'blank'
    : conversationPhase(session, conversation)
  const openState = session?.openState
  const summaryBlank = useSessions(s => sessionId === undefined ? undefined : s.byId[sessionId]?.blank)

  // While a session is still replaying (loading + blank) the hero/docked
  // choice is unknowable — render the composer hidden instead of flashing
  // the centered hero and snapping to the docked bar (or vice versa).
  // Exemption: a session the list summary already proves blank can only
  // land on the hero, so hiding would blank the column for the whole
  // history round-trip (the startup auto-selection flash) for nothing.
  // The exemption is deliberately open-state-wide, not loading-only: a
  // summary-blank session is the hero before its open starts (`cold`) and
  // after one fails (`error`) for the same reason — there is no history.
  // A restored continuable subagent waits for a Host summary to establish
  // parent availability. This keeps the composer
  // hidden instead of briefly rendering the parent-offline takeover.
  const parentAvailabilityPending = session?.subagent?.address.mode === 'continuable'
    && session.subagent.parentAvailable === undefined
  const settling = sessionId !== undefined && (
    (shellPhase === 'blank' && openState === 'loading' && summaryBlank !== true)
    || parentAvailabilityPending
  )
  const hero = sessionId === undefined
    || (shellPhase === 'blank' && (openState === 'open' || summaryBlank === true))
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'

  const dateFormat = new Intl.DateTimeFormat(document.documentElement.lang || 'zh-CN', { month: 'long', day: 'numeric' })
  const toggleLabel = t(historyVisible ? 'history.hide' : 'history.show')
  const historyToggle = <Tooltip label={toggleLabel} portal>
    <button
      type="button"
      className={css.historyToggle}
      aria-label={toggleLabel}
      aria-expanded={historyVisible}
      aria-controls="conversation-history"
      onClick={() => { setHistoryVisible(visible => !visible) }}
    ><IconPanelLeftOutlineRegular size={16} /></button>
  </Tooltip>
  const content = (
    <div className={css.root} data-phase={phase}>
      {stockResearchHome && !historyVisible && <div className={css.historyReopen}>{historyToggle}</div>}
      {renderSlot('conversation.header', {})}
      {renderFactorySlot('conversation.content', {
        variant: 'main',
        phase,
        hero,
        stockResearchHome,
      }, {
        slots: CONTENT_SLOTS,
      })}
      {stockResearchHome && hero && <p className={css.researchDisclaimer}>{t('hero.disclaimer')}</p>}
    </div>
  )
  if (!stockResearchHome) return content
  return (
    <div className={css.home} data-history-visible={historyVisible}>
      <aside id="conversation-history" className={css.historyRail} aria-label={t('history.title')} hidden={!historyVisible}>
        <div className={css.historyHeader}>
          <h2>{t('history.title')}</h2>
          <div className={css.historyActions}>
            <button type="button" onClick={startSession}>{t('history.new')}</button>
            {historyToggle}
          </div>
        </div>
        {history.length === 0
          ? <p className={css.historyEmpty}>{t('history.empty')}</p>
          : <ul className={css.historyList}>{history.map(row => <li key={row.id}>
            <button type="button" aria-current={row.id === sessionId ? 'page' : undefined} onClick={() => { openHistory(row.id) }}>
              <span className={css.historyTitle}>{row.displayTitle}</span>
              <time dateTime={new Date(row.updatedAt).toISOString()}>{dateFormat.format(row.updatedAt)}</time>
            </button>
          </li>)}</ul>}
      </aside>
      {content}
    </div>
  )
}
