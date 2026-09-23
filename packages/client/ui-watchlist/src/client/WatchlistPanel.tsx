/**
 * The watchlist global panel: the durable instrument list on the left, the
 * selected instrument's quote on the right.
 *
 * Everything it renders arrives through the four props shares — the declared
 * view store for the selection, the inject face's hooks for the durable list
 * and its quote batch, and its callbacks for the reads and mutations. The
 * component owns only the add-instrument flow it alone knows about.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import type {
  CandleInterval, DocumentKind, DocumentRow, InstrumentMatch, Quote,
} from '@deepseek-ai/dsh-api-stock-controller/client'
import type { WatchlistEntry } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import {
  IconCloseOutline16, IconPlusOutline16, IconRefreshOutline16, IconSearchOutline16, IconTrashOutline16, Pill, Tooltip,
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
  resumeAnalysis: (sessionId: SessionId) => boolean
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

/** Two-digit clock component of the data-readiness stamp. */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** One signed percentage through the dictionary's own templates. */
function changeText(quote: Quote, t: WatchlistPanelProps['t']): string {
  const value = quote.changePct.toFixed(2)
  return quote.changePct >= 0 ? t('value.pctUp', { value }) : t('value.pct', { value })
}

/** Direction class of one instrument's change. */
function directionOf(quote: Quote | undefined): string | undefined {
  if (quote === undefined || quote.changePct === 0) return css.flat
  return quote.changePct > 0 ? css.up : css.down
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
            <IconSearchOutline16 size={14} />
          </button>
        </Tooltip>
        <Tooltip label={t('add.cancel')} delayMs={400}>
          <button type="button" className={css.iconButton} aria-label={t('add.cancel')} onClick={onDismiss}>
            <IconCloseOutline16 size={14} />
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
  useStore, actions, t, renderSlot,
  useEntries, useQuotes, useListState, useCandles, useDocuments, useAnalysis, useThemeRevision,
  load, refreshQuotes, addInstrument, removeInstrument, searchInstruments, loadCandles, loadDocuments,
  startAnalysis, resumeAnalysis, sendAnalysis, openAnalysisInConversation,
}: WatchlistPanelProps) {
  const selected = useStore(state => state.selected)
  const interval = useStore(state => state.interval)
  const documentKind = useStore(state => state.documentKind)
  const analysisSession = useStore(state => state.analysisSession)
  const entries = useEntries(list => list)
  const listState = useListState(state => state)
  const quotes = useQuotes(state => state)
  const candles = useCandles(state => state)
  const documents = useDocuments(state => state)
  const analysis = useAnalysis(state => state)
  const themeRevision = useThemeRevision(revision => revision)
  const [adding, setAdding] = useState(false)
  const [removeFailure, setRemoveFailure] = useState<string | undefined>(undefined)
  const [question, setQuestion] = useState('')

  // The panel unmounts when another panel or the Conversation is selected, so
  // mounting is the refresh trigger the reader expects on returning to it.
  useEffect(() => { load() }, [load])

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

  // The transcript binds to whichever session is current, so returning to the
  // panel makes the recorded analysis session current again; a session the Host
  // no longer lists is forgotten rather than opened.
  useEffect(() => {
    if (analysisSession === null) return
    if (!resumeAnalysis(analysisSession)) actions.setAnalysisSession(null)
  }, [analysisSession, resumeAnalysis, actions])

  const selectedQuote = selected === null ? undefined : quotes.byCode[selected]

  const startAnalysisSession = (): void => {
    void startAnalysis().then((outcome) => {
      if (outcome.ok) actions.setAnalysisSession(outcome.sessionId)
    })
  }

  const ask = (event: FormEvent, entry: WatchlistEntry): void => {
    event.preventDefault()
    const text = question.trim()
    if (text === '' || analysisSession === null || analysis.phase !== 'idle') return
    const context = t('analysis.context', { name: entry.name, thscode: entry.thscode })
    void sendAnalysis(analysisSession, `${context}\n\n${text}`).then((outcome) => {
      if (outcome.ok) setQuestion('')
    })
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
    <section className={css.panel}>
      <nav className={css.rail} aria-label={t('list.aria')}>
        <header className={css.railHead}>
          <h2 className={css.railTitle}>{t('list.title')}</h2>
          <Tooltip label={t('list.refresh')} delayMs={400}>
            <button
              type="button"
              className={css.iconButton}
              aria-label={t('list.refresh')}
              onClick={() => { refreshQuotes() }}
            >
              <IconRefreshOutline16 size={14} />
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
              <IconPlusOutline16 size={14} />
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
                    <IconTrashOutline16 size={14} />
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

      <div className={css.detail}>
        {selectedEntry === undefined ? (
          <p className={css.detailEmpty}>{t('detail.empty')}</p>
        ) : (
          <article className={css.quote}>
            <header className={css.quoteHead}>
              <span className={css.quoteName}>{selectedEntry.name}</span>
              <span className={css.quoteCode}>{selectedEntry.thscode}</span>
              {selectedQuote !== undefined && (
                <>
                  <span className={clsx(css.quoteLast, directionOf(selectedQuote))}>
                    {selectedQuote.last.toFixed(2)}
                  </span>
                  <span className={clsx(css.quoteChange, directionOf(selectedQuote))}>
                    {changeText(selectedQuote, t)}
                  </span>
                </>
              )}
            </header>
            {/* The chart and the documents need only the instrument, so a quote
                the vendor did not answer for costs the metrics and nothing else. */}
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
              <>
                <div className={css.metrics}>
                  <Metric label={t('detail.open')} value={selectedQuote.open.toFixed(2)} />
                  <Metric label={t('detail.high')} value={selectedQuote.high.toFixed(2)} />
                  <Metric label={t('detail.low')} value={selectedQuote.low.toFixed(2)} />
                  <Metric label={t('detail.prevClose')} value={selectedQuote.prevClose.toFixed(2)} />
                </div>
                {quotes.asOf !== undefined && (
                  <p className={css.asOf}>
                    {t('quotes.asOf', {
                      time: `${pad2(new Date(quotes.asOf).getHours())}:${pad2(new Date(quotes.asOf).getMinutes())}`,
                    })}
                  </p>
                )}
              </>
            )}
            <div className={css.chartBar} role="group" aria-label={t('chart.aria')}>
              {CANDLE_INTERVALS.map(candidate => (
                <Pill
                  key={candidate}
                  active={candidate === interval}
                  onClick={() => { actions.setInterval(candidate) }}
                >
                  {t(`chart.period.${candidate}`)}
                </Pill>
              ))}
              {candles.truncated && <span className={css.chartNote}>{t('chart.truncated')}</span>}
            </div>
            <div className={css.chartArea} aria-label={t('chart.aria')}>
              {candles.phase === 'failed' ? (
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
              ) : candles.bars.length === 0 ? (
                <p className={css.chartEmpty}>{candles.phase === 'loading' ? t('chart.loading') : t('chart.empty')}</p>
              ) : (
                <CandleChart bars={candles.bars} themeRevision={themeRevision} />
              )}
            </div>

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

            <section className={css.analysis} aria-label={t('analysis.aria')}>
              <header className={css.analysisBar}>
                <h3 className={css.analysisTitle}>{t('analysis.title')}</h3>
                {analysisSession !== null && (
                  <button
                    type="button"
                    className={css.retry}
                    onClick={() => { openAnalysisInConversation(analysisSession) }}
                  >
                    {t('analysis.openInConversation')}
                  </button>
                )}
              </header>
              {analysisSession === null ? (
                <>
                  <p className={css.note}>{t('analysis.intro')}</p>
                  <button
                    type="button"
                    className={css.start}
                    disabled={analysis.phase === 'starting'}
                    onClick={startAnalysisSession}
                  >
                    {analysis.phase === 'starting' ? t('analysis.starting') : t('analysis.start')}
                  </button>
                </>
              ) : (
                <>
                  {renderSlot('watchlist.analysis', {})}
                  <form className={css.composer} onSubmit={(event) => { ask(event, selectedEntry) }}>
                    <input
                      className={css.addInput}
                      value={question}
                      aria-label={t('analysis.ask')}
                      placeholder={t('analysis.ask')}
                      onChange={(event) => { setQuestion(event.target.value) }}
                    />
                    <button
                      type="submit"
                      className={css.send}
                      disabled={analysis.phase === 'sending' || question.trim() === ''}
                    >
                      {t('analysis.send')}
                    </button>
                  </form>
                </>
              )}
              {analysis.phase === 'failed' && (
                <p className={css.failure}>{t('failure.withCode', { code: analysis.failure })}</p>
              )}
            </section>
          </article>
        )}
      </div>
    </section>
  )
}
