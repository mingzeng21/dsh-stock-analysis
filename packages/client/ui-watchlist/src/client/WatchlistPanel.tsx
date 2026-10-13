/**
 * The watchlist global panel: the durable instrument list on the left, the
 * selected instrument's market overview and analysis on the right.
 *
 * Everything it renders arrives through the four props shares — the declared
 * view store for the selection, the inject face's hooks for the durable list
 * and its quote batch, and its callbacks for the reads and mutations. The
 * component owns only the add-instrument flow it alone knows about.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import clsx from 'clsx'
import type {
  CandleInterval, DocumentKind, DocumentRow, InstrumentMatch, Quote,
} from '@deepseek-ai/dsh-api-stock-controller/client'
import type { WatchlistEntry } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  IconCloseOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular, IconSearchOutlineRegular,
  IconTrashOutlineRegular, Pill, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AnalysisOutcome, AnalysisState } from './analysis.ts'
import { CANDLE_INTERVALS, DOCUMENT_KINDS } from './controller.ts'
import type {
  AddOutcome, CandlesSnapshot, DocumentsSnapshot, ListSnapshot, QuotesSnapshot, SearchOutcome,
} from './controller.ts'
import { CandleChart } from './CandleChart.tsx'
import { priceOverview, tradingDate } from './overview.ts'
import type { createWatchlistStore } from './store.ts'
import css from './WatchlistPanel.module.css'

/** What this panel reads from the apply closure. */
export interface WatchlistPanelInjected {
  /** Registrant-private reactive facts the renderer binds to `use<Name>` hooks. */
  hooks: {
    /** The durable list, replaced wholesale by every read or mutation. */
    entries: ObservableSnapshot<readonly WatchlistEntry[]>
    /** The published quote batch. */
    quotes: ObservableSnapshot<QuotesSnapshot>
    /** Phase of the durable list read. */
    listState: ObservableSnapshot<ListSnapshot>
    /** The candle series currently drawn. */
    candles: ObservableSnapshot<CandlesSnapshot>
    /** The document channel currently listed. */
    documents: ObservableSnapshot<DocumentsSnapshot>
    /** Phase of the analysis pane's own work. */
    analysis: ObservableSnapshot<AnalysisState>
    /** Retained Session that supplies the analysis transcript. */
    analysisReference: ObservableSnapshot<SessionReference | undefined>
    /** Monotonic theme revision, so a canvas can repaint for a new palette. */
    themeRevision: ObservableSnapshot<number>
  }
  /** Read the list and its quotes; also the panel-entry refresh. */
  load: () => void
  /** Re-read the quotes for the list already held. */
  refreshQuotes: () => void
  /** Resolve an instrument and append it to the durable list. */
  addInstrument: (thscode: string) => Promise<AddOutcome>
  /** Drop one instrument from the durable list. */
  removeInstrument: (thscode: string) => Promise<AddOutcome>
  /** Resolve search text to instrument candidates. */
  searchInstruments: (query: string) => Promise<SearchOutcome>
  /** Read one instrument's candle series for a period. */
  loadCandles: (thscode: string, interval: CandleInterval, now: number) => void
  /** Read one document channel for an instrument. */
  loadDocuments: (name: string, kind: DocumentKind) => void
  /** Create the panel's analysis session and make it current. */
  startAnalysis: () => Promise<AnalysisOutcome>
  /** Make a recorded analysis session current again, if the Host still lists it. */
  resumeAnalysis: (sessionId: SessionId) => Promise<boolean>
  /** Send one question, already carrying the instrument context, to the analysis session. */
  sendAnalysis: (sessionId: SessionId, text: string) => Promise<AnalysisOutcome>
  /** Continue the analysis in the full conversation surface. */
  openAnalysisInConversation: (sessionId: SessionId) => void
}

/** Composed props of the `main` panel entry: runtime seat, store, inject face, locale. */
export type WatchlistPanelProps =
  & PropsRuntime<'main'>
  & PropsRenderSlots<'watchlist.analysis'>
  & PropsStore<ReturnType<typeof createWatchlistStore>>
  & InjectFace<WatchlistPanelInjected>
  & PropsLocale<'watchlist'>

const MIN_RAIL_WIDTH = 180
const MAX_RAIL_WIDTH = 420
const MIN_DETAIL_WIDTH = 320
const DIVIDER_WIDTH = 8

/** Keep the list readable while reserving room for the selected instrument. */
function railWidthLimit(panelWidth: number): number {
  return Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, panelWidth - MIN_DETAIL_WIDTH - DIVIDER_WIDTH))
}

/** Clamp a requested list width to the available desktop space. */
function clampRailWidth(width: number, panelWidth: number): number {
  return Math.max(MIN_RAIL_WIDTH, Math.min(width, railWidthLimit(panelWidth)))
}

/** Two-digit clock component of the data-readiness stamp. */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** One signed percentage through the dictionary's own templates. */
function changeText(quote: Quote, t: WatchlistPanelProps['t']): string {
  const value = quote.changePct.toFixed(2)
  return quote.changePct >= 0 ? t('value.pctUp', { value }) : t('value.pct', { value })
}

/** Format a calculated percentage with the same sign convention as a quote. */
function percentText(value: number, t: WatchlistPanelProps['t']): string {
  const rounded = value.toFixed(2)
  return value > 0 ? t('value.pctUp', { value: rounded }) : t('value.pct', { value: rounded })
}

/** Compact currency units keep the snapshot and historical amounts comparable. */
function amountText(value: number, t: WatchlistPanelProps['t']): string {
  if (Math.abs(value) >= 100_000_000) return t('value.amountYi', { value: (value / 100_000_000).toFixed(2) })
  if (Math.abs(value) >= 10_000) return t('value.amountWan', { value: (value / 10_000).toFixed(2) })
  return value.toFixed(0)
}

/** The vendor quotes shares; one A-share lot is 100 shares. */
function volumeText(shares: number, t: WatchlistPanelProps['t']): string {
  const lots = shares / 100
  return lots >= 10_000
    ? t('value.volumeWanLots', { value: (lots / 10_000).toFixed(2) })
    : t('value.volumeLots', { value: lots.toFixed(0) })
}

/** Direction class of one instrument's change. */
function directionOf(quote: Quote | undefined): string | undefined {
  if (quote === undefined || quote.changePct === 0) return css.flat
  return quote.changePct > 0 ? css.up : css.down
}

/** Rise and fall colors use the A-share convention. */
function directionOfPercent(value: number | undefined): string | undefined {
  if (value === undefined) return undefined
  return value > 0 ? css.up : value < 0 ? css.down : css.flat
}

/** One metric cell of the quote detail. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.metric}>
      <span className={css.metricLabel}>{label}</span>
      <span className={css.metricValue}>{value}</span>
    </div>
  )
}

/** One summary card with its calculation basis below the value. */
function SummaryCard({ label, value, note, direction }: {
  label: string
  value: string
  note: string
  direction?: string | undefined
}) {
  return (
    <div className={css.summaryCard}>
      <span className={css.summaryLabel}>{label}</span>
      <span className={clsx(css.summaryValue, direction)}>{value}</span>
      <span className={css.summaryNote}>{note}</span>
    </div>
  )
}

/** The add-instrument flow: one search, then one pick. */
function AddInstrument({ t, onSearch, onAdd, onDismiss }: {
  t: WatchlistPanelProps['t']
  onSearch: WatchlistPanelInjected['searchInstruments']
  onAdd: WatchlistPanelInjected['addInstrument']
  onDismiss: () => void
}) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<readonly InstrumentMatch[] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)

  const runSearch = (): void => {
    const text = query.trim()
    if (text === '' || busy) return
    setBusy(true)
    setFailure(undefined)
    void onSearch(text).then((outcome) => {
      setBusy(false)
      if (outcome.ok) setMatches(outcome.matches)
      else setFailure(outcome.code)
    })
  }

  const choose = (thscode: string): void => {
    if (busy) return
    setBusy(true)
    setFailure(undefined)
    void onAdd(thscode).then((outcome) => {
      setBusy(false)
      if (outcome.ok) onDismiss()
      else setFailure(outcome.code)
    })
  }

  return (
    <div className={css.add}>
      <div className={css.addRow}>
        <input
          className={css.addInput}
          value={query}
          aria-label={t('add.placeholder')}
          placeholder={t('add.placeholder')}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') runSearch()
            if (event.key === 'Escape') onDismiss()
          }}
        />
        <Tooltip label={t('add.search')} delayMs={400}>
          <button type="button" className={css.iconButton} aria-label={t('add.search')} disabled={busy} onClick={runSearch}>
            <IconSearchOutlineRegular size={14} />
          </button>
        </Tooltip>
        <Tooltip label={t('add.cancel')} delayMs={400}>
          <button type="button" className={css.iconButton} aria-label={t('add.cancel')} onClick={onDismiss}>
            <IconCloseOutlineRegular size={14} />
          </button>
        </Tooltip>
      </div>
      {busy && <p className={css.note}>{t('add.searching')}</p>}
      {failure !== undefined && <p className={css.failure}>{t('failure.withCode', { code: failure })}</p>}
      {matches !== undefined && matches.length === 0 && failure === undefined && (
        <p className={css.note}>{t('add.empty')}</p>
      )}
      {matches !== undefined && matches.length > 0 && (
        <ul className={css.candidates} aria-label={t('add.candidates')}>
          {matches.map(match => (
            <li key={match.thscode}>
              <button type="button" className={css.candidate} onClick={() => { choose(match.thscode) }}>
                <span className={css.candidateName}>{match.name}</span>
                <span className={css.candidateCode}>{match.thscode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One publication time through the dictionary's own date template. */
function documentDate(publishedAt: number, t: WatchlistPanelProps['t']): string {
  const at = new Date(publishedAt)
  return t('documents.date', {
    y: String(at.getFullYear()),
    m: pad2(at.getMonth() + 1),
    d: pad2(at.getDate()),
  })
}

/**
 * One document row: its title, the source and time that let a reader judge it,
 * and the vendor's excerpt. A row without a link keeps the same title shape, so
 * a channel that never carries links reads as a list rather than as broken ones.
 */
function DocumentRowItem({ row, t }: { row: DocumentRow; t: WatchlistPanelProps['t'] }) {
  const meta = row.source === undefined
    ? documentDate(row.publishedAt, t)
    : `${row.source} · ${documentDate(row.publishedAt, t)}`
  return (
    <li className={css.documentRow}>
      {row.url === undefined
        ? <span className={css.documentTitle}>{row.title}</span>
        : (
          <a
            className={css.documentTitle}
            href={row.url}
            target="_blank"
            rel="noreferrer"
            title={t('documents.open')}
          >
            {row.title}
          </a>
        )}
      <span className={css.documentMeta}>{meta}</span>
      {row.summary !== '' && <span className={css.documentSummary}>{row.summary}</span>}
      {row.summaryTruncated && <span className={css.documentNote}>{t('documents.truncated')}</span>}
    </li>
  )
}

/** One document channel: its rows, its own failure, and its own retry. */
function DocumentList({ state, t, onRetry }: {
  state: DocumentsSnapshot
  t: WatchlistPanelProps['t']
  onRetry: () => void
}) {
  if (state.phase === 'failed') {
    return (
      <p className={css.failure}>
        {t('failure.withCode', { code: state.failure })}
        <button type="button" className={css.retry} onClick={onRetry}>{t('quotes.retry')}</button>
      </p>
    )
  }
  // `idle` is the render before the effect that starts the first read.
  if (state.phase !== 'ready') return <p className={css.note}>{t('documents.loading')}</p>
  if (state.rows.length === 0) return <p className={css.note}>{t('documents.empty')}</p>
  return (
    <ul className={css.documentRows}>
      {state.rows.map(row => (
        <DocumentRowItem key={`${row.kind}:${row.publishedAt}:${row.title}`} row={row} t={t} />
      ))}
    </ul>
  )
}

/**
 * Render the watchlist panel.
 * @param props - composed slot props (runtime seat, store, inject face, locale).
 * @returns the panel element tree.
 */
export function WatchlistPanel({
  useStore, actions, t, renderSlot, SessionProvider,
  useEntries, useQuotes, useListState, useCandles, useDocuments, useAnalysis, useAnalysisReference, useThemeRevision,
  load, refreshQuotes, addInstrument, removeInstrument, searchInstruments, loadCandles, loadDocuments,
  startAnalysis, resumeAnalysis, sendAnalysis, openAnalysisInConversation,
}: WatchlistPanelProps) {
  const selected = useStore(state => state.selected)
  const interval = useStore(state => state.interval)
  const chartRange = useStore(state => state.chartRange)
  const documentKind = useStore(state => state.documentKind)
  const railWidth = useStore(state => state.railWidth)
  const analysisSession = useStore(state => state.analysisSession)
  const question = useStore(state => state.analysisDraft)
  const detailScrollTop = useStore(state => state.detailScrollTop)
  const entries = useEntries(list => list)
  const listState = useListState(state => state)
  const quotes = useQuotes(state => state)
  const candles = useCandles(state => state)
  const documents = useDocuments(state => state)
  const analysis = useAnalysis(state => state)
  const analysisReference = useAnalysisReference(reference => reference)
  const themeRevision = useThemeRevision(revision => revision)
  const [adding, setAdding] = useState(false)
  const [removeFailure, setRemoveFailure] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const quoteRef = useRef<HTMLElement>(null)
  const analysisRef = useRef<HTMLElement>(null)
  const questionRef = useRef<HTMLInputElement>(null)
  const submissionRef = useRef(false)
  const scrollPosition = useRef(detailScrollTop)
  const resizeStart = useRef<{ pointerId: number; x: number; width: number } | null>(null)

  const panelWidth = (): number => panelRef.current?.getBoundingClientRect().width || window.innerWidth
  const visibleRailWidth = (): number => railRef.current?.getBoundingClientRect().width || railWidth
  const resizeRail = (width: number): void => { actions.setRailWidth(clampRailWidth(width, panelWidth())) }

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = visibleRailWidth()
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = current - 16; break
      case 'ArrowRight': next = current + 16; break
      case 'Home': next = MIN_RAIL_WIDTH; break
      case 'End': next = railWidthLimit(panelWidth()); break
      default: return
    }
    event.preventDefault()
    resizeRail(next)
  }

  const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || resizeStart.current !== null) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeStart.current = { pointerId: event.pointerId, x: event.clientX, width: visibleRailWidth() }
  }

  const onResizePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = resizeStart.current
    if (start?.pointerId !== event.pointerId) return
    resizeRail(start.width + event.clientX - start.x)
  }

  const onResizePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = resizeStart.current
    if (start?.pointerId !== event.pointerId) return
    resizeRail(start.width + event.clientX - start.x)
    resizeStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onResizePointerCancel = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (resizeStart.current?.pointerId === event.pointerId) resizeStart.current = null
  }

  const panelStyle: CSSProperties & { '--watchlist-rail-width': string } = {
    '--watchlist-rail-width': `${railWidth}px`,
  }

  // The panel unmounts when another panel or the Conversation is selected, so
  // mounting is the refresh trigger the reader expects on returning to it.
  useEffect(() => { load() }, [load])

  useLayoutEffect(() => {
    scrollPosition.current = detailScrollTop
    const scroller = window.innerWidth <= 720
      ? panelRef.current
      : quoteRef.current
    if (scroller !== null) scroller.scrollTop = detailScrollTop
  }, [selected])

  useEffect(() => () => { actions.setDetailScrollTop(scrollPosition.current) }, [actions])

  // One read per instrument and period; the controller drops a response that a
  // newer read has already superseded.
  useEffect(() => {
    if (selected === null) return
    loadCandles(selected, interval, Date.now())
  }, [selected, interval, loadCandles])

  const selectedEntry = useMemo(
    () => entries.find(entry => entry.thscode === selected),
    [entries, selected],
  )

  // One read per instrument and channel, on the same supersession rule. The
  // read is keyed by display name because that is what the vendor search takes.
  useEffect(() => {
    if (selectedEntry === undefined) return
    loadDocuments(selectedEntry.name, documentKind)
  }, [selectedEntry, documentKind, loadDocuments])

  // The panel owns a separate reference so returning to it does not change the
  // main Conversation selection. A session the Host no longer lists is forgotten.
  useEffect(() => {
    if (analysisSession === null) return
    let active = true
    void resumeAnalysis(analysisSession).then((resumed) => {
      if (active && !resumed) actions.setAnalysisSession(null)
    })
    return () => { active = false }
  }, [analysisSession, resumeAnalysis, actions])

  const selectedQuote = selected === null ? undefined : quotes.byCode[selected]
  const quoteTime = quotes.asOf === undefined ? undefined : new Date(quotes.asOf)
  const currentBars = useMemo(
    () => candles.thscode === selected && candles.interval === interval ? candles.bars : [],
    [candles, selected, interval],
  )
  const overview = useMemo(() => priceOverview(currentBars), [currentBars])

  const ask = (event: FormEvent, entry: WatchlistEntry): void => {
    event.preventDefault()
    const text = question.trim()
    if (text === '' || submissionRef.current || analysis.phase === 'starting' || analysis.phase === 'sending') return
    submissionRef.current = true
    setSubmitting(true)
    void (async () => {
      try {
        let sessionId = analysisSession
        if (sessionId === null) {
          const started = await startAnalysis()
          if (!started.ok) return
          sessionId = started.sessionId
          actions.setAnalysisSession(sessionId)
        }
        const context = t('analysis.context', { name: entry.name, thscode: entry.thscode })
        const outcome = await sendAnalysis(sessionId, `${context}\n\n${text}`)
        if (outcome.ok && questionRef.current?.value === question) actions.setAnalysisDraft('')
      } finally {
        submissionRef.current = false
        setSubmitting(false)
      }
    })()
  }

  const focusAnalysis = (): void => {
    analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    questionRef.current?.focus({ preventScroll: true })
  }

  const remove = (entry: WatchlistEntry): void => {
    setRemoveFailure(undefined)
    void removeInstrument(entry.thscode).then((outcome) => {
      if (outcome.ok) {
        if (selected === entry.thscode) actions.select(null)
        return
      }
      setRemoveFailure(outcome.code)
    })
  }

  return (
    <section
      ref={panelRef}
      className={css.panel}
      style={panelStyle}
      onScroll={(event) => {
        if (event.target === event.currentTarget) scrollPosition.current = event.currentTarget.scrollTop
      }}
    >
      <nav ref={railRef} id="watchlist-rail" className={css.rail} aria-label={t('list.aria')}>
        <header className={css.railHead}>
          <h2 className={css.railTitle}>{t('list.title')}</h2>
          <Tooltip label={t('list.refresh')} delayMs={400}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('list.refresh')}
              onClick={() => { refreshQuotes() }}
            >
              <IconRefreshOutlineRegular size={14} />
            </button>
          </Tooltip>
          <Tooltip label={t('list.add')} delayMs={400}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('list.add')}
              aria-expanded={adding}
              onClick={() => { setAdding(open => !open) }}
            >
              <IconPlusOutlineRegular size={14} />
            </button>
          </Tooltip>
        </header>

        {adding && (
          <AddInstrument
            t={t}
            onSearch={searchInstruments}
            onAdd={addInstrument}
            onDismiss={() => { setAdding(false) }}
          />
        )}

        {listState.phase === 'failed' && (
          <p className={css.failure}>{t('failure.withCode', { code: listState.failure })}</p>
        )}
        {removeFailure !== undefined && (
          <p className={css.failure}>{t('failure.withCode', { code: removeFailure })}</p>
        )}

        {entries.length === 0 && listState.phase === 'ready' && (
          <div className={css.empty}>
            <p className={css.emptyTitle}>{t('list.empty')}</p>
            <p className={css.emptyHint}>{t('list.emptyHint')}</p>
          </div>
        )}

        <ul className={css.rows}>
          {entries.map((entry) => {
            const quote = quotes.byCode[entry.thscode]
            return (
              <li key={entry.thscode} className={css.rowItem}>
                <button
                  type="button"
                  className={clsx(css.row, entry.thscode === selected && css.rowActive)}
                  aria-current={entry.thscode === selected || undefined}
                  onClick={() => { actions.select(entry.thscode) }}
                >
                  <span className={css.rowName}>{entry.name}</span>
                  <span className={css.rowCode}>{entry.thscode}</span>
                  <span className={clsx(css.rowPrice, directionOf(quote))}>
                    {quote === undefined ? '—' : quote.last.toFixed(2)}
                  </span>
                  <span className={clsx(css.rowChange, directionOf(quote))}>
                    {quote === undefined ? '' : changeText(quote, t)}
                  </span>
                </button>
                <Tooltip label={t('list.remove', { name: entry.name })} delayMs={400}>
                  <button
                    type="button"
                    className={clsx(css.iconButton, css.rowRemove)}
                    aria-label={t('list.remove', { name: entry.name })}
                    onClick={() => { remove(entry) }}
                  >
                    <IconTrashOutlineRegular size={14} />
                  </button>
                </Tooltip>
              </li>
            )
          })}
        </ul>

        {quotes.phase === 'loading' && <p className={css.note}>{t('quotes.loading')}</p>}
        {quotes.phase === 'failed' && (
          <p className={css.failure}>
            {t('failure.withCode', { code: quotes.failure })}
            <button type="button" className={css.retry} onClick={() => { refreshQuotes() }}>
              {t('quotes.retry')}
            </button>
          </p>
        )}
      </nav>

      <div
        className={css.divider}
        role="separator"
        tabIndex={0}
        aria-label={t('list.resize')}
        aria-controls="watchlist-rail"
        aria-orientation="vertical"
        aria-valuemin={MIN_RAIL_WIDTH}
        aria-valuemax={MAX_RAIL_WIDTH}
        aria-valuenow={railWidth}
        onKeyDown={onResizeKeyDown}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerCancel}
        onLostPointerCapture={onResizePointerCancel}
      />

      <div className={css.detail}>
        {selectedEntry === undefined ? (
          <p className={css.detailEmpty}>{t('detail.empty')}</p>
        ) : (
          <article
            ref={quoteRef}
            className={css.quote}
            onScroll={(event) => { scrollPosition.current = event.currentTarget.scrollTop }}
          >
            <header className={css.quoteHead}>
              <div className={css.quoteIdentity}>
                <h2 className={css.quoteName}>{selectedEntry.name}</h2>
                <span className={css.quoteCode}>{selectedEntry.thscode}</span>
              </div>
              <button type="button" className={css.analysisJump} onClick={focusAnalysis}>
                {t('analysis.jump')}
              </button>
            </header>
            <p className={css.sourceLine}>{t('source.marketData')} · {t('chart.adjust.forward')}</p>
            <section className={css.summary} aria-label={t('summary.aria')}>
              <SummaryCard
                label={t('summary.latestClose')}
                value={overview.latest?.close.toFixed(2) ?? '—'}
                note={overview.latest === undefined ? t('summary.unavailable') : tradingDate(overview.latest.time)}
              />
              <SummaryCard
                label={t('summary.periodReturn')}
                value={overview.returnPct === undefined ? '—' : percentText(overview.returnPct, t)}
                note={overview.first === undefined || overview.latest === undefined
                  ? t('summary.unavailable')
                  : t('summary.dateRange', { start: tradingDate(overview.first.time), end: tradingDate(overview.latest.time) })}
                direction={directionOfPercent(overview.returnPct)}
              />
              <SummaryCard
                label={t(`summary.drawdown.${interval}`)}
                value={overview.drawdown60Pct === undefined ? '—' : percentText(overview.drawdown60Pct, t)}
                note={overview.drawdown60Pct === undefined ? t('summary.insufficient60') : t('summary.adjustedClose')}
                direction={directionOfPercent(overview.drawdown60Pct)}
              />
              <SummaryCard
                label={t(`summary.averageTurnover.${interval}`)}
                value={overview.averageTurnover20 === undefined ? '—' : amountText(overview.averageTurnover20, t)}
                note={overview.averageTurnover20 === undefined ? t('summary.insufficient20') : t('summary.originalAmount')}
              />
            </section>
            {selectedQuote === undefined ? (
              <p className={css.failure}>
                {quotes.phase === 'failed'
                  ? t('failure.withCode', { code: quotes.failure })
                  : t('quotes.loading')}
                {quotes.phase === 'failed' && (
                  <button type="button" className={css.retry} onClick={() => { refreshQuotes() }}>
                    {t('quotes.retry')}
                  </button>
                )}
              </p>
            ) : (
              <section className={css.snapshot} aria-label={t('detail.snapshot')}>
                <div className={css.snapshotHead}>
                  <h3 className={css.sectionTitle}>{t('detail.snapshot')}</h3>
                  <div className={css.snapshotPrice}>
                    <span className={clsx(css.quoteLast, directionOf(selectedQuote))}>{selectedQuote.last.toFixed(2)}</span>
                    <span className={clsx(css.quoteChange, directionOf(selectedQuote))}>{changeText(selectedQuote, t)}</span>
                  </div>
                </div>
                <div className={css.metrics}>
                  <Metric label={t('detail.open')} value={selectedQuote.open.toFixed(2)} />
                  <Metric label={t('detail.high')} value={selectedQuote.high.toFixed(2)} />
                  <Metric label={t('detail.low')} value={selectedQuote.low.toFixed(2)} />
                  <Metric label={t('detail.prevClose')} value={selectedQuote.prevClose.toFixed(2)} />
                  <Metric label={t('detail.volume')} value={volumeText(selectedQuote.volume, t)} />
                  <Metric label={t('detail.turnover')} value={amountText(selectedQuote.turnover, t)} />
                </div>
                {quoteTime !== undefined && (
                  <p className={css.asOf}>
                    {t('quotes.asOf', {
                      time: `${quoteTime.getFullYear()}-${pad2(quoteTime.getMonth() + 1)}-${pad2(quoteTime.getDate())} ${pad2(quoteTime.getHours())}:${pad2(quoteTime.getMinutes())}`,
                    })}
                  </p>
                )}
              </section>
            )}
            <section className={css.chartSection} aria-label={t('chart.aria')}>
              <div className={css.chartHead}>
                <div>
                  <h3 className={css.sectionTitle}>{t('chart.title')}</h3>
                  <p className={css.sectionNote}>{t('chart.legend')}</p>
                </div>
                <div className={css.chartControls}>
                  <div className={css.chartBar} role="group" aria-label={t('chart.periods')}>
                    {CANDLE_INTERVALS.map(candidate => (
                      <Pill key={candidate} active={candidate === interval} onClick={() => { actions.setInterval(candidate) }}>
                        {t(`chart.period.${candidate}`)}
                      </Pill>
                    ))}
                  </div>
                  <div className={css.chartBar} role="group" aria-label={t('chart.ranges')}>
                    {([30, 90, 180, 'all'] as const).map(candidate => (
                      <Pill key={candidate} active={candidate === chartRange} onClick={() => { actions.setChartRange(candidate) }}>
                        {t(`chart.range.${candidate}`)}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
              {currentBars.length > 0 && candles.truncated && <p className={css.chartNote}>{t('chart.truncated')}</p>}
              {candles.phase === 'failed' && currentBars.length > 0 && (
                <p className={css.failure}>
                  {t('failure.withCode', { code: candles.failure })}
                  <button
                    type="button"
                    className={css.retry}
                    onClick={() => { loadCandles(selectedEntry.thscode, interval, Date.now()) }}
                  >
                    {t('quotes.retry')}
                  </button>
                </p>
              )}
              <div className={css.chartArea}>
                {candles.phase === 'failed' && currentBars.length === 0 ? (
                  <p className={css.failure}>
                    {t('failure.withCode', { code: candles.failure })}
                    <button type="button" className={css.retry} onClick={() => { loadCandles(selectedEntry.thscode, interval, Date.now()) }}>
                      {t('quotes.retry')}
                    </button>
                  </p>
                ) : currentBars.length === 0 ? (
                  <p className={css.chartEmpty}>{candles.phase === 'loading' ? t('chart.loading') : t('chart.empty')}</p>
                ) : (
                  <CandleChart bars={currentBars} range={chartRange} themeRevision={themeRevision} />
                )}
              </div>
            </section>

            {overview.recent.length > 0 && (
              <section className={css.recent} aria-label={t('recent.title')}>
                <h3 className={css.sectionTitle}>{t('recent.title')}</h3>
                <div className={css.recentTableScroll}>
                  <table className={css.recentTable}>
                    <thead><tr>
                      <th>{t('recent.date')}</th><th>{t('detail.open')}</th><th>{t('detail.high')}</th>
                      <th>{t('detail.low')}</th><th>{t('recent.close')}</th><th>{t('recent.change')}</th>
                      <th>{t('detail.turnover')}</th>
                    </tr></thead>
                    <tbody>
                      {overview.recent.map(({ bar, changePct }) => (
                        <tr key={bar.time}>
                          <td>{tradingDate(bar.time)}</td><td>{bar.open.toFixed(2)}</td><td>{bar.high.toFixed(2)}</td>
                          <td>{bar.low.toFixed(2)}</td><td>{bar.close.toFixed(2)}</td>
                          <td className={directionOfPercent(changePct)}>
                            {changePct === undefined ? '—' : percentText(changePct, t)}
                          </td>
                          <td>{amountText(bar.turnover, t)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <p className={css.disclaimer}>{t('source.disclaimer')}</p>

            <section
              ref={analysisRef}
              className={clsx(css.analysis, analysisSession !== null && css.analysisActive)}
              aria-label={t('analysis.aria')}
            >
              <header className={css.analysisBar}>
                <h3 className={css.analysisTitle}>{t('analysis.title')}</h3>
                {analysisSession !== null && (
                  <button
                    type="button"
                    className={css.retry}
                    onClick={() => {
                      actions.setDetailScrollTop(scrollPosition.current)
                      openAnalysisInConversation(analysisSession)
                    }}
                  >
                    {t('analysis.openInConversation')}
                  </button>
                )}
              </header>
              {analysisSession !== null && analysisReference !== undefined && (
                <SessionProvider session={analysisReference}>
                  {renderSlot('watchlist.analysis', {})}
                </SessionProvider>
              )}
              {analysisSession === null && <p className={css.analysisHint}>{t('analysis.intro')}</p>}
              <form className={css.composer} onSubmit={(event) => { ask(event, selectedEntry) }}>
                <input
                  ref={questionRef}
                  className={css.addInput}
                  value={question}
                  aria-label={t('analysis.ask')}
                  placeholder={t('analysis.ask')}
                  onChange={(event) => { actions.setAnalysisDraft(event.target.value) }}
                />
                <button
                  type="submit"
                  className={css.send}
                  disabled={submitting || analysis.phase === 'starting' || analysis.phase === 'sending' || question.trim() === ''}
                >
                  {analysis.phase === 'sending'
                    ? t('analysis.sending')
                    : submitting || analysis.phase === 'starting' ? t('analysis.starting') : t('analysis.send')}
                </button>
              </form>
              {analysis.phase === 'failed' && (
                <p className={css.failure}>{t('failure.withCode', { code: analysis.failure })}</p>
              )}
            </section>

            <section className={css.documents} aria-label={t('documents.aria')}>
              <div className={css.documentBar} role="group" aria-label={t('documents.aria')}>
                {DOCUMENT_KINDS.map(kind => (
                  <Pill
                    key={kind}
                    active={kind === documentKind}
                    onClick={() => { actions.setDocumentKind(kind) }}
                  >
                    {t(`documents.${kind}`)}
                  </Pill>
                ))}
              </div>
              <DocumentList
                state={documents}
                t={t}
                onRetry={() => { loadDocuments(selectedEntry.name, documentKind) }}
              />
            </section>

          </article>
        )}
      </div>
    </section>
  )
}
