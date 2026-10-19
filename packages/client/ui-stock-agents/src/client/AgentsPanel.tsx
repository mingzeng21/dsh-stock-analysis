/** Catalog, specialist launch form, dashboard, and history rail for stock Agents. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { DragonTigerDashboard as DragonTigerData, HotRankDashboard as HotRankData, HotRankHistory, IndustryDetail, IndustryMatrix, LimitUpPulseDashboard as PulseData, SectorCatalog, SectorDashboard as SectorData, SectorMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconPanelLeftOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AgentsPanel.module.css'
import { DragonTigerDashboard } from './DragonTigerDashboard.tsx'
import { HotRankDashboard } from './HotRankDashboard.tsx'
import { IndustryMatrixDashboard } from './IndustryMatrixDashboard.tsx'
import { LimitUpPulseDashboard } from './LimitUpPulseDashboard.tsx'
import { SectorDashboard } from './SectorDashboard.tsx'
import { dashboardInquiryPrompt, type DashboardScope } from './dashboard-inquiry.ts'

type DashboardFocus = { readonly code: string; readonly sequence: number }

type DashboardKind = 'dragon' | 'hot' | 'sector' | 'pulse' | 'industry'

function dashboardRecordKind(name: string): DashboardKind | null {
  if (name === 'dashboard-dragon') return 'dragon'
  if (name === 'dashboard-hot') return 'hot'
  if (name === 'dashboard-sector') return 'sector'
  if (name === 'dashboard-pulse') return 'pulse'
  if (name === 'dashboard-industry') return 'industry'
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
  loadSectors: (signal: AbortSignal) => Promise<SectorCatalog>
  loadSectorDashboard: (sector: SectorMatch, signal: AbortSignal) => Promise<SectorData>
  loadLimitUpPulse: (signal: AbortSignal) => Promise<PulseData>
  loadIndustryMatrix: (signal: AbortSignal) => Promise<IndustryMatrix>
  loadIndustryDetail: (sector: SectorMatch, signal: AbortSignal) => Promise<IndustryDetail>
}
export type AgentsPanelProps = PropsRuntime<'main'> & PropsRenderSlots<'stock-agents.conversation'>
  & PropsLocale<'stockAgents'> & InjectFace<AgentsPanelInjected>

/** Render stock Agent launch and dashboard views beside Session history. */
export function AgentsPanel({
  t, renderSlot, SessionProvider, useCatalog, useSessions, useCatalogError,
  loadCatalog, start, startDashboard, continueDashboard, openSession,
  loadDragonTiger, loadHotRank, loadHotRankHistory, loadSectors, loadSectorDashboard, loadLimitUpPulse,
  loadIndustryMatrix, loadIndustryDetail,
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
  const [dashboardKind, setDashboardKind] = useState<DashboardKind | null>(null)
  const [dashboardData, setDashboardData] = useState<DragonTigerData | null>(null)
  const [hotRankData, setHotRankData] = useState<HotRankData | null>(null)
  const [sectorCatalog, setSectorCatalog] = useState<SectorCatalog | null>(null)
  const [sectorData, setSectorData] = useState<SectorData | null>(null)
  const [pulseData, setPulseData] = useState<PulseData | null>(null)
  const [industryData, setIndustryData] = useState<IndustryMatrix | null>(null)
  const [industryDetail, setIndustryDetail] = useState<IndustryDetail | null>(null)
  const [industrySelected, setIndustrySelected] = useState<SectorMatch | null>(null)
  const [industryDetailLoading, setIndustryDetailLoading] = useState(false)
  const [industryDetailError, setIndustryDetailError] = useState(false)
  const industryRequest = useRef<AbortController | null>(null)
  const [selectedSector, setSelectedSector] = useState<SectorMatch | null>(null)
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
  const [lastInquiryData, setLastInquiryData] = useState<
    DragonTigerData | HotRankData | SectorData | PulseData | IndustryMatrix | null
  >(null)
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
      industryRequest.current?.abort()
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
  const refreshSector = (sector: SectorMatch) => {
    dashboardRequest.current?.abort()
    const request = new AbortController()
    dashboardRequest.current = request
    setDashboardLoading(true)
    setDashboardError(false)
    void loadSectorDashboard(sector, request.signal).then((value) => {
      if (!request.signal.aborted && mounted.current) setSectorData(value)
    }).catch(() => {
      if (!request.signal.aborted && mounted.current) setDashboardError(true)
    }).finally(() => {
      if (!request.signal.aborted && mounted.current) setDashboardLoading(false)
    })
  }
  const selectIndustry = (sector: SectorMatch) => {
    industryRequest.current?.abort()
    const request = new AbortController()
    industryRequest.current = request
    setIndustrySelected(sector)
    setIndustryDetail(null)
    setIndustryDetailLoading(true)
    setIndustryDetailError(false)
    setDashboardScope(current => ({ kind: 'industry', sector: sector.thscode,
      windowDays: current.kind === 'industry' ? current.windowDays : 20 }))
    void loadIndustryDetail(sector, request.signal).then((value) => {
      if (!request.signal.aborted && mounted.current) setIndustryDetail(value)
    }).catch(() => {
      if (!request.signal.aborted && mounted.current) setIndustryDetailError(true)
    }).finally(() => {
      if (!request.signal.aborted && mounted.current) setIndustryDetailLoading(false)
    })
  }
  const refreshDashboard = (kind = dashboardKind, initialSector?: string) => {
    if (kind === 'sector') {
      const request = new AbortController()
      dashboardRequest.current?.abort()
      dashboardRequest.current = request
      setDashboardLoading(true)
      setDashboardError(false)
      void loadSectors(request.signal).then((value) => {
        if (!request.signal.aborted && mounted.current) {
          setSectorCatalog(value)
          const match = value.matches.find(item => item.thscode === initialSector)
          if (match !== undefined) { setSelectedSector(match); refreshSector(match) }
        }
      }).catch(() => {
        if (!request.signal.aborted && mounted.current) setDashboardError(true)
      }).finally(() => {
        if (!request.signal.aborted && mounted.current) setDashboardLoading(false)
      })
      return
    }
    if (kind === null) return
    dashboardRequest.current?.abort()
    const request = new AbortController()
    dashboardRequest.current = request
    setDashboardLoading(true)
    setDashboardError(false)
    const load = kind === 'hot' ? loadHotRank : kind === 'pulse' ? loadLimitUpPulse
      : kind === 'industry' ? loadIndustryMatrix : loadDragonTiger
    void load(request.signal).then((value) => {
      if (!request.signal.aborted && mounted.current) {
        if (kind === 'hot') setHotRankData(value as HotRankData)
        else if (kind === 'pulse') setPulseData(value as PulseData)
        else if (kind === 'industry') {
          const matrix = value as IndustryMatrix
          setIndustryData(matrix)
          const initial = matrix.industries.find(item => item.sector.thscode === initialSector)?.sector
            ?? matrix.industries[0]?.sector
          if (initial !== undefined) selectIndustry(initial)
        }
        else setDashboardData(value as DragonTigerData)
      }
    }).catch(() => {
      if (!request.signal.aborted && mounted.current) setDashboardError(true)
    }).finally(() => {
      if (!request.signal.aborted && mounted.current) setDashboardLoading(false)
    })
  }
  const openDashboard = (kind: DashboardKind, initialSector?: string) => {
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
    setDashboardScope(kind === 'dragon' ? { kind, board: 'all' } : kind === 'hot' ? { kind, board: 'hot', period: 'day' }
      : kind === 'pulse' ? { kind, date: '' } : kind === 'industry' ? { kind, sector: initialSector ?? '', windowDays: 20 }
        : { kind, sector: initialSector ?? '', windowDays: 120 })
    clearActiveSession()
    setSelected(null)
    setHistoryVisible(false)
    setDashboardData(null)
    setHotRankData(null)
    setSectorData(null)
    setPulseData(null)
    setIndustryData(null)
    setIndustryDetail(null)
    setIndustrySelected(null)
    industryRequest.current?.abort()
    setSectorCatalog(null)
    setSelectedSector(null)
    setDashboardKind(kind)
    refreshDashboard(kind, initialSector)
  }
  const showDashboardSession = (sessionId: SessionId, kind: DashboardKind, sectorName?: string) => {
    openDashboard(kind, sectorName)
    setDashboardReference(openSession(sessionId))
    setInquiryOpen(true)
  }
  const submitInquiry = (question = inquiryQuery) => {
    const trimmed = question.trim()
    if (dashboardKind === null || dashboardLoading || inquiryBusy || trimmed === '') return
    const data = dashboardKind === 'dragon' ? dashboardData : dashboardKind === 'hot' ? hotRankData
      : dashboardKind === 'pulse' ? pulseData : dashboardKind === 'industry' ? industryData : sectorData
    if (data === null || dashboardScope.kind !== dashboardKind) return
    let prompt: string
    if (dashboardScope.kind === 'dragon' && dashboardData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'dragon', data: dashboardData, scope: dashboardScope }, trimmed)
    } else if (dashboardScope.kind === 'hot' && hotRankData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'hot', data: hotRankData, scope: dashboardScope, history: hotHistory }, trimmed)
    } else if (dashboardScope.kind === 'sector' && sectorData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'sector', data: sectorData, scope: dashboardScope }, trimmed)
    } else if (dashboardScope.kind === 'pulse' && pulseData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'pulse', data: pulseData, scope: dashboardScope }, trimmed)
    } else if (dashboardScope.kind === 'industry' && industryData !== null) {
      prompt = dashboardInquiryPrompt({ kind: 'industry', data: industryData, detail: industryDetail, scope: dashboardScope }, trimmed)
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
              if (recordedDashboard !== null) showDashboardSession(id, recordedDashboard,
                recordedDashboard === 'sector' || recordedDashboard === 'industry' ? record.query : undefined)
              else { showSession(id); setSelected(card ?? null) }
            }}
          >
            <span className={css.historyAgent}>{card?.title.zh
              ?? (recordedDashboard === 'dragon' ? t('dragon.title')
                : recordedDashboard === 'hot' ? t('hot.title') : recordedDashboard === 'sector' ? t('sector.title')
                  : recordedDashboard === 'pulse' ? t('pulse.title')
                    : recordedDashboard === 'industry' ? t('industry.title') : t('panel.removedAgent'))}</span>
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
    const currentData = dashboardKind === 'dragon' ? dashboardData : dashboardKind === 'hot' ? hotRankData
      : dashboardKind === 'pulse' ? pulseData : dashboardKind === 'industry' ? industryData : sectorData
    const inquiryStale = dashboardReference !== null && currentData !== null && (
      currentData !== lastInquiryData || JSON.stringify(dashboardScope) !== lastInquiryScope
      || (dashboardKind === 'hot' && hotHistory !== lastInquiryHistory)
    )
    const scopeTokens = dashboardScope.kind === 'dragon'
      ? [dashboardScope.board === 'all' ? t('dragon.boardAll') : dashboardScope.board === 'org' ? t('dragon.boardOrg') : t('dragon.boardHot'),
        dashboardScope.stock, dashboardScope.seat]
      : dashboardScope.kind === 'sector'
        ? [sectorData?.sector.name ?? selectedSector?.name ?? t('inquiry.noSector'),
          selectedSector === null ? undefined : t(`sector.days${dashboardScope.windowDays}`), dashboardScope.stock]
        : dashboardScope.kind === 'industry'
          ? [industrySelected?.name ?? t('industry.title'), `${dashboardScope.windowDays}D`, dashboardScope.stock]
          : dashboardScope.kind === 'pulse'
            ? [dashboardScope.date || t('pulse.tradeDate'), dashboardScope.stock]
            : [dashboardScope.board === 'hot'
              ? dashboardScope.period === 'day' ? t('hot.day') : t('hot.hour')
              : dashboardScope.period === 'day' ? t('hot.surgeDay') : t('hot.surgeHour'), dashboardScope.stock]
    const inquiryExamples = dashboardKind === 'dragon'
      ? [t('inquiry.dragonExample1'), t('inquiry.dragonExample2')]
      : dashboardKind === 'hot' ? [t('inquiry.hotExample1'), t('inquiry.hotExample2')]
        : dashboardKind === 'pulse' ? [t('inquiry.pulseExample1'), t('inquiry.pulseExample2')]
          : dashboardKind === 'industry' ? [t('inquiry.industryExample1'), t('inquiry.industryExample2')]
            : [t('inquiry.sectorExample1'), t('inquiry.sectorExample2')]
    const dashboardTitle = dashboardKind === 'dragon' ? t('dragon.title') : dashboardKind === 'hot' ? t('hot.title')
      : dashboardKind === 'pulse' ? t('pulse.title') : dashboardKind === 'industry' ? t('industry.title') : t('sector.title')
    return <main className={css.panel}>
      {historyRail}
      <section className={css.detail}>
        <nav className={css.detailNav} aria-label={dashboardTitle}>
          {!historyVisible && historyToggle}
          <button type="button" className={css.back} onClick={() => {
            inquiryEpoch.current += 1
            dashboardRequest.current?.abort()
            setDashboardReference(null)
            setInquiryBusy(false)
            setDashboardKind(null)
          }}>{t('panel.back')}</button>
          <span>{dashboardTitle}</span>
          <button type="button" aria-expanded={inquiryOpen} aria-controls="stock-dashboard-inquiry"
            onClick={() => { setInquiryOpen(value => !value) }}>{inquiryOpen ? t('inquiry.hide') : t('inquiry.open')}</button>
          <button type="button" onClick={() => { if (dashboardKind === 'sector' && selectedSector !== null) refreshSector(selectedSector); else refreshDashboard() }} disabled={dashboardLoading}>{dashboardKind === 'dragon' ? t('dragon.refresh') : dashboardKind === 'hot' ? t('hot.refresh') : dashboardKind === 'pulse' ? t('pulse.refresh') : dashboardKind === 'industry' ? t('industry.refresh') : t('sector.refresh')}</button>
        </nav>
        <div className={css.dashboardWorkspace}>
          <div className={css.dashboardCanvas}>
            {dashboardKind === 'dragon'
              ? <DragonTigerDashboard data={dashboardData} loading={dashboardLoading} error={dashboardError}
                onRetry={() => { refreshDashboard() }} onScopeChange={setDashboardScope} focus={dashboardFocus} t={t} />
              : dashboardKind === 'hot' ? <HotRankDashboard data={hotRankData} loading={dashboardLoading} error={dashboardError}
                onRetry={() => { refreshDashboard() }} loadHistory={loadHotRankHistory}
                onScopeChange={setDashboardScope} onHistoryChange={onHotHistoryChange} focus={dashboardFocus} t={t} />
                : dashboardKind === 'pulse' ? <LimitUpPulseDashboard data={pulseData} loading={dashboardLoading} error={dashboardError}
                  onRetry={() => { refreshDashboard() }} onScopeChange={setDashboardScope} focus={dashboardFocus} t={t} />
                  : dashboardKind === 'industry' ? <IndustryMatrixDashboard data={industryData} detail={industryDetail}
                    selected={industrySelected?.thscode ?? null} window={dashboardScope.kind === 'industry' ? dashboardScope.windowDays : 20}
                    loading={dashboardLoading} detailLoading={industryDetailLoading}
                    error={dashboardError} detailError={industryDetailError} onRetry={() => { refreshDashboard() }}
                    onSelect={selectIndustry} onStock={(code) => { setDashboardScope(current => current.kind === 'industry'
                      ? { ...current, stock: code } : current) }} onWindowChange={(days) => { setDashboardScope(current =>
                      current.kind === 'industry' ? { ...current, windowDays: days } : current) }} t={t} />
                    : <SectorDashboard catalog={sectorCatalog} data={sectorData} loading={dashboardLoading} error={dashboardError}
                      selected={selectedSector} onRetry={() => {
                        if (selectedSector !== null) refreshSector(selectedSector)
                        else refreshDashboard()
                      }} onSelect={(sector) => {
                        setSelectedSector(sector)
                        setDashboardFocus(null)
                        setDashboardScope(current => ({ kind: 'sector', sector: sector.thscode,
                          windowDays: current.kind === 'sector' ? current.windowDays : 120 }))
                        setSectorData(null)
                        refreshSector(sector)
                      }} onScopeChange={setDashboardScope} focus={dashboardFocus} t={t} />}
          </div>
          <aside id="stock-dashboard-inquiry" className={css.inquiry} aria-label={t('inquiry.title')} hidden={!inquiryOpen}>
            <header className={css.inquiryHeader}>
              <h2>{t('inquiry.title')}</h2>
            </header>
            {inquiryStale && <p className={css.inquiryNotice}>{t('inquiry.stale')}</p>}
            {dashboardReference === null ? <div className={css.inquiryIntro}>
              <p>{dashboardKind === 'sector' && selectedSector === null ? t('inquiry.selectSector') : t('inquiry.intro')}</p>
              {currentData !== null && <div className={css.inquiryExamples}>
                {inquiryExamples.map(example => <button type="button" key={example}
                  onClick={() => { setInquiryQuery(example) }}>{example}</button>)}
              </div>}
            </div> : <div className={css.inquiryTranscript}>
              <SessionProvider session={dashboardReference}>
                {renderSlot('stock-agents.conversation', {
                  ...(currentData === null ? {} : { dashboardData: currentData }),
                  onFocus: (code) => { setDashboardFocus(current => ({ code, sequence: (current?.sequence ?? 0) + 1 })) },
                  suggestions: inquiryExamples,
                  onSuggest: setInquiryQuery,
                })}
              </SessionProvider>
            </div>}
            <form className={css.inquiryForm} onSubmit={(event) => { event.preventDefault(); submitInquiry() }}>
              <div className={css.inquiryScope} role="group" aria-label={t('inquiry.scope')}>
                <span>{t('inquiry.scope')}</span>
                {scopeTokens.filter((token): token is string => token !== undefined).map((token, index) =>
                  <span className={css.inquiryScopeToken} key={`${index}-${token}`}>{token}</span>)}
              </div>
              <label htmlFor="stock-dashboard-query">{t('inquiry.query')}</label>
              <textarea id="stock-dashboard-query" value={inquiryQuery}
                onChange={(event) => { setInquiryQuery(event.target.value) }}
                placeholder={dashboardKind === 'sector' ? t('inquiry.sectorPlaceholder')
                  : dashboardKind === 'pulse' ? t('inquiry.pulsePlaceholder')
                    : dashboardKind === 'industry' ? t('inquiry.industryPlaceholder') : t('inquiry.placeholder')} />
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
        <button type="button" className={css.card} onClick={() => { openDashboard('sector') }}>
          <strong>{t('sector.cardTitle')}</strong><span>{t('sector.cardSummary')}</span>
        </button>
        <button type="button" className={css.card} onClick={() => { openDashboard('pulse') }}>
          <strong>{t('pulse.cardTitle')}</strong><span>{t('pulse.cardSummary')}</span>
        </button>
        <button type="button" className={css.card} onClick={() => { openDashboard('industry') }}>
          <strong>{t('industry.cardTitle')}</strong><span>{t('industry.cardSummary')}</span>
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
