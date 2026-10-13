/** Fixed right-edge stock quote presentation on every main page. */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { IStockClient, Quote, Candle, DocumentRow } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { StockQuoteOverlay } from './overlay.ts'
import css from './QuotePanel.module.css'

type QuoteData = { quote: Quote; name: string; asOf?: number; candles: readonly Candle[]; news: readonly DocumentRow[] }
type SharedProps = PropsLocale<'stockMentions'> & {
  stock: IStockClient
  nameOf: (code: string) => string | undefined
}
type Tab = 'day' | 'news'

function price(value: number): string { return value.toFixed(2) }

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
  if (selection === null) return null
  return <aside ref={panel} role="dialog" aria-modal="false" tabIndex={-1}
    aria-label={`${selection.name} ${shared.t('title')}`} className={css.overlay}
    onKeyDown={(event) => { if (event.key === 'Escape') overlay.close() }}>
    <QuoteView code={selection.thscode} {...shared} onClose={() => { overlay.close() }} />
  </aside>
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
      const up = bar.close >= bar.open
      const top = y(Math.max(bar.open, bar.close))
      const bottom = y(Math.min(bar.open, bar.close))
      return <g key={bar.time} className={up ? css.up : css.down}>
        <path d={`M${x} ${y(bar.high)}V${y(bar.low)}`} />
        <rect x={x - Math.max(2, step * 0.34)} y={top} width={Math.max(4, step * 0.68)} height={Math.max(1, bottom - top)} />
        <rect className={css.volumeBar} x={x - Math.max(2, step * 0.34)} y={241 - bar.volume / volumeMax * 28}
          width={Math.max(4, step * 0.68)} height={bar.volume / volumeMax * 28} />
      </g>
    })}
    <text className={css.axisLabel} x="16" y="255">{new Date(first.time).toLocaleDateString()}</text>
    <text className={css.axisLabel} x="384" y="255" textAnchor="end">{new Date(last.time).toLocaleDateString()}</text>
  </svg>
}

/** Fetch and display the selected quote, daily candles, and related news. */
function QuoteView({ code, stock, nameOf, t, onClose }: SharedProps & { code: string; onClose?: () => void }) {
  const [revision, retry] = useState(0)
  const [tab, setTab] = useState<Tab>('day')
  const [data, setData] = useState<QuoteData | undefined>()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    setPhase('loading')
    const now = Date.now()
    void Promise.all([
      stock.quotes([code], controller.signal),
      stock.candles({ thscode: code, interval: '1d', start: now - 70 * 86_400_000, end: now }, controller.signal)
        .catch(() => undefined),
      stock.searchSymbols(code, 5, controller.signal).then(hits => hits.find(hit => hit.thscode === code)?.name)
        .catch(() => undefined),
    ]).then(async ([batch, series, searchedName]) => {
      const quote = batch.quotes.find(item => item.thscode === code)
      if (quote === undefined) throw new Error('quote missing')
      const name = nameOf(code) ?? searchedName ?? code
      const news = await stock.documents({ name, kind: 'news', size: 8 }, controller.signal).catch(() => [])
      if (controller.signal.aborted) return
      setData({ quote, name, ...batch.asOf === undefined ? {} : { asOf: batch.asOf }, candles: series?.candles ?? [], news })
      setPhase('ready')
    }).catch(() => { if (!controller.signal.aborted) setPhase('failed') })
    return () => { controller.abort() }
  }, [code, revision, stock, nameOf])
  const visibleData = data?.quote.thscode === code ? data : undefined
  const quote = visibleData?.quote
  const tone = quote === undefined ? css.neutral : quote.change > 0 ? css.upTone : quote.change < 0 ? css.downTone : css.neutral
  const chart = useMemo(() => visibleData?.candles === undefined ? null
    : <DailyChart candles={visibleData.candles} label={t('daily')} />, [visibleData?.candles, t])
  return <section className={css.panel} aria-label={t('title')}>
    <header className={css.header}>
      <div className={css.headerCopy}>
        <strong className={css.headerName}>{visibleData?.name ?? nameOf(code) ?? code}</strong>
        <div className={css.headerMeta}><span>{code}</span><span className={css.marketTag}>{code.endsWith('.SH') ? t('marketSH') : t('marketSZ')}</span></div>
      </div>
      {onClose !== undefined && <button type="button" className={css.closeButton} aria-label={t('close')} onClick={onClose}>×</button>}
    </header>
    {quote !== undefined && <section className={css.quoteSummary} aria-label={t('quote')}>
      <div className={css.currentBlock}>
        <span className={css.eyebrow}>{t('latest')}</span>
        <strong className={`${css.currentPrice} ${tone}`}>{price(quote.last)}</strong>
        <div className={`${css.changeLine} ${tone}`}><span>{quote.change >= 0 ? '+' : ''}{price(quote.change)}</span><span>{quote.changePct.toFixed(2)}%</span></div>
      </div>
      <dl className={css.metrics}>
        <div className={css.metric}><dt>{t('high')}</dt><dd>{price(quote.high)}</dd></div>
        <div className={css.metric}><dt>{t('low')}</dt><dd>{price(quote.low)}</dd></div>
        <div className={css.metric}><dt>{t('open')}</dt><dd>{price(quote.open)}</dd></div>
        <div className={css.metric}><dt>{t('previous')}</dt><dd>{price(quote.prevClose)}</dd></div>
      </dl>
      <div className={css.secondaryStats}><span><b>{t('turnover')}</b>{quote.turnover.toLocaleString()}</span><span><b>{t('volume')}</b>{quote.volume.toLocaleString()}</span></div>
    </section>}
    {phase === 'loading' && <div className={css.quoteLoading} role="status">{t('loading')}</div>}
    {phase === 'failed' && <div className={css.quoteError} role="alert">{t('failed')}</div>}
    <nav className={css.tabs} role="tablist" aria-label={t('title')}>
      <button type="button" role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? css.activeTab : undefined}
        onClick={() => { setTab('day') }}>{t('daily')}</button>
      <button type="button" role="tab" aria-selected={tab === 'news'} className={tab === 'news' ? css.activeTab : undefined}
        onClick={() => { setTab('news') }}>{t('news')}</button>
    </nav>
    <div className={css.body} role="tabpanel">
      {phase === 'ready' && tab === 'day' && <section className={css.chartSection} aria-label={t('daily')}>
        <div className={css.chartHeader}><strong>{t('daily')}</strong></div>
        <div className={css.chartFrame}>{chart ?? <p className={css.status}>{t('empty')}</p>}</div>
      </section>}
      {phase === 'ready' && tab === 'news' && (visibleData?.news.length === 0
        ? <p className={css.status}>{t('empty')}</p>
        : <ol className={css.news}>{visibleData?.news.map(row => <li key={`${row.publishedAt}:${row.title}`}>
          <div>{newsUrl(row.url) === undefined ? row.title : <a href={newsUrl(row.url)} target="_blank" rel="noreferrer">{row.title}</a>}</div>
          <small>{row.publishedAt}</small>
        </li>)}</ol>)}
      {phase === 'loading' && <p className={css.status}>{t('loading')}</p>}
      {phase === 'failed' && <p className={css.status}>{t('failed')}</p>}
    </div>
    <footer className={css.footer}>
      <button type="button" onClick={() => { retry(value => value + 1) }}>{phase === 'failed' ? t('retry') : t('refresh')}</button>
      {visibleData?.asOf !== undefined && <span className={css.meta}>{t('asOf', { time: new Date(visibleData.asOf).toLocaleString() })}</span>}
    </footer>
  </section>
}
