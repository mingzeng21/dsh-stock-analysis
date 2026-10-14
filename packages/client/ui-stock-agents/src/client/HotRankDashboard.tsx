/** Current attention lists with a selected stock's daily ranking history. */
import { useEffect, useState } from 'react'
import type { HotRankBoard, HotRankDashboard as DashboardData, HotRankHistory } from '@deepseek-ai/dsh-api-stock-controller/client'
import { IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import css from './HotRankDashboard.module.css'

interface Props {
  readonly data: DashboardData | null
  readonly loading: boolean
  readonly error: boolean
  readonly onRetry: () => void
  readonly loadHistory: (thscode: string, signal: AbortSignal) => Promise<HotRankHistory>
  readonly t: TranslateNS<'stockAgents'>
}

const VIEWS = [
  { kind: 'hot', period: 'day', key: 'hot.day' },
  { kind: 'hot', period: 'hour', key: 'hot.hour' },
  { kind: 'surge', period: 'day', key: 'hot.surgeDay' },
  { kind: 'surge', period: 'hour', key: 'hot.surgeHour' },
] as const

function changeLabel(change: number | undefined, t: Props['t']): string {
  if (change === undefined) return t('hot.unknown')
  if (change === 0) return t('hot.flat')
  return `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}`
}

function dateLabel(timestamp: number | undefined, t: Props['t']): string {
  return timestamp === undefined ? t('hot.unknown')
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(timestamp)
}

/** Render four independently observed lists and a stock's daily rank chart. */
export function HotRankDashboard({ data, loading, error, onRetry, loadHistory, t }: Props) {
  const [view, setView] = useState<(typeof VIEWS)[number]>(VIEWS[0])
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<HotRankHistory | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(false)
  const board: HotRankBoard | undefined = data?.boards.find(item => item.kind === view.kind && item.period === view.period)
  const stock = board?.stocks.find(item => item.thscode === selected) ?? board?.stocks[0]
  const code = stock?.thscode

  useEffect(() => {
    if (code === undefined) return
    const request = new AbortController()
    setHistory(null)
    setHistoryLoading(true)
    setHistoryError(false)
    void loadHistory(code, request.signal).then((value) => {
      if (!request.signal.aborted) setHistory(value)
    }).catch(() => {
      if (!request.signal.aborted) setHistoryError(true)
    }).finally(() => {
      if (!request.signal.aborted) setHistoryLoading(false)
    })
    return () => { request.abort() }
  }, [code, data, loadHistory])

  if (data === null) return <div className={css.center}>
    {loading ? <IconLoadingOutlineRegular className={css.spinner} size={24} />
      : <div role="alert">{t('hot.loadFailure')} <button type="button" onClick={onRetry}>{t('hot.retry')}</button></div>}
  </div>
  if (board === undefined) return <div className={css.center} role="alert">{t('hot.loadFailure')}</div>

  const top = board.stocks[0]
  const rising = board.stocks.filter(item => item.rankChange !== undefined && item.rankChange > 0).length
  const heatMax = Math.max(1, ...board.stocks.map(item => Number(item.heat)))
  const points = history !== null && history.thscode === code ? history.points : []
  const maxRank = Math.max(30, ...points.map(point => point.rank))
  const chartPoints = points.map((point, index) => `${points.length === 1 ? 50 : index / (points.length - 1) * 100},${point.rank / maxRank * 76 + 12}`).join(' ')

  return <div className={css.scroll}><div className={css.dashboard}>
    <header className={css.hero}>
      <div><span className={css.eyebrow}>{t('hot.eyebrow')}</span><h1>{t('hot.title')}</h1><p>{t('hot.subtitle')}</p></div>
      <div className={css.timeCard}><span>{t('hot.observedAt')}</span><strong>{dateLabel(board.asOf, t)}</strong></div>
    </header>
    {error && <div className={css.notice} role="alert">{t('hot.refreshFailure')} <button type="button" onClick={onRetry}>{t('hot.retry')}</button></div>}
    <nav className={css.tabs} aria-label={t('hot.views')}>
      {VIEWS.map(item => <button key={item.key} type="button" className={view.key === item.key ? css.active : undefined}
        aria-current={view.key === item.key ? 'page' : undefined} onClick={() => { setView(item); setSelected(null) }}>{t(item.key)}</button>)}
    </nav>
    <section className={css.metrics} aria-label={t('hot.overview')}>
      <div><span>{t('hot.listed')}</span><strong>{board.stocks.length}</strong><small>{t('hot.topThirty')}</small></div>
      <div><span>{t('hot.leader')}</span><strong>{top?.name ?? t('hot.unknown')}</strong><small>{top === undefined ? '' : `${t('hot.heat')} ${top.heat}`}</small></div>
      <div><span>{t('hot.rising')}</span><strong>{rising}</strong><small>{t('hot.returnedScope')}</small></div>
      <div><span>{t('hot.averageHeat')}</span><strong>{board.stocks.length === 0 ? '—' : new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(board.stocks.reduce((sum, item) => sum + Number(item.heat), 0) / board.stocks.length)}</strong><small>{t('hot.returnedScope')}</small></div>
    </section>
    <div className={css.grid}>
      <section className={css.listPanel} aria-label={t('hot.ranking')}>
        <header><div><span className={css.eyebrow}>{t('hot.listEyebrow')}</span><h2>{t('hot.ranking')}</h2></div><small>{t('hot.returnedScope')}</small></header>
        <div className={css.tableScroll}><table><thead><tr><th>{t('hot.rank')}</th><th>{t('hot.stock')}</th><th>{t('hot.heat')}</th><th>{t('hot.change')}</th></tr></thead><tbody>
          {board.stocks.map(item => <tr key={item.thscode} className={item.thscode === stock?.thscode ? css.selected : undefined}>
            <td><span className={css.rank}>#{item.rank}</span></td>
            <td><button type="button" onClick={() => { setSelected(item.thscode) }} aria-pressed={item.thscode === stock?.thscode}><strong>{item.name}</strong><small>{item.ticker}</small></button></td>
            <td><div className={css.heat}><span>{item.heat}</span><i style={{ width: `${Number(item.heat) / heatMax * 100}%` }} /></div></td>
            <td className={item.rankChange === undefined ? undefined
              : item.rankChange > 0 ? css.up : item.rankChange < 0 ? css.down : undefined}>
              {changeLabel(item.rankChange, t)}
              <small className={css.trend}>{item.rankTrend === 'up' ? t('hot.trendUp')
                : item.rankTrend === 'down' ? t('hot.trendDown')
                  : item.rankTrend === 'flat' ? t('hot.trendFlat') : t('hot.trendUnknown')}</small>
            </td>
          </tr>)}
        </tbody></table></div>
        {board.stocks.length === 0 && <p className={css.empty}>{t('hot.empty')}</p>}
      </section>
      <aside className={css.side}>
        <section className={css.chartPanel} aria-label={t('hot.history')}>
          <span className={css.eyebrow}>{t('hot.chartEyebrow')}</span><h2>{t('hot.history')}</h2>
          <p>{stock === undefined ? t('hot.select') : `${stock.name} · ${stock.thscode}`}</p>
          {historyLoading && <div className={css.chartState}><IconLoadingOutlineRegular className={css.spinner} size={22} /></div>}
          {!historyLoading && historyError && <div className={css.chartState} role="alert">{t('hot.historyFailure')}</div>}
          {!historyLoading && !historyError && points.length === 0 && <div className={css.chartState}>{t('hot.noHistory')}</div>}
          {!historyLoading && points.length > 0 && <>
            <div className={css.chart}><span>{t('hot.bestRank')}</span><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t('hot.history')}>
              <line x1="0" y1="12" x2="100" y2="12" /><line x1="0" y1="88" x2="100" y2="88" />
              <polyline points={chartPoints} />
              {points.map((point, index) => <circle key={`${point.date}-${index}`}
                cx={points.length === 1 ? 50 : index / (points.length - 1) * 100}
                cy={point.rank / maxRank * 76 + 12} r="1.2">
                <title>{point.date} · #{point.rank}</title>
              </circle>)}
            </svg><span>{t('hot.lowerRank')}</span></div>
            <div className={css.chartDates}><span>{points[0]?.date}</span><span>{points.at(-1)?.date}</span></div>
            <div className={css.chartFacts}><div><span>{t('hot.latestRank')}</span><strong>#{points.at(-1)?.rank}</strong></div><div><span>{t('hot.best')}</span><strong>#{Math.min(...points.map(point => point.rank))}</strong></div></div>
          </>}
          <small>{t('hot.historyScope')}</small>
        </section>
        <section className={css.context}><h2>{t('hot.reading')}</h2><p>{t('hot.readingNote')}</p></section>
      </aside>
    </div>
    <footer>{t('hot.disclaimer')}</footer>
  </div></div>
}
