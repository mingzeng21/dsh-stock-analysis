/** Catalog, specialist launch form, dashboard, and history rail for stock Agents. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { DragonTigerDashboard as DragonTigerData, HotRankDashboard as HotRankData, HotRankHistory } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AgentsPanel.module.css'
import { DragonTigerDashboard } from './DragonTigerDashboard.tsx'
import { HotRankDashboard } from './HotRankDashboard.tsx'
import { dashboardInquiryPrompt, type DashboardScope } from './dashboard-inquiry.ts'

type DashboardFocus = { readonly code: string; readonly sequence: number }

function dashboardRecordKind(name: string): 'dragon' | 'hot' | null {
  if (name === 'dashboard-dragon') return 'dragon'
  if (name === 'dashboard-hot') return 'hot'
  return null
}

/** Panel data and actions supplied by the plugin. */
export interface AgentsPanelInjected {
  hooks: {
    catalog: ObservableSnapshot<readonly StockAgentCard[]>
    sessions: ObservableSnapshot<SessionListState>
    catalogError: ObservableSnapshot<string | null>
  }
  loadCatalog: () => void
  start: (card: StockAgentCard, query: string) => Promise<SessionReference>
  startDashboard: (prompt: string) => Promise<SessionReference>
  continueDashboard: (sessionId: SessionId, prompt: string) => Promise<void>
  openSession: (sessionId: SessionId) => SessionReference
  loadDragonTiger: (signal: AbortSignal) => Promise<DragonTigerData>
  loadHotRank: (signal: AbortSignal) => Promise<HotRankData>
  loadHotRankHistory: (thscode: string, signal: AbortSignal) => Promise<HotRankHistory>
}
export type AgentsPanelProps = PropsRuntime<'main'> & PropsRenderSlots<'stock-agents.conversation'>
  & PropsLocale<'stockAgents'> & InjectFace<AgentsPanelInjected>

/** Render stock Agent launch and dashboard views beside Session history. */
export function AgentsPanel({
  t, renderSlot, SessionProvider, useCatalog, useSessions, useCatalogError,
  loadCatalog, start, startDashboard, continueDashboard, openSession,
  loadDragonTiger, loadHotRank, loadHotRankHistory,
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
  const [dashboardKind, setDashboardKind] = useState<'dragon' | 'hot' | null>(null)
  const [dashboardData, setDashboardData] = useState<DragonTigerData | null>(null)
  const [hotRankData, setHotRankData] = useState<HotRankData | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState(false)
  const dashboardRequest = useRef<AbortController | null>(null)
  const [dashboardScope, setDashboardScope] = useState<DashboardScope>({ kind: 'dragon', board: 'all' })
  const [dashboardFocus, setDashboardFocus] = useState<DashboardFocus | null>(null)
  const [hotHistory, setHotHistory] = useState<HotRankHistory | null>(null)
  const [inquiryOpen, setInquiryOpen] = useState(false)
  const [inquiryQuery, setInquiryQuery] = useState('')
  const [inquiryBusy, setInquiryBusy] = useState(false)
  const [inquiryError, setInquiryError] = useState(false)
  const [dashboardReference, setDashboardReference] = useState<SessionReference | null>(null)
  const [lastInquiryData, setLastInquiryData] = useState<DragonTigerData | HotRankData | null>(null)
  const [lastInquiryHistory, setLastInquiryHistory] = useState<HotRankHistory | null>(null)
  const [lastInquiryScope, setLastInquiryScope] = useState('')
  const inquiryEpoch = useRef(0)
  const onHotHistoryChange = useCallback((value: HotRankHistory | null) => { setHotHistory(value) }, [])
  useEffect(() => { loadCatalog() }, [loadCatalog])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const reference of ownedReferences.current) reference.release()
      ownedReferences.current.clear()
      activeReference.current = null
      dashboardRequest.current?.abort()
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
  useEffect(() => () => { dashboardReference?.release() }, [dashboardReference])
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
  const showSession = (sessionId: SessionId) => {
    inquiryEpoch.current += 1
    setDashboardReference(null)
    setInquiryBusy(false)
    setDashboardKind(null)
    dashboardRequest.current?.abort()
    showReference(openSession(sessionId))
  }
  const choose = (card: StockAgentCard, initial = '') => {
    inquiryEpoch.current += 1
    setDashboardReference(null)
    setInquiryBusy(false)
    setDashboardKind(null)
    dashboardRequest.current?.abort()
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
  const refreshDashboard = (kind = dashboardKind) => {
    if (kind === null) return
    dashboardRequest.current?.abort()
    const request = new AbortController()
    dashboardRequest.current = request
    setDashboardLoading(true)
    setDashboardError(false)
    const load = kind === 'hot' ? loadHotRank : loadDragonTiger
    void load(request.signal).then((value) => {
      if (!request.signal.aborted && mounted.current) {
        if (kind === 'hot') setHotRankData(value as HotRankData)
        else setDashboardData(value as DragonTigerData)
      }
    }).catch(() => {
      if (!request.signal.aborted && mounted.current) setDashboardError(true)
    }).finally(() => {
      if (!request.signal.aborted && mounted.current) setDashboardLoading(false)
    })
  }
  const openDashboard = (kind: 'dragon' | 'hot') => {
    inquiryEpoch.current += 1
    setDashboardReference(null)
    setInquiryBusy(false)
    setLastInquiryData(null)
    setLastInquiryHistory(null)
    setLastInquiryScope('')
    setInquiryOpen(false)
    setInquiryQuery('')
    setInquiryError(false)
    setHotHistory(null)
    setDashboardFocus(null)
    setDashboardScope(kind === 'dragon' ? { kind, board: 'all' } : { kind, board: 'hot', period: 'day' })
    clearActiveSession()
    setSelected(null)
    setHistoryVisible(false)
    setDashboardData(null)
    setHotRankData(null)
    setDashboardKind(kind)
    refreshDashboard(kind)
  }
  const showDashboardSession = (sessionId: SessionId, kind: 'dragon' | 'hot') => {
    openDashboard(kind)
    setDashboardReference(openSession(sessionId))
    setInquiryOpen(true)
  }
  const submitInquiry = (question = inquiryQuery) => {
    const trimmed = question.trim()
    if (dashboardKind === null || dashboardLoading || inquiryBusy || trimmed === '') return
    const data = dashboardKind === 'dragon' ? dashboardData : hotRankData
    if (data === null || dashboardScope.kind !== dashboardKind) return
    let prompt: string
    if (dashboardScope.kind === 'dragon' && dashboardData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'dragon', data: dashboardData, scope: dashboardScope }, trimmed)
    } else if (dashboardScope.kind === 'hot' && hotRankData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'hot', data: hotRankData, scope: dashboardScope, history: hotHistory }, trimmed)
    } else return
    const epoch = inquiryEpoch.current
    setInquiryBusy(true)
    setInquiryError(false)
    const operation = dashboardReference === null
      ? startDashboard(prompt)
      : continueDashboard(dashboardReference.sessionId, prompt).then(() => dashboardReference)
    void operation.then((reference) => {
      if (epoch !== inquiryEpoch.current || !mounted.current) {
        if (dashboardReference === null) reference.release()
        return
      }
      if (dashboardReference === null) setDashboardReference(reference)
      setLastInquiryData(data)
      setLastInquiryHistory(hotHistory)
      setLastInquiryScope(JSON.stringify(dashboardScope))
      setInquiryQuery('')
    }).catch(() => {
      if (epoch === inquiryEpoch.current && mounted.current) setInquiryError(true)
    }).finally(() => {
      if (epoch === inquiryEpoch.current && mounted.current) setInquiryBusy(false)
    })
  }
  const run = () => {
    if (selected === null || busy || (selected.launch === 'query' && query.trim() === '')) return
    setBusy(true)
    setError(null)
    void start(selected, query.trim()).then(showReference)
      .catch(() => { setError('failed') }).finally(() => { setBusy(false) })
  }
  const historyToggle = <Tooltip label={historyVisible ? t('panel.historyHide') : t('panel.historyShow')} portal>
    <button
      type="button"
      className={css.historyToggle}
      aria-label={historyVisible ? t('panel.historyHide') : t('panel.historyShow')}
      aria-expanded={historyVisible}
      aria-controls="stock-agent-history"
      onClick={() => { setHistoryVisible(visible => !visible) }}
    ><IconPanelLeftOutlineRegular size={16} /></button>
  </Tooltip>
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
        const recordedDashboard = dashboardRecordKind(record.name)
        return <li className={css.historyItem} key={id}>
          <button
            type="button"
            className={css.historyOpen}
            aria-label={t('panel.open')}
            aria-current={active?.id === id || dashboardReference?.sessionId === id ? 'true' : undefined}
            onClick={() => {
              if (recordedDashboard !== null) showDashboardSession(id, recordedDashboard)
              else { showSession(id); setSelected(card ?? null) }
            }}
          >
            <span className={css.historyAgent}>{card?.title.zh
              ?? (recordedDashboard === 'dragon' ? t('dragon.title')
                : recordedDashboard === 'hot' ? t('hot.title') : t('panel.removedAgent'))}</span>
            {record.query !== '' && <span className={css.historyQuery}>{record.query}</span>}
            <time dateTime={new Date(updatedAt).toISOString()}>{dateFormat.format(updatedAt)}</time>
          </button>
          {card !== undefined
            ? <button type="button" className={css.historyRerun} onClick={() => { choose(card, record.query) }}>{t('panel.rerun')}</button>
            : recordedDashboard !== null
              ? <button type="button" className={css.historyRerun} onClick={() => { openDashboard(recordedDashboard) }}>{t('panel.rerun')}</button>
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
  if (dashboardKind !== null) {
    const currentData = dashboardKind === 'dragon' ? dashboardData : hotRankData
    const inquiryStale = dashboardReference !== null && currentData !== null && (
      currentData !== lastInquiryData || JSON.stringify(dashboardScope) !== lastInquiryScope
      || (dashboardKind === 'hot' && hotHistory !== lastInquiryHistory)
    )
    const scopeLabel = dashboardScope.kind === 'dragon'
      ? `${dashboardScope.board === 'all' ? t('dragon.boardAll') : dashboardScope.board === 'org' ? t('dragon.boardOrg') : t('dragon.boardHot')}${dashboardScope.stock === undefined ? '' : ` · ${dashboardScope.stock}`}${dashboardScope.seat === undefined ? '' : ` · ${dashboardScope.seat}`}`
      : `${dashboardScope.board === 'hot'
        ? dashboardScope.period === 'day' ? t('hot.day') : t('hot.hour')
        : dashboardScope.period === 'day' ? t('hot.surgeDay') : t('hot.surgeHour')}${dashboardScope.stock === undefined ? '' : ` · ${dashboardScope.stock}`}`
    return <main className={css.panel}>
      {historyRail}
      <section className={css.detail}>
        <nav className={css.detailNav} aria-label={dashboardKind === 'dragon' ? t('dragon.title') : t('hot.title')}>
          {!historyVisible && historyToggle}
          <button type="button" className={css.back} onClick={() => {
            inquiryEpoch.current += 1
            dashboardRequest.current?.abort()
            setDashboardReference(null)
            setInquiryBusy(false)
            setDashboardKind(null)
          }}>{t('panel.back')}</button>
          <span>{dashboardKind === 'dragon' ? t('dragon.title') : t('hot.title')}</span>
          <button type="button" aria-expanded={inquiryOpen} aria-controls="stock-dashboard-inquiry"
            onClick={() => { setInquiryOpen(value => !value) }}>{inquiryOpen ? t('inquiry.hide') : t('inquiry.open')}</button>
          <button type="button" onClick={() => { refreshDashboard() }} disabled={dashboardLoading}>{dashboardKind === 'dragon' ? t('dragon.refresh') : t('hot.refresh')}</button>
        </nav>
        <div className={css.dashboardWorkspace}>
          <div className={css.dashboardCanvas}>
            {dashboardKind === 'dragon'
              ? <DragonTigerDashboard data={dashboardData} loading={dashboardLoading} error={dashboardError}
                onRetry={() => { refreshDashboard() }} onScopeChange={setDashboardScope} focus={dashboardFocus} t={t} />
              : <HotRankDashboard data={hotRankData} loading={dashboardLoading} error={dashboardError}
                onRetry={() => { refreshDashboard() }} loadHistory={loadHotRankHistory}
                onScopeChange={setDashboardScope} onHistoryChange={onHotHistoryChange} focus={dashboardFocus} t={t} />}
          </div>
          <aside id="stock-dashboard-inquiry" className={css.inquiry} aria-label={t('inquiry.title')} hidden={!inquiryOpen}>
            <header className={css.inquiryHeader}>
              <h2>{t('inquiry.title')}</h2>
              <p>{t('inquiry.scope')}: {scopeLabel}</p>
            </header>
            {inquiryStale && <p className={css.inquiryNotice}>{t('inquiry.stale')}</p>}
            {dashboardReference === null ? <div className={css.inquiryIntro}>
              <p>{t('inquiry.intro')}</p>
              <div className={css.inquiryExamples}>
                {(dashboardKind === 'dragon'
                  ? [t('inquiry.dragonExample1'), t('inquiry.dragonExample2')]
                  : [t('inquiry.hotExample1'), t('inquiry.hotExample2')]).map(example =>
                  <button type="button" key={example} onClick={() => { setInquiryQuery(example) }}>{example}</button>)}
              </div>
            </div> : <div className={css.inquiryTranscript}>
              <SessionProvider session={dashboardReference}>
                {renderSlot('stock-agents.conversation', {
                  ...(currentData === null ? {} : { dashboardData: currentData }),
                  onFocus: (code) => { setDashboardFocus(current => ({ code, sequence: (current?.sequence ?? 0) + 1 })) },
                })}
              </SessionProvider>
            </div>}
            <form className={css.inquiryForm} onSubmit={(event) => { event.preventDefault(); submitInquiry() }}>
              <label htmlFor="stock-dashboard-query">{t('inquiry.query')}</label>
              <textarea id="stock-dashboard-query" value={inquiryQuery}
                onChange={(event) => { setInquiryQuery(event.target.value) }} placeholder={t('inquiry.placeholder')} />
              <button type="submit" disabled={currentData === null || dashboardLoading || inquiryBusy || inquiryQuery.trim() === ''}>
                {inquiryBusy ? t('inquiry.sending') : t('inquiry.send')}
              </button>
              {inquiryError && <p role="alert">{t('inquiry.failure')}</p>}
            </form>
          </aside>
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
        <button type="button" className={css.card} onClick={() => { openDashboard('dragon') }}>
          <strong>{t('dragon.cardTitle')}</strong><span>{t('dragon.cardSummary')}</span>
        </button>
        <button type="button" className={css.card} onClick={() => { openDashboard('hot') }}>
          <strong>{t('hot.cardTitle')}</strong><span>{t('hot.cardSummary')}</span>
        </button>
        {catalog.map(card => <button type="button" className={css.card} key={card.name} onClick={() => { choose(card) }}>
          <strong>{card.title.zh}</strong><span>{card.summary.zh}</span>
        </button>)}
      </div> : <section className={css.launch}>
        <p>{selected.summary.zh}</p>
        {selected.launch === 'query' && <>
          <label htmlFor="stock-agent-query">{selected.queryInput?.label.zh ?? t('panel.query')}</label>
          {selected.queryInput?.kind === 'text'
            ? <input id="stock-agent-query" type="text" value={query} onChange={(event) => { setQuery(event.target.value) }} />
            : <textarea id="stock-agent-query" value={query} onChange={(event) => { setQuery(event.target.value) }} />}
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
