/** Fixed right-edge stock quote presentation on every main page. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { IStockClient, Quote, Candle, DocumentRow } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { StockQuoteOverlay } from './overlay.ts'
import type { IWatchlist } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { QuickAddButton, StockAddToast, type StockToastNotice } from './QuickAdd.tsx'
import type { WatchlistQuickAdd } from './watchlist.ts'
import css from './QuotePanel.module.css'

type QuoteData = { quote: Quote; name: string; asOf?: number }
type SectionData<T> = { code: string; phase: 'loading' | 'ready' | 'failed'; value: T | undefined }
type SharedProps = PropsLocale<'stockMentions'> & {
  stock: IStockClient
  nameOf: (code: string) => string | undefined
  watchlist: IWatchlist
  add: WatchlistQuickAdd
  toast: ObservableSnapshot<StockToastNotice | null>
  dismissToast: (seq: number) => void
}
type Tab = 'day' | 'news'

function price(value: number): string { return value.toFixed(2) }
function quantity(value: number, unit: string, smallUnit: string, largeUnit: string): string {
  const magnitude = Math.abs(value)
  if (magnitude >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}${largeUnit}${unit}`
  if (magnitude >= 10_000) return `${(value / 10_000).toFixed(2)}${smallUnit}${unit}`
  return `${new Intl.NumberFormat('zh-CN').format(value)}${unit}`
}
const marketTime = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Shanghai',
})
const marketDate = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
})

function newsUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : undefined
  } catch { return undefined }
}

/** Render the quote at the right edge of Conversation and global pages. */
export function QuoteOverlay({ overlay, ...shared }: SharedProps & { overlay: StockQuoteOverlay }) {
  const selection = useSyncExternalStore(overlay.subscribe, overlay.getSnapshot, overlay.getSnapshot)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (selection === null) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const frame = requestAnimationFrame(() => panel.current?.focus())
    return () => { cancelAnimationFrame(frame); previous?.focus() }
  }, [selection?.thscode])
  return <><StockAddToast notice={shared.toast} dismiss={shared.dismissToast} />
    {selection !== null && <aside ref={panel} role="dialog" aria-modal="false" tabIndex={-1}
      aria-label={`${selection.name} ${shared.t('title')}`} className={css.overlay}
      onKeyDown={(event) => { if (event.key === 'Escape') overlay.close() }}>
      <QuoteView selection={selection} {...shared} onClose={() => { overlay.close() }} />
    </aside>}</>
}

function DailyChart({ candles, label }: { candles: readonly Candle[]; label: string }) {
  const bars = candles.slice(-30)
  const first = bars[0]
  const last = bars.at(-1)
  if (first === undefined || last === undefined) return null
  const high = Math.max(...bars.map(bar => bar.high))
  const low = Math.min(...bars.map(bar => bar.low))
  const range = high - low || 1
  const volumeMax = Math.max(...bars.map(bar => bar.volume), 1)
  const step = 368 / bars.length
  const y = (value: number): number => 200 - (value - low) * 176 / range
  return <svg className={css.chart} viewBox="0 0 440 258" role="img" aria-label={label}>
    <path className={css.grid} d="M16 24H384 M16 112H384 M16 200H384 M16 241H384" />
    <text className={css.axisLabel} x="390" y="28">{price(high)}</text>
    <text className={css.axisLabel} x="390" y="202">{price(low)}</text>
    {bars.map((bar, index) => {
      const x = 16 + step * (index + 0.5)
      const direction = bar.close > bar.open ? css.up : bar.close < bar.open ? css.down : css.flat
      const top = y(Math.max(bar.open, bar.close))
      const bottom = y(Math.min(bar.open, bar.close))
      return <g key={bar.time} className={direction}>
        <path d={`M${x} ${y(bar.high)}V${y(bar.low)}`} />
        <rect x={x - Math.max(2, step * 0.34)} y={top} width={Math.max(4, step * 0.68)} height={Math.max(1, bottom - top)} />
        <rect className={css.volumeBar} x={x - Math.max(2, step * 0.34)} y={241 - bar.volume / volumeMax * 28}
          width={Math.max(4, step * 0.68)} height={bar.volume / volumeMax * 28} />
      </g>
    })}
    <text className={css.axisLabel} x="16" y="255">{marketDate.format(first.time)}</text>
    <text className={css.axisLabel} x="384" y="255" textAnchor="end">{marketDate.format(last.time)}</text>
  </svg>
}

/** Fetch and display the selected quote, daily candles, and related news. */
function QuoteView({ selection, stock, nameOf, t, watchlist, add, onClose }: SharedProps & {
  selection: { thscode: string; name: string; ticker: string }
  onClose?: () => void
}) {
  const code = selection.thscode
  const [revision, retry] = useState(0)
  const [chartRevision, retryChart] = useState(0)
  const [newsRevision, retryNews] = useState(0)
  const [tab, setTab] = useState<Tab>('day')
  const [data, setData] = useState<QuoteData | undefined>()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [candles, setCandles] = useState<SectionData<readonly Candle[]>>({ code, phase: 'loading', value: undefined })
  const [news, setNews] = useState<SectionData<readonly DocumentRow[]>>({ code, phase: 'loading', value: undefined })
  useEffect(() => {
    const controller = new AbortController()
    setPhase('loading')
    void Promise.all([
      stock.quotes([code], controller.signal),
      stock.searchSymbols(code, 5, controller.signal).then(hits => hits.find(hit => hit.thscode === code)?.name)
        .catch(() => undefined),
    ]).then(([batch, searchedName]) => {
      const quote = batch.quotes.find(item => item.thscode === code)
      if (quote === undefined) throw new Error('quote missing')
      const name = nameOf(code) ?? searchedName ?? code
      if (controller.signal.aborted) return
      setData({ quote, name, ...batch.asOf === undefined ? {} : { asOf: batch.asOf } })
      setPhase('ready')
    }).catch(() => { if (!controller.signal.aborted) setPhase('failed') })
    return () => { controller.abort() }
  }, [code, revision, stock, nameOf])
  const visibleData = data?.quote.thscode === code ? data : undefined
  useEffect(() => {
    if (visibleData === undefined) return
    const controller = new AbortController()
    setCandles(previous => ({ code, phase: 'loading', value: previous.code === code ? previous.value : undefined }))
    const now = Date.now()
    void stock.candles({ thscode: code, interval: '1d', start: now - 70 * 86_400_000, end: now }, controller.signal)
      .then((series) => { if (!controller.signal.aborted) setCandles({ code, phase: 'ready', value: series.candles }) })
      .catch(() => { if (!controller.signal.aborted) setCandles(previous => ({ code, phase: 'failed', value: previous.code === code ? previous.value : undefined })) })
    return () => { controller.abort() }
  }, [code, revision, chartRevision, stock, visibleData?.name])
  useEffect(() => {
    if (visibleData === undefined) return
    const controller = new AbortController()
    setNews(previous => ({ code, phase: 'loading', value: previous.code === code ? previous.value : undefined }))
    void stock.documents({ name: visibleData.name, kind: 'news', size: 8 }, controller.signal)
      .then((rows) => { if (!controller.signal.aborted) setNews({ code, phase: 'ready', value: rows }) })
      .catch(() => { if (!controller.signal.aborted) setNews(previous => ({ code, phase: 'failed', value: previous.code === code ? previous.value : undefined })) })
    return () => { controller.abort() }
  }, [code, revision, newsRevision, stock, visibleData?.name])
  const visibleCandles = candles.code === code ? candles : { code, phase: 'loading', value: undefined }
  const visibleNews = news.code === code ? news : { code, phase: 'loading', value: undefined }
  const quote = visibleData?.quote
  const tone = quote === undefined ? css.neutral : quote.changePct > 0 ? css.upTone : quote.changePct < 0 ? css.downTone : css.neutral
  const chart = useMemo(() => visibleCandles.value === undefined ? null
    : <DailyChart candles={visibleCandles.value} label={t('daily')} />, [visibleCandles.value, t])
  return <section className={css.panel} aria-label={t('title')}>
    <header className={css.header}>
      <div className={css.headerCopy}>
        <strong className={css.headerName}>{visibleData?.name ?? nameOf(code) ?? code}</strong>
        <div className={css.headerMeta}><span>{code}</span><span className={css.marketTag}>{code.endsWith('.SH') ? t('marketSH') : t('marketSZ')}</span></div>
      </div>
      <div className={css.headerActions}>
        <QuickAddButton hit={selection} watchlist={watchlist} add={add} t={t} />
        {onClose !== undefined && <button type="button" className={css.closeButton} aria-label={t('close')} onClick={onClose}>×</button>}
      </div>
    </header>
    {quote !== undefined && <section className={css.quoteSummary} aria-label={t('quote')}>
      <div className={css.currentBlock}>
        <span className={css.eyebrow}>{t('latest')}</span>
        <strong className={css.currentPrice}>{price(quote.last)}</strong>
        <div className={`${css.changeLine} ${tone}`}><span>{quote.change > 0 ? '+' : ''}{price(quote.change)}</span><span>{quote.changePct > 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</span></div>
      </div>
      <dl className={css.metrics}>
        <div className={css.metric}><dt>{t('high')}</dt><dd>{price(quote.high)}</dd></div>
        <div className={css.metric}><dt>{t('low')}</dt><dd>{price(quote.low)}</dd></div>
        <div className={css.metric}><dt>{t('open')}</dt><dd>{price(quote.open)}</dd></div>
        <div className={css.metric}><dt>{t('previous')}</dt><dd>{price(quote.prevClose)}</dd></div>
      </dl>
      <div className={css.secondaryStats}><span><b>{t('turnover')}</b>{quantity(quote.turnover, t('currencyUnit'), t('smallUnit'), t('largeUnit'))}</span><span><b>{t('volume')}</b>{quantity(quote.volume / 100, t('volumeUnit'), t('smallUnit'), t('largeUnit'))}</span></div>
    </section>}
    {phase === 'loading' && <div className={css.quoteLoading} role="status">{t('loading')}</div>}
    {phase === 'failed' && <div className={css.quoteError} role="alert">{visibleData === undefined ? t('failed') : t('quoteRefreshFailed')} <button type="button" onClick={() => { retry(value => value + 1) }}>{t('retry')}</button></div>}
    <nav className={css.tabs} role="tablist" aria-label={t('title')}>
      <button type="button" role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? css.activeTab : undefined}
        onClick={() => { setTab('day') }}>{t('daily')}</button>
      <button type="button" role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? css.activeTab : undefined}
        onClick={() => { setTab('news') }}>{t('news')}</button>
    </nav>
    <div className={css.body} role="tabpanel">
      {visibleData !== undefined && tab === 'day' && <section className={css.chartSection} aria-label={t('daily')}>
        <div className={css.chartHeader}><strong>{t('daily')}</strong><small>{t('candleBasis')}</small></div>
        {visibleCandles.phase === 'failed' && <p className={css.sectionNotice} role="alert">{t('chartFailed')} <button type="button" onClick={() => { retryChart(value => value + 1) }}>{t('retry')}</button></p>}
        {visibleCandles.phase === 'loading' && <p className={css.sectionNotice} role="status">{chart === null ? t('chartLoading') : t('chartRefreshing')}</p>}
        <div className={css.chartFrame}>{chart ?? (visibleCandles.phase === 'ready' ? <p className={css.status}>{t('empty')}</p> : null)}</div>
      </section>}
      {visibleData !== undefined && tab === 'news' && <>
        {visibleNews.phase === 'failed' && <p className={css.sectionNotice} role="alert">{t('newsFailed')} <button type="button" onClick={() => { retryNews(value => value + 1) }}>{t('retry')}</button></p>}
        {visibleNews.phase === 'loading' && <p className={css.sectionNotice} role="status">{visibleNews.value === undefined ? t('newsLoading') : t('newsRefreshing')}</p>}
        {visibleNews.value === undefined ? null : visibleNews.value.length === 0 && visibleNews.phase === 'ready'
          ? <p className={css.status}>{t('empty')}</p>
          : <ol className={css.news}>{visibleNews.value.map(row => <li key={`${row.publishedAt}:${row.title}`}>
            <div>{newsUrl(row.url) === undefined ? row.title : <a href={newsUrl(row.url)} target="_blank" rel="noreferrer">{row.title}</a>}</div>
            <small>{marketTime.format(row.publishedAt)}</small>
          </li>)}</ol>}
      </>}
      {visibleData === undefined && phase === 'loading' && <p className={css.status}>{t('loading')}</p>}
      {visibleData === undefined && phase === 'failed' && <p className={css.status}>{t('failed')}</p>}
    </div>
    <footer className={css.footer}>
      <button type="button" onClick={() => { retry(value => value + 1) }}>{phase === 'failed' ? t('retry') : t('refresh')}</button>
      {visibleData?.asOf !== undefined && <span className={css.meta}>{t('asOf', { time: marketTime.format(visibleData.asOf) })}</span>}
    </footer>
  </section>
}
