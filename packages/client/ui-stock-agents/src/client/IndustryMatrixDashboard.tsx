/** Industry cross-section, acceleration bubbles, heat strip, and selected membership. */
import { useMemo, useState } from 'react'
import type { IndustryDetail, IndustryMatrix, SectorMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import { IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { industryPoints } from './industry-strength.ts'
import css from './IndustryMatrixDashboard.module.css'
import { marketTime } from './market-format.ts'

interface Props {
  readonly data: IndustryMatrix | null
  readonly detail: IndustryDetail | null
  readonly selected: string | null
  readonly window: 5 | 20 | 60
  readonly loading: boolean
  readonly detailLoading: boolean
  readonly error: boolean
  readonly detailError: boolean
  readonly onSelect: (sector: SectorMatch) => void
  readonly onStock: (code: string) => void
  readonly onWindowChange: (days: 5 | 20 | 60) => void
  readonly onRetry: () => void
  readonly t: TranslateNS<'stockAgents'>
}

const fmt = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const money = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })

/** Render index-derived industry comparisons and current constituent evidence. */
export function IndustryMatrixDashboard({ data, detail, selected, loading, detailLoading, error, detailError,
  onSelect, onStock, onWindowChange, onRetry, window, t }: Props) {
  const [sort, setSort] = useState<'strength' | 'acceleration'>('strength')
  const points = useMemo(() => data === null ? [] : industryPoints(data, window), [data, window])
  const rows = useMemo(() => [...points].sort((a, b) => sort === 'strength'
    ? b.strength - a.strength : b.acceleration - a.acceleration), [points, sort])
  const active = points.find(point => point.code === selected) ?? points[0]
  const selectedSector = data?.industries.find(item => item.sector.thscode === active?.code)?.sector
  const quotes = detail !== null && detail.board.sector.thscode === active?.code ? detail.quotes.quotes : []
  const names = new Map(detail?.board.constituents.map(item => [item.thscode, item.name]) ?? [])
  const gainers = quotes.filter(quote => quote.changePct > 0).length
  const losers = quotes.filter(quote => quote.changePct < 0).length
  const bubbleWidth = 700
  const bubbleHeight = 290
  const xMax = Math.max(2, ...points.map(point => Math.abs(point.excess))) * 1.18
  const yMax = Math.max(1, ...points.map(point => Math.abs(point.acceleration))) * 1.2
  const x = (value: number) => 56 + (value / xMax + 1) / 2 * (bubbleWidth - 95)
  const y = (value: number) => 20 + (1 - (value / yMax + 1) / 2) * (bubbleHeight - 55)
  const closes = active?.closes.slice(-60) ?? []
  const first = closes[0]
  const min = first === undefined ? 0 : Math.min(...closes.flatMap(item => [
    item.industry / first.industry, item.benchmark / first.benchmark,
  ]))
  const max = first === undefined ? 1 : Math.max(...closes.flatMap(item => [
    item.industry / first.industry, item.benchmark / first.benchmark,
  ]))
  const miniY = (value: number) => 78 - (value - min) / (max - min || 1) * 66
  const path = (kind: 'industry' | 'benchmark') => closes.map((point, index) => {
    const value = first === undefined ? 1 : point[kind] / first[kind]
    return `${index === 0 ? 'M' : 'L'} ${index / Math.max(closes.length - 1, 1) * 300} ${miniY(value)}`
  }).join(' ')
  const selectedQuotes = [...quotes].sort((a, b) => b.changePct - a.changePct).slice(0, 16)
  return <div className={css.scroll}><div className={css.dashboard}>
    <header className={css.hero}><div><span className={css.eyebrow}>{t('industry.eyebrow')}</span>
      <h1>{t('industry.title')}</h1><p>{t('industry.subtitle')}</p></div>
    <div className={css.windows} role="group" aria-label={t('industry.window')}>
      {([5, 20, 60] as const).map(days => <button type="button" key={days} aria-pressed={window === days}
        onClick={() => { onWindowChange(days) }}>{days}{t('industry.daySuffix')}</button>)}
    </div></header>
    {loading && data !== null && <div className={css.notice} role="status">{t('market.refreshing')}</div>}
    {error && <div className={css.notice} role="alert">{t('industry.loadFailure')}{data?.benchmark.asOf !== undefined && ` · ${t('market.updated', { time: marketTime(data.benchmark.asOf) })}`} <button type="button" onClick={onRetry}>{t('industry.retry')}</button></div>}
    {loading && data === null && <div className={css.loading} role="status"><IconLoadingOutlineRegular className={css.spinner} size={24} />{t('industry.loading')}</div>}
    {data !== null && <>
      {data.benchmark.asOf !== undefined && <p className={css.dataTime}>{t('market.updated', { time: marketTime(data.benchmark.asOf) })}</p>}
      <div className={css.metrics}>
        <div><span>{t('industry.strong')}</span><strong>{points.filter(point => point.strength >= 60).length}<small> / {points.length}</small></strong></div>
        <div><span>{t('industry.accelerating')}</span><strong>{points.filter(point => point.acceleration > 0).length}<small> / {points.length}</small></strong></div>
        <div><span>{t('industry.breadth')}</span><strong>{quotes.length === 0 ? '—' : `${fmt.format(gainers / quotes.length * 100)}%`}</strong><small>{t('industry.sampleBreadth')}</small></div>
        <div><span>{t('industry.turnover')}</span><strong>{active === undefined ? '—' : money.format(active.latestTurnover)}</strong><small>{t('industry.selectedIndustry')}</small></div>
      </div>
      <div className={css.mainGrid}>
        <section className={css.panel} aria-label={t('industry.bubbles')}>
          <div className={css.panelHead}><h2>{t('industry.bubbles')}</h2><p>{t('industry.axes')}</p></div>
          {points.length === 0 ? <div className={css.empty}>{t('industry.noComparable')}</div> : <div className={css.chartScroll}>
            <svg viewBox={`0 0 ${bubbleWidth} ${bubbleHeight}`} className={css.bubbles} role="group" aria-label={t('industry.bubbles')}>
              <line x1={x(0)} x2={x(0)} y1={12} y2={bubbleHeight - 25} className={css.axis} />
              <line x1={38} x2={bubbleWidth - 18} y1={y(0)} y2={y(0)} className={css.axis} />
              <text x={45} y={18}>{t('industry.repair')}</text><text x={bubbleWidth - 165} y={18}>{t('industry.accelerationZone')}</text>
              <text x={45} y={bubbleHeight - 17}>{t('industry.weak')}</text><text x={bubbleWidth - 165} y={bubbleHeight - 17}>{t('industry.fade')}</text>
              {points.map((point) => {
                const activePoint = point.code === active?.code
                const radius = Math.max(7, Math.min(18, 9 * Math.sqrt(point.pulse ?? 1)))
                const select = () => {
                  const sector = data.industries.find(item => item.sector.thscode === point.code)?.sector
                  if (sector) onSelect(sector)
                }
                return <g key={point.code} className={activePoint ? css.activeBubble : css.bubble}
                  role="button" tabIndex={0} aria-pressed={activePoint}
                  aria-label={`${point.name} · ${t('industry.excess')} ${fmt.format(point.excess)}% · ${t('industry.acceleration')} ${fmt.format(point.acceleration)}`}
                  onClick={select}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() } }}>
                  <circle cx={x(point.excess)} cy={y(point.acceleration)} r={radius} className={point.excess >= 0
                    ? point.acceleration >= 0 ? css.leading : css.fading : point.acceleration >= 0 ? css.recovering : css.weakening} />
                  <text x={x(point.excess)} y={y(point.acceleration) - radius - 4} textAnchor="middle">{point.name}</text>
                  <title>{`${point.name} · ${t('industry.excess')} ${fmt.format(point.excess)}% · ${t('industry.acceleration')} ${fmt.format(point.acceleration)}`}</title>
                </g>
              })}
            </svg></div>}
        </section>
        <section className={css.panel} aria-label={t('industry.profile')}>
          <div className={css.panelHead}><h2>{t('industry.profile')}</h2><small>{selectedSector?.thscode ?? '—'}</small></div>
          <h3>{active?.name ?? '—'}</h3>
          {active !== undefined && <div className={css.profileStats}>
            <span>{t('industry.strength')} <b>{fmt.format(active.strength)}</b></span>
            <span>{t('industry.excess')} <b>{fmt.format(active.excess)}%</b></span>
            <span>{t('industry.acceleration')} <b>{fmt.format(active.acceleration)}</b></span>
            <span>{t('industry.pulse')} <b>{active.pulse === null ? '—' : `${fmt.format(active.pulse)}×`}</b></span>
          </div>}
          <svg viewBox="0 0 300 90" className={css.mini} role="img" aria-label={t('industry.comparison')}>
            <path d={path('benchmark')} className={css.benchmarkLine} /><path d={path('industry')} className={css.industryLine} />
          </svg><p className={css.legend}>{t('industry.comparison')}</p>
          <h4>{t('industry.constituents')}</h4>
          {detailLoading && <p>{t('industry.detailLoading')}</p>}
          {detailError && <p role="alert">{t('industry.detailFailure')}</p>}
          {detail !== null && detail.board.sector.thscode === active?.code && <>
            <p className={css.note}>{t('industry.quoteCoverage')} {quotes.length} / {detail.board.constituents.length} · {t('industry.rising')} {gainers} · {t('industry.falling')} {losers}</p>
            <div className={css.stocks}>{selectedQuotes.map(quote => <button type="button" key={quote.thscode}
              onClick={() => { onStock(quote.thscode) }}><span>{names.get(quote.thscode) ?? quote.thscode}</span>
              <b className={quote.changePct > 0 ? css.up : quote.changePct < 0 ? css.down : css.flat}>{quote.changePct > 0 ? '+' : ''}{fmt.format(quote.changePct)}%</b></button>)}</div>
          </>}
        </section>
      </div>
      <section className={css.panel} aria-label={t('industry.heat')}>
        <div className={css.panelHead}><div><h2>{t('industry.heat')}</h2><p>{t('industry.heatDescription')}</p></div>
          <div className={css.windows}><button type="button" aria-pressed={sort === 'strength'} onClick={() => { setSort('strength') }}>{t('industry.sortStrength')}</button>
            <button type="button" aria-pressed={sort === 'acceleration'} onClick={() => { setSort('acceleration') }}>{t('industry.sortAcceleration')}</button></div></div>
        <div className={css.heatScroll}><div className={css.heatRows}>{rows.map(point => <button type="button" key={point.code}
          className={point.code === active?.code ? css.selectedRow : css.heatRow}
          aria-pressed={point.code === active?.code}
          aria-label={`${point.name} · ${t('industry.strength')} ${fmt.format(point.strength)} · ${t('industry.heatScores')} ${point.heat.map((value, index) => `${index + 1}/${point.heat.length}: ${value === null ? t('industry.heatMissing') : fmt.format(value)}`).join('，')}`}
          onClick={() => {
            const sector = data.industries.find(item => item.sector.thscode === point.code)?.sector
            if (sector) onSelect(sector)
          }}>
          <span>{point.name}</span><span>{fmt.format(point.strength)}</span><div>{point.heat.map((value, index) => <i key={index}
            className={value === null ? css.missing : value > 0 ? css.hot : value < 0 ? css.cold : css.flatHeat}
            title={`${index + 1}/${point.heat.length} · ${value === null ? t('industry.heatMissing') : fmt.format(value)}`}
            aria-hidden="true" style={value === null ? undefined : { opacity: .2 + Math.abs(value) / 2 * .8 }} />)}</div></button>)}</div></div>
      </section>
      {(data.catalogTruncated || data.industriesTruncated || data.unavailableCount > 0
        || data.industries.some(item => item.history.truncated))
        && <p className={css.note}>{t('industry.truncated')}</p>}
      <footer>{t('industry.disclaimer')}</footer>
    </>}
  </div></div>
}
