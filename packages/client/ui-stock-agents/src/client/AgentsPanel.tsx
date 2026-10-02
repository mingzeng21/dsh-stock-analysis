/** Catalog, launch form, and collapsible history rail for stock Agents. */
import { useEffect, useRef, useState } from 'react'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AgentsPanel.module.css'

/** Panel data and actions supplied by the plugin. */
export interface AgentsPanelInjected {
  hooks: {
    catalog: ObservableSnapshot<readonly StockAgentCard[]>
    sessions: ObservableSnapshot<SessionListState>
    catalogError: ObservableSnapshot<string | null>
  }
  loadCatalog: () => void
  start: (card: StockAgentCard, query: string) => Promise<SessionReference>
  openSession: (sessionId: SessionId) => SessionReference
}
export type AgentsPanelProps = PropsRuntime<'main'> & PropsRenderSlots<'stock-agents.conversation'>
  & PropsLocale<'stockAgents'> & InjectFace<AgentsPanelInjected>

/** Render stock Agent launch surfaces beside a collapsible Session history rail. */
export function AgentsPanel({
  t, renderSlot, SessionProvider, useCatalog, useSessions, useCatalogError, loadCatalog, start, openSession,
}: AgentsPanelProps) {
  const catalog = useCatalog(value => value)
  const sessions = useSessions(value => value)
  const catalogError = useCatalogError(value => value)
  const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  const [selected, setSelected] = useState<StockAgentCard | null>(null)
  const [active, setActive] = useState<{ id: SessionId; reference: SessionReference } | null>(null)
  const activeReference = useRef<SessionReference | null>(null)
  const ownedReferences = useRef(new Set<SessionReference>())
  const mounted = useRef(false)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyVisible, setHistoryVisible] = useState(true)
  useEffect(() => { loadCatalog() }, [loadCatalog])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const reference of ownedReferences.current) reference.release()
      ownedReferences.current.clear()
      activeReference.current = null
    }
  }, [])
  useEffect(() => {
    const reference = active?.reference
    return () => {
      if (reference === undefined) return
      ownedReferences.current.delete(reference)
      reference.release()
      if (activeReference.current === reference) activeReference.current = null
    }
  }, [active])
  const records = sessions.ids.flatMap((id) => {
    const summary = sessions.byId[id]
    const record = summary?.projectionValues?.stockAgent
    return summary === undefined || record === null || record === undefined ? [] : [{ id, record, updatedAt: summary.updatedAt }]
  })
  const clearActiveSession = () => {
    activeReference.current = null
    setActive(null)
  }
  const showReference = (reference: SessionReference) => {
    if (!mounted.current) {
      reference.release()
      return
    }
    ownedReferences.current.add(reference)
    activeReference.current = reference
    setActive({ id: reference.sessionId, reference })
    setError(null)
    void reference.ready.catch(() => {
      if (activeReference.current === reference) setError('failed')
    })
  }
  const showSession = (sessionId: SessionId) => { showReference(openSession(sessionId)) }
  const choose = (card: StockAgentCard, initial = '') => {
    clearActiveSession()
    setSelected(card)
    setQuery(initial)
    setError(null)
    if (card.launch === 'immediate') {
      setBusy(true)
      void start(card, '').then(showReference)
        .catch(() => { setError('failed') }).finally(() => { setBusy(false) })
    }
  }
  const run = () => {
    if (selected === null || busy || (selected.launch === 'query' && query.trim() === '')) return
    setBusy(true)
    setError(null)
    void start(selected, query.trim()).then(showReference)
      .catch(() => { setError('failed') }).finally(() => { setBusy(false) })
  }
  const historyToggle = <button
    type="button"
    className={css.historyToggle}
    aria-expanded={historyVisible}
    aria-controls="stock-agent-history"
    onClick={() => { setHistoryVisible(visible => !visible) }}
  >{historyVisible ? t('panel.historyHide') : t('panel.historyShow')}</button>
  const historyRail = <aside
    id="stock-agent-history"
    className={css.historyRail}
    aria-label={t('panel.history')}
    hidden={!historyVisible}
  >
    <header className={css.historyHeader}>
      <h2>{t('panel.history')}</h2>
      {historyToggle}
    </header>
    {records.length === 0 ? <p className={css.historyEmpty}>{t('panel.empty')}</p> : <ul className={css.historyList}>
      {records.map(({ id, record, updatedAt }) => {
        const card = catalog.find(item => item.name === record.name)
        return <li className={css.historyItem} key={id}>
          <button
            type="button"
            className={css.historyOpen}
            aria-label={t('panel.open')}
            aria-current={active?.id === id ? 'true' : undefined}
            onClick={() => { showSession(id); setSelected(card ?? null) }}
          >
            <span className={css.historyAgent}>{card?.title.zh ?? t('panel.removedAgent')}</span>
            {record.query !== '' && <span className={css.historyQuery}>{record.query}</span>}
            <time dateTime={new Date(updatedAt).toISOString()}>{dateFormat.format(updatedAt)}</time>
          </button>
          {card !== undefined
            ? <button type="button" className={css.historyRerun} onClick={() => { choose(card, record.query) }}>{t('panel.rerun')}</button>
            : <small className={css.historyMissing}>{t('panel.missing')}</small>}
        </li>
      })}
    </ul>}
  </aside>
  if (active !== null) {
    const activeRecord = records.find(item => item.id === active.id)
    const card = selected ?? catalog.find(item => item.name === activeRecord?.record.name)
    return <main className={css.panel}>
      {historyRail}
      <section className={css.detail}>
        <nav className={css.detailNav} aria-label={t('panel.title')}>
          {!historyVisible && historyToggle}
          <button type="button" className={css.back} onClick={() => { clearActiveSession(); setSelected(null) }}>{t('panel.back')}</button>
          <span>{card?.title.zh ?? t('panel.removedAgent')}</span>
          {card !== undefined && <button type="button" onClick={() => { choose(card, activeRecord?.record.query ?? query) }}>{t('panel.rerun')}</button>}
        </nav>
        {error !== null && <p role="alert">{t('panel.failure')}</p>}
        <div className={css.detailConversation}>
          <SessionProvider session={active.reference}>
            {renderSlot('stock-agents.conversation', {})}
          </SessionProvider>
        </div>
      </section>
    </main>
  }
  return <main className={css.panel}>
    {historyRail}
    <section className={css.content}>
      <header className={css.header}>
        {!historyVisible && historyToggle}
        {selected !== null && <button type="button" className={css.back} onClick={() => { setSelected(null) }}>{t('panel.back')}</button>}
        <div className={css.heading}>
          <h1>{selected?.title.zh ?? t('panel.title')}</h1>
          {selected === null && <p>{t('panel.intro')}</p>}
        </div>
      </header>
      {selected === null ? <div className={css.cards}>
        {catalogError !== null && <p role="alert">{t('panel.catalogFailure')}</p>}
        {catalog.map(card => <button type="button" className={css.card} key={card.name} onClick={() => { choose(card) }}>
          <strong>{card.title.zh}</strong><span>{card.summary.zh}</span>
        </button>)}
      </div> : <section className={css.launch}>
        <p>{selected.summary.zh}</p>
        {selected.launch === 'query' && <>
          <label htmlFor="stock-agent-query">{t('panel.query')}</label>
          <textarea id="stock-agent-query" value={query} onChange={(event) => { setQuery(event.target.value) }} />
          {selected.examples?.zh !== undefined && <div className={css.examples}>
            <h2>{t('panel.examples')}</h2>
            {selected.examples.zh.map(example => <button type="button" key={example} onClick={() => { setQuery(example) }}>{example}</button>)}
          </div>}
        </>}
        <button
          type="button"
          className={css.primary}
          disabled={busy || (selected.launch === 'query' && query.trim() === '')}
          onClick={run}
        >
          {busy ? t('panel.running') : selected.launch === 'immediate' ? t('panel.runImmediate') : t('panel.run')}
        </button>
        {error !== null && <p role="alert">{t('panel.failure')}</p>}
      </section>}
    </section>
  </main>
}
