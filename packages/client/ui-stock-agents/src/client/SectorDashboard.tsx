/** Concept and industry index history beside current constituent membership. */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SectorCatalog, SectorDashboard as DashboardData, SectorMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import { IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { DashboardScope } from './dashboard-inquiry.ts'
import css from './SectorDashboard.module.css'

interface Props {
  readonly catalog: SectorCatalog | null
  readonly data: DashboardData | null
  readonly loading: boolean
  readonly error: boolean
  readonly selected: SectorMatch | null
  readonly onSelect: (sector: SectorMatch) => void
  readonly onRetry: () => void
  readonly onScopeChange: (scope: Extract<DashboardScope, { kind: 'sector' }>) => void
  readonly focus?: { readonly code: string; readonly sequence: number } | null
  readonly t: TranslateNS<'stockAgents'>
}

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const date = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' })
const CHART = { width: 700, height: 324, left: 12, right: 624, top: 18, bottom: 230, volumeTop: 256, volumeBottom: 292 } as const

/** Render a searchable board catalog and independent index and member views. */
export function SectorDashboard({ catalog, data, loading, error, selected, onSelect, onRetry, onScopeChange, focus, t }: Props) {
  const [query, setQuery] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [window, setWindow] = useState<30 | 60 | 120>(120)
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const appliedFocus = useRef<number | null>(null)
  const previousSector = useRef(data?.sector.thscode)
  useEffect(() => {
    const sector = data?.sector.thscode
    if (sector === undefined || previousSector.current === sector) return
    previousSector.current = sector
    appliedFocus.current = null
    setSelectedStock(null)
  }, [data?.sector.thscode])
  useEffect(() => { if (selected !== null) setQuery(selected.name) }, [selected])
  const normalized = query.trim().toLocaleLowerCase()
  const matches = useMemo(() => {
    const exact = (item: SectorMatch) => item.name.toLocaleLowerCase() === normalized
      || item.thscode.toLocaleLowerCase() === normalized
    return catalog?.matches.filter(item => item.name.toLocaleLowerCase().includes(normalized)
      || item.thscode.toLocaleLowerCase().includes(normalized))
      .sort((left, right) => Number(exact(right)) - Number(exact(left))).slice(0, 12) ?? []
  }, [catalog, normalized])
  useEffect(() => {
    if (focus === null || focus === undefined || data === null || appliedFocus.current === focus.sequence) return
    if (data.constituents.some(item => item.thscode === focus.code)) {
      appliedFocus.current = focus.sequence
      setSelectedStock(focus.code)
      onScopeChange({ kind: 'sector', sector: data.sector.thscode, windowDays: window, stock: focus.code })
    }
  }, [focus, data, onScopeChange, window])
  const selectedCode = selectedStock ?? focus?.code
  const members = data?.constituents.filter(item => item.name.includes(memberQuery.trim())
    || item.thscode.includes(memberQuery.trim())) ?? []
  const latestTime = data?.history.candles.at(-1)?.time
  const candles = data === null || latestTime === undefined ? [] : data.history.candles.filter(bar =>
    bar.time >= latestTime - window * 24 * 60 * 60 * 1000)
  const priceLow = candles.length === 0 ? 0 : Math.min(...candles.map(item => item.low))
  const priceHigh = candles.length === 0 ? 0 : Math.max(...candles.map(item => item.high))
  const padding = Math.max((priceHigh - priceLow) * 0.08, Math.abs(priceHigh) * 0.002, 0.01)
  const domainLow = priceLow - padding
  const domainHigh = priceHigh + padding
  const priceY = (value: number) => CHART.bottom - (value - domainLow) / (domainHigh - domainLow) * (CHART.bottom - CHART.top)
  const plotWidth = CHART.right - CHART.left
  const candleStep = plotWidth / Math.max(candles.length, 1)
  const bodyWidth = Math.min(11, Math.max(3, candleStep * 0.65))
  const maxVolume = Math.max(1, ...candles.map(item => item.volume))
  const ticks = Array.from({ length: 5 }, (_, index) => domainHigh - (domainHigh - domainLow) * index / 4)
  const dates = [...new Set([0, Math.floor((candles.length - 1) / 2), candles.length - 1])]
  const dateTicks = dates.flatMap((index) => {
    const bar = candles[index]
    return bar === undefined ? [] : [{ index, time: bar.time }]
  })
  const first = candles[0]
  const last = candles.at(-1)
  const change = first === undefined || last === undefined || first.close === 0 ? null : (last.close / first.close - 1) * 100
  const recent = data?.history.candles.slice(-21) ?? []
  const returns: number[] = []
  let previousClose: number | null = null
  for (const bar of recent) {
    if (previousClose !== null && previousClose !== 0) returns.push((bar.close / previousClose - 1) * 100)
    previousClose = bar.close
  }
  const average = returns.length === 0 ? 0 : returns.reduce((sum, value) => sum + value, 0) / returns.length
  const volatility = returns.length === 0 ? null
    : Math.sqrt(returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / returns.length)
  return <div className={css.scroll}><div className={css.dashboard}>
    <header className={css.hero}><div><span className={css.eyebrow}>{t('sector.eyebrow')}</span><h1>{t('sector.title')}</h1><p>{t('sector.subtitle')}</p></div></header>
    <form className={css.search} onSubmit={(event) => {
      event.preventDefault()
      const exact = matches.find(item => item.name === query.trim() || item.thscode.toLowerCase() === normalized)
      if (exact !== undefined) { onSelect(exact); setQuery(exact.name); setSelectedStock(null) }
    }}>
      <label htmlFor="sector-name">{t('sector.input')}</label>
      <div><input id="sector-name" value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder={t('sector.placeholder')} />
        <button type="submit" disabled={!matches.some(item => item.name === query.trim() || item.thscode.toLowerCase() === normalized)}>{t('sector.load')}</button></div>
      {normalized !== '' && <div className={css.suggestions} aria-label={t('sector.matches')}>
        {matches.map(item => <button type="button" key={`${item.kind}-${item.thscode}`} onClick={() => {
          onSelect(item); setQuery(item.name); setSelectedStock(null)
        }}>{item.name}<small>{item.kind === 'concept' ? t('sector.concept') : t('sector.industry')} · {item.thscode}</small></button>)}
        {matches.length === 0 && catalog !== null && <span>{t('sector.noMatch')}</span>}
      </div>}
      {catalog?.truncated && <p className={css.note}>{t('sector.catalogTruncated')}</p>}
    </form>
    {loading && <div className={css.center}><IconLoadingOutlineRegular className={css.spinner} size={24} /></div>}
    {error && <div className={css.notice} role="alert">{data === null ? t('sector.loadFailure') : t('sector.refreshFailure')} <button type="button" onClick={onRetry}>{t('sector.retry')}</button></div>}
    {!loading && catalog !== null && selected === null && <div className={css.center}>{t('sector.choose')}</div>}
    {data !== null && <>
      <section className={css.metrics} aria-label={t('sector.overview')}>
        <div><span>{t('sector.board')}</span><strong>{data.sector.name}</strong><small>{data.sector.thscode}</small></div>
        <div><span>{t('sector.members')}</span><strong>{data.constituents.length}{data.constituentsTruncated ? '+' : ''}</strong><small>{t('sector.current')}</small></div>
        <div><span>{t('sector.lastClose')}</span><strong>{last === undefined ? '—' : number.format(last.close)}</strong><small>{last === undefined ? t('sector.noHistory') : date.format(last.time)}</small></div>
        <div><span>{t('sector.windowChange')}</span><strong className={change === null ? undefined : change >= 0 ? css.up : css.down}>{change === null ? '—' : `${change >= 0 ? '+' : ''}${number.format(change)}%`}</strong><small>{t('sector.selectedWindow')}</small></div>
        <div><span>{t('sector.volatility')}</span><strong>{volatility === null ? '—' : `${number.format(volatility)}%`}</strong><small>{t('sector.dailyReturns')}</small></div>
        <div><span>{t('sector.turnover')}</span><strong>{last === undefined ? '—' : compact.format(last.turnover)}</strong><small>{t('sector.latestDay')}</small></div>
      </section>
      <div className={css.grid}>
        <section className={css.chartPanel} aria-label={t('sector.history')}>
          <div className={css.panelHead}><div><span className={css.eyebrow}>{t('sector.chartEyebrow')}</span><h2>{t('sector.history')}</h2></div><div className={css.windows}>
            {([30, 60, 120] as const).map(days => <button type="button" key={days} aria-pressed={window === days} onClick={() => {
              setWindow(days)
              onScopeChange({ kind: 'sector', sector: data.sector.thscode, windowDays: days,
                ...(selectedCode === undefined ? {} : { stock: selectedCode }) })
            }}>{t(`sector.days${days}`)}</button>)}
          </div></div>
          {first === undefined || last === undefined ? <div className={css.center}>{t('sector.noHistory')}</div> : <>
            <div className={css.chartSummary}>
              <strong>{date.format(last.time)}</strong>
              <span>{t('sector.open')} <b>{number.format(last.open)}</b></span>
              <span>{t('sector.high')} <b>{number.format(last.high)}</b></span>
              <span>{t('sector.low')} <b>{number.format(last.low)}</b></span>
              <span>{t('sector.close')} <b className={last.close >= last.open ? css.up : css.down}>{number.format(last.close)}</b></span>
              <span>{t('sector.volume')} <b>{compact.format(last.volume)}</b></span>
            </div>
            <div className={css.chartViewport}><svg className={css.chart} viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={t('sector.history')}>
              {ticks.map((value, index) => <g key={index} className={css.gridLine}>
                <line x1={CHART.left} x2={CHART.right} y1={priceY(value)} y2={priceY(value)} />
                <text x={CHART.right + 10} y={priceY(value) + 4}>{number.format(value)}</text>
              </g>)}
              <line className={css.volumeDivider} x1={CHART.left} x2={CHART.right} y1={CHART.volumeTop - 9} y2={CHART.volumeTop - 9} />
              {candles.map((bar, index) => {
                const x = CHART.left + (index + 0.5) * candleStep
                const openY = priceY(bar.open)
                const closeY = priceY(bar.close)
                const rising = bar.close >= bar.open
                const bodyTop = Math.min(openY, closeY)
                const volumeHeight = Math.max(1, bar.volume / maxVolume * (CHART.volumeBottom - CHART.volumeTop))
                const tooltip = [date.format(bar.time),
                  `${t('sector.open')} ${number.format(bar.open)}`, `${t('sector.high')} ${number.format(bar.high)}`,
                  `${t('sector.low')} ${number.format(bar.low)}`, `${t('sector.close')} ${number.format(bar.close)}`,
                  `${t('sector.volume')} ${compact.format(bar.volume)}`].join(' · ')
                return <g key={bar.time} className={rising ? css.risingCandle : css.fallingCandle}>
                  <title>{tooltip}</title>
                  <line className={css.wick} x1={x} x2={x} y1={priceY(bar.high)} y2={priceY(bar.low)} />
                  <rect className={css.candleBody} x={x - bodyWidth / 2} y={bodyTop}
                    width={bodyWidth} height={Math.max(2, Math.abs(openY - closeY))} />
                  <rect className={css.volumeBar} x={x - bodyWidth / 2} y={CHART.volumeBottom - volumeHeight}
                    width={bodyWidth} height={volumeHeight} />
                </g>
              })}
              {dateTicks.map(({ index, time }) => <text key={index} className={css.dateTick}
                x={CHART.left + (index + 0.5) * candleStep} y={CHART.height - 9}
                textAnchor={index === 0 ? 'start' : index === candles.length - 1 ? 'end' : 'middle'}>
                {date.format(time)}
              </text>)}
            </svg></div>
            <div className={css.chartLegend}><span className={css.upMarker} />{t('sector.rise')}<span className={css.downMarker} />{t('sector.fall')}<span className={css.volumeMarker} />{t('sector.volume')}</div>
          </>}
          {data.history.truncated && <p className={css.note}>{t('sector.historyTruncated')}</p>}
        </section>
        <section className={css.memberPanel} aria-label={t('sector.members')}>
          <div className={css.panelHead}><div><span className={css.eyebrow}>{t('sector.memberEyebrow')}</span><h2>{t('sector.members')}</h2></div><small>{t('sector.current')}</small></div>
          <label htmlFor="sector-member-search">{t('sector.memberSearch')}</label>
          <input id="sector-member-search" value={memberQuery} onChange={(event) => { setMemberQuery(event.target.value) }} placeholder={t('sector.memberPlaceholder')} />
          <div className={css.memberList}>{members.map(item => <button type="button" key={item.thscode} className={selectedCode === item.thscode ? css.selected : undefined} onClick={() => {
            setSelectedStock(item.thscode)
            onScopeChange({ kind: 'sector', sector: data.sector.thscode, windowDays: window, stock: item.thscode })
          }}><strong>{item.name}</strong><small>{item.thscode}</small></button>)}</div>
          {members.length === 0 && <p className={css.note}>{t('sector.noMembers')}</p>}
          {data.constituentsTruncated && <p className={css.note}>{t('sector.membersTruncated')}</p>}
        </section>
      </div>
      <footer>{t('sector.disclaimer')}</footer>
    </>}
  </div></div>
}
