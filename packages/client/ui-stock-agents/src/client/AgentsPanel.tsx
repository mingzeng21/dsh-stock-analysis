/** Catalog, launch form, and combined history for skill-backed stock Agents. */
import { useEffect, useState } from 'react'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AgentsPanel.module.css'

/** Panel data and actions supplied by the plugin. */
export interface AgentsPanelInjected {
  hooks: {
    catalog: ObservableSnapshot<readonly StockAgentCard[]>
    sessions: ObservableSnapshot<SessionListState>
    locale: ObservableSnapshot<LocaleSnapshot>
    catalogError: ObservableSnapshot<string | null>
  }
  loadCatalog: () => void
  start: (card: StockAgentCard, query: string) => Promise<SessionId>
  openSession: (sessionId: SessionId) => void
}
export type AgentsPanelProps = PropsRuntime<'main'> & PropsRenderSlots<'stock-agents.conversation'>
  & PropsLocale<'stockAgents'> & InjectFace<AgentsPanelInjected>

/** Render cards, editable launch input, and recorded runs. */
export function AgentsPanel({
  t, renderSlot, useCatalog, useSessions, useLocale, useCatalogError, loadCatalog, start, openSession,
}: AgentsPanelProps) {
  const catalog = useCatalog(value => value)
  const sessions = useSessions(value => value)
  const lang = useLocale(value => value.active === 'en' ? 'en' : 'zh')
  const catalogError = useCatalogError(value => value)
  const dateFormat = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  const [selected, setSelected] = useState<StockAgentCard | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<SessionId | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { loadCatalog() }, [loadCatalog])
  const records = sessions.ids.flatMap((id) => {
    const summary = sessions.byId[id]
    const record = summary?.projectionValues?.stockAgent
    return summary === undefined || record === null || record === undefined ? [] : [{ id, record, updatedAt: summary.updatedAt }]
  })
  const choose = (card: StockAgentCard, initial = '') => {
    setActiveSessionId(null)
    setSelected(card)
    setQuery(initial)
    setError(null)
    if (card.launch === 'immediate') {
      setBusy(true)
      void start(card, '').then(setActiveSessionId)
        .catch((cause: unknown) => { setError(String(cause)) }).finally(() => { setBusy(false) })
    }
  }
  const run = () => {
    if (selected === null || busy || (selected.launch === 'query' && query.trim() === '')) return
    setBusy(true)
    setError(null)
    void start(selected, query.trim()).then(setActiveSessionId)
      .catch((cause: unknown) => { setError(String(cause)) }).finally(() => { setBusy(false) })
  }
  if (activeSessionId !== null) {
    const active = records.find(item => item.id === activeSessionId)
    const card = selected ?? catalog.find(item => item.name === active?.record.name)
    return <main className={css.detail}>
      <nav className={css.detailNav} aria-label={t('panel.title')}>
        <button type="button" className={css.back} onClick={() => { setActiveSessionId(null); setSelected(null) }}>{t('panel.back')}</button>
        <span>{card?.title[lang] ?? active?.record.name}</span>
        {card !== undefined && <button type="button" onClick={() => { choose(card, active?.record.query ?? query) }}>{t('panel.rerun')}</button>}
      </nav>
      <div className={css.detailConversation}>{renderSlot('stock-agents.conversation', {})}</div>
    </main>
  }
  return <main className={css.panel}>
    <header className={css.header}>
      {selected !== null && <button type="button" className={css.back} onClick={() => { setSelected(null) }}>{t('panel.back')}</button>}
      <h1>{selected?.title[lang] ?? t('panel.title')}</h1>
      {selected === null && <p>{t('panel.intro')}</p>}
    </header>
    {selected === null ? <div className={css.cards}>
      {catalogError !== null && <p role="alert">{t('panel.catalogFailure', { code: catalogError })}</p>}
      {catalog.map(card => <button type="button" className={css.card} key={card.name} onClick={() => { choose(card) }}>
        <strong>{card.title[lang]}</strong><span>{card.summary[lang]}</span>
      </button>)}
    </div> : <section className={css.launch}>
      <p>{selected.summary[lang]}</p>
      {selected.launch === 'query' && <>
        <label htmlFor="stock-agent-query">{t('panel.query')}</label>
        <textarea id="stock-agent-query" value={query} onChange={(event) => { setQuery(event.target.value) }} />
        {selected.examples?.[lang] !== undefined && <div className={css.examples}>
          <h2>{t('panel.examples')}</h2>
          {selected.examples[lang].map(example => <button type="button" key={example} onClick={() => { setQuery(example) }}>{example}</button>)}
        </div>}
      </>}
      <button type="button" className={css.primary} disabled={busy || (selected.launch === 'query' && query.trim() === '')} onClick={run}>{busy ? t('panel.running') : t('panel.run')}</button>
      {error !== null && <p role="alert">{t('panel.failure', { code: error })}</p>}
    </section>}
    <section className={css.history}>
      <h2>{t('panel.history')}</h2>
      {records.length === 0 && <p>{t('panel.empty')}</p>}
      <ul>{records.map(({ id, record, updatedAt }) => {
        const card = catalog.find(item => item.name === record.name)
        return <li key={id}>
          <span>{card?.title[lang] ?? record.name}</span>
          {record.query !== '' && <span>{record.query}</span>}
          <time dateTime={new Date(updatedAt).toISOString()}>{dateFormat.format(updatedAt)}</time>
          <button type="button" onClick={() => { openSession(id); setSelected(card ?? null); setActiveSessionId(id) }}>{t('panel.open')}</button>
          {card !== undefined
            ? <button type="button" onClick={() => { choose(card, record.query) }}>{t('panel.rerun')}</button>
            : <small>{t('panel.missing')}</small>}
        </li>
      })}</ul>
    </section>
  </main>
}
