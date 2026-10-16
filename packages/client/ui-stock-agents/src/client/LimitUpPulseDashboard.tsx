/** Closing-limit market pulse with synchronized trend, ladder, and reason views. */
import { useEffect, useState } from 'react'
import type { LimitUpPulseDashboard as PulseData, LimitUpPulseDay, LimitUpPulseStock } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { DashboardScope } from './dashboard-inquiry.ts'
import css from './LimitUpPulseDashboard.module.css'
import type { StockAgentsKey } from './locales.ts'

type Translate = (key: StockAgentsKey) => string
type Mode = 'absolute' | 'percentile'
const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const
const CHART = { width: 1060, left: 67, right: 1030, top: 46, countBottom: 195, heatTop: 233, heatRow: 31, sealTop: 457, sealBottom: 528 }

function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0) }

/** Metrics computed only from rows returned for a date. */
export function pulseFacts(day: LimitUpPulseDay) {
  const pairs = day.stocks.filter(stock => stock.sealMoney !== undefined && stock.maxSealMoney !== undefined && stock.maxSealMoney > 0)
  const knownSeals = day.stocks.flatMap(stock => stock.sealMoney === undefined ? [] : [stock.sealMoney])
  const seal = knownSeals.length === 0 ? null : sum(knownSeals)
  const maxSeal = sum(pairs.map(stock => stock.maxSealMoney ?? 0))
  const retained = sum(pairs.map(stock => stock.sealMoney ?? 0))
  return {
    count: day.stocks.length,
    continuous: day.stocks.filter(stock => stock.boards >= 2).length,
    highest: Math.max(0, ...day.stocks.map(stock => stock.boards)),
    seal,
    sealIncomplete: knownSeals.length < day.stocks.length,
    retention: maxSeal > 0 ? retained / maxSeal * 100 : null,
  }
}

function rank(value: number, values: readonly number[]): number {
  return value === 0 || values.length === 0 ? 0 : values.filter(item => item <= value).length / values.length * 100
}

function money(value: number): string { return `${(value / 100_000_000).toFixed(1)}亿` }

function reasonsOf(stocks: readonly LimitUpPulseStock[]): readonly { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const stock of stocks) {
    if (stock.reason !== undefined) counts.set(stock.reason, (counts.get(stock.reason) ?? 0) + 1)
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count)
}

interface Props {
  readonly data: PulseData | null
  readonly loading: boolean
  readonly error: boolean
  readonly onRetry: () => void
  readonly onScopeChange: (scope: DashboardScope) => void
  readonly focus: { readonly code: string; readonly sequence: number } | null
  readonly t: Translate
}

/** Render the recent trading-day pulse without replacing missing values with zero. */
export function LimitUpPulseDashboard({ data, loading, error, onRetry, onScopeChange, focus, t }: Props) {
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStock, setSelectedStock] = useState<string | undefined>()
  const [mode, setMode] = useState<Mode>('absolute')
  const days = data?.days ?? []
  const selected = days.find(day => day.date === selectedDate) ?? days.at(-1)
  useEffect(() => {
    if (selected === undefined) return
    if (selected.date !== selectedDate) setSelectedDate(selected.date)
    onScopeChange({ kind: 'pulse', date: selected.date })
  }, [data])
  useEffect(() => {
    if (focus === null) return
    const day = days.findLast(item => item.stocks.some(stock => stock.thscode === focus.code))
    if (day === undefined) return
    setSelectedDate(day.date)
    setSelectedStock(focus.code)
    onScopeChange({ kind: 'pulse', date: day.date, stock: focus.code })
  }, [focus?.sequence])

  const selectDay = (day: LimitUpPulseDay) => {
    setSelectedDate(day.date)
    setSelectedStock(undefined)
    onScopeChange({ kind: 'pulse', date: day.date })
  }
  const selectStock = (stock: LimitUpPulseStock) => {
    if (selected === undefined) return
    setSelectedStock(stock.thscode)
    onScopeChange({ kind: 'pulse', date: selected.date, stock: stock.thscode })
  }
  if (loading && data === null) return <div className={css.center}><span className={css.spinner} aria-label={t('pulse.loading')}>◌</span></div>
  if (data === null) return <div className={css.center}>{error
    ? <div className={css.empty}><p>{t('pulse.loadFailure')}</p><button type="button" onClick={onRetry}>{t('pulse.retry')}</button></div>
    : t('pulse.empty')}</div>
  const facts = days.map(pulseFacts)
  const current = selected === undefined ? undefined : pulseFacts(selected)
  const previous = selected === undefined ? undefined : days[days.indexOf(selected) - 1]
  const previousFacts = previous === undefined ? undefined : pulseFacts(previous)
  const comparable = selected !== undefined && previous !== undefined && !selected.poolTruncated && !previous.poolTruncated
  const mood = current === undefined || previousFacts === undefined || !comparable ? t('pulse.unknown')
    : current.count > previousFacts.count ? t('pulse.warming')
      : current.count < previousFacts.count ? t('pulse.cooling') : t('pulse.steady')
  const maxCount = Math.max(1, ...facts.map(item => item.count))
  const maxSeal = Math.max(1, ...facts.map(item => item.seal ?? 0))
  const cellWidth = (CHART.right - CHART.left) / Math.max(1, days.length)
  const sealPoints = facts.map((item, index) => item.seal === null ? null
    : `${CHART.left + cellWidth * (index + .5)},${CHART.sealBottom - item.seal / maxSeal * (CHART.sealBottom - CHART.sealTop)}`)
  const retentionSegments = facts.map((item, index) => item.retention === null ? null
    : `${CHART.left + cellWidth * (index + .5)},${CHART.sealBottom - item.retention / 100 * (CHART.sealBottom - CHART.sealTop)}`)
  const reasonList = selected === undefined ? [] : reasonsOf(selected.stocks)
  const reasons = reasonList.slice(0, 10)
  const reasonMax = Math.max(1, ...reasons.map(item => item.count))
  const changes = current === undefined || previousFacts === undefined || !comparable ? [] : [
    { label: t('pulse.limitCount'), value: current.count - previousFacts.count, suffix: '' },
    { label: t('pulse.continuous'), value: current.continuous - previousFacts.continuous, suffix: '' },
    ...current.seal === null || previousFacts.seal === null || current.sealIncomplete || previousFacts.sealIncomplete ? []
      : [{ label: t('pulse.totalSeal'), value: (current.seal - previousFacts.seal) / 100_000_000, suffix: t('pulse.hundredMillion') }],
    ...current.retention === null || previousFacts.retention === null ? []
      : [{ label: t('pulse.retention'), value: current.retention - previousFacts.retention, suffix: '%' }],
  ]
  const maxChange = Math.max(1, ...changes.map(item => Math.abs(item.value)))
  const shownLevels = LEVELS.map(level => ({
    level,
    stocks: selected === undefined ? [] : level === 1
      ? selected.stocks.filter(stock => stock.boards === 1).map(stock => ({ name: stock.name, thscode: stock.thscode }))
      : selected.levels.find(item => item.boards === level)?.stocks ?? [],
  }))
  const download = () => {
    const rows = [[t('pulse.exportDate'), t('pulse.limitCount'), t('pulse.continuous'), t('pulse.totalSeal'), t('pulse.retention'), t('pulse.incomplete')],
      ...days.map((day, index) => [day.date, String(facts[index]?.count ?? ''), String(facts[index]?.continuous ?? ''),
        facts[index]?.seal?.toString() ?? '', facts[index]?.retention?.toFixed(1) ?? '', day.poolTruncated ? t('pulse.yes') : t('pulse.no')])]
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'limit-up-pulse.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className={css.scroll}><div className={css.dashboard}>
    <header className={css.hero}>
      <div><span className={css.eyebrow}>{t('pulse.eyebrow')}</span><h1>{t('pulse.title')}</h1><p>{t('pulse.subtitle')}</p></div>
      <div className={css.controls}><label>{t('pulse.tradeDate')} <select value={selected?.date ?? ''}
        onChange={(event) => { const day = days.find(item => item.date === event.target.value); if (day !== undefined) selectDay(day) }}>
        {days.map(day => <option key={day.date} value={day.date}>{day.date}</option>)}
      </select></label>
      <div className={css.mode} role="group" aria-label={t('pulse.displayMode')}>
        <button type="button" aria-pressed={mode === 'absolute'} onClick={() => { setMode('absolute') }}>{t('pulse.absolute')}</button>
        <button type="button" aria-pressed={mode === 'percentile'} onClick={() => { setMode('percentile') }}>{t('pulse.percentile')}</button>
      </div><button type="button" onClick={download}>{t('pulse.export')}</button></div>
    </header>
    {error && <p className={css.notice} role="alert">{t('pulse.refreshFailure')}</p>}
    <section className={css.metrics} aria-label={t('pulse.overview')}>
      <div><span>{t('pulse.mood')}</span><strong className={css.accent}>{mood}</strong><small>{previous === undefined ? t('pulse.noPrevious') : t('pulse.dayChange')}</small></div>
      <div><span>{t('pulse.limitCount')}</span><strong className={css.rose}>{current === undefined ? '—' : `${selected?.poolTruncated ? '≥' : ''}${current.count}`}</strong></div>
      <div><span>{t('pulse.retention')}</span><strong className={css.rose}>{current?.retention === null || current === undefined ? '—' : `${current.retention.toFixed(1)}%`}</strong><small>{t('pulse.returnedSample')}</small></div>
      <div><span>{t('pulse.continuous')}</span><strong>{current === undefined ? '—' : `${selected?.poolTruncated ? '≥' : ''}${current.continuous}`}</strong></div>
      <div><span>{t('pulse.highest')}</span><strong>{current?.highest === undefined || current.highest === 0 ? '—' : `${current.highest} ${t('pulse.boards')}`}</strong></div>
      <div><span>{t('pulse.totalSeal')}</span><strong>{current?.seal === null || current === undefined ? '—'
        : `${selected?.poolTruncated || current.sealIncomplete ? '≥' : ''}${money(current.seal)}`}</strong></div>
    </section>
    <div className={css.mainGrid}>
      <section className={css.panel} aria-label={t('pulse.trend')}>
        <div className={css.panelHead}><div><h2>{t('pulse.trend')}</h2><p>{t('pulse.trendDescription')}</p></div>
          <div className={css.legend}><span className={css.limitKey}>{t('pulse.limitCount')}</span><span className={css.continuousKey}>{t('pulse.continuous')}</span><span className={css.sealKey}>{t('pulse.totalSeal')}</span></div></div>
        {days.length === 0 ? <p className={css.empty}>{t('pulse.empty')}</p> : <div className={css.chartScroll}>
          <svg className={css.chart} viewBox={`0 0 ${CHART.width} 563`} role="img" aria-label={t('pulse.trend')}>
            {[0, .5, 1].map(fraction => <g key={fraction} className={css.gridLine}><line x1={CHART.left} x2={CHART.right} y1={CHART.countBottom - fraction * 130} y2={CHART.countBottom - fraction * 130} /><text x={CHART.left - 8} y={CHART.countBottom - fraction * 130 + 4} textAnchor="end">{mode === 'absolute' ? Math.round(maxCount * fraction) : `${Math.round(fraction * 100)}%`}</text></g>)}
            {days.map((day, index) => {
              const x = CHART.left + cellWidth * index
              const item = facts[index]
              if (item === undefined) return null
              const total = mode === 'absolute' ? item.count / maxCount : rank(item.count, facts.map(value => value.count)) / 100
              const continuous = mode === 'absolute' ? item.continuous / maxCount : rank(item.continuous, facts.map(value => value.continuous)) / 100
              const selectedColumn = selected?.date === day.date
              return <g key={day.date} className={selectedColumn ? css.selectedColumn : undefined}>
                {selectedColumn && <rect className={css.selection} x={x} y={CHART.top - 10}
                  width={cellWidth} height={CHART.sealBottom - CHART.top + 23} />}
                <rect className={css.limitBar} x={x + cellWidth * .13}
                  y={CHART.countBottom - total * 130} width={cellWidth * .35} height={total * 130} />
                <rect className={css.continuousBar} x={x + cellWidth * .51}
                  y={CHART.countBottom - continuous * 130} width={cellWidth * .29} height={continuous * 130} />
                {LEVELS.slice(1).map((level, row) => {
                  const count = day.levels.find(item => item.boards === level)?.stocks.length ?? 0
                  return <rect key={level} className={css.heatCell} x={x + 1}
                    y={CHART.heatTop + row * CHART.heatRow} width={Math.max(1, cellWidth - 2)} height={CHART.heatRow - 3}
                    style={{ opacity: count === 0 ? .09 : Math.max(.22, Math.min(1, count / 8)) }}><title>{day.date} · {level === 7 ? '7+' : level} {t('pulse.boards')} · {count} {t('pulse.sampleStocks')}</title></rect>
                })}
                {(index % Math.max(1, Math.ceil(days.length / 6)) === 0 || index === days.length - 1) &&
                  <text className={css.dateLabel} x={x + cellWidth / 2} y={555} textAnchor="middle">{day.date.slice(5)}</text>}
                <rect className={css.hitArea} x={x} y={CHART.top - 10} width={cellWidth} height={CHART.sealBottom - CHART.top + 25}
                  onClick={() => { selectDay(day) }}>
                  <title>{day.date} · {t('pulse.limitCount')} ${day.poolTruncated ? '≥' : ''}${item.count} · {t('pulse.continuous')} ${item.continuous}</title>
                </rect>
              </g>
            })}
            {LEVELS.slice(1).map((level, row) => <text className={css.axisLabel} key={level} x={CHART.left - 8} y={CHART.heatTop + row * CHART.heatRow + 18} textAnchor="end">{level === 7 ? '7+' : level}{t('pulse.boards')}</text>)}
            <text className={css.axisLabel} x={CHART.left} y={CHART.heatTop - 9}>{t('pulse.ladderSample')}</text>
            <text className={css.axisLabel} x={CHART.left} y={CHART.sealTop - 11}>{t('pulse.sealAndRetention')}</text>
            {sealPoints.every(point => point !== null) && <polyline className={css.sealLine} points={sealPoints.join(' ')} />}
            {sealPoints.map((point, index) => point === null ? null : <circle key={index} className={css.sealPoint}
              cx={Number(point.split(',')[0])} cy={Number(point.split(',')[1])} r={2.5} />)}
            {retentionSegments.map((point, index) => point === null ? null : <circle key={index} className={css.retentionPoint}
              cx={Number(point.split(',')[0])} cy={Number(point.split(',')[1])} r={2.5}><title>{days[index]?.date} · {t('pulse.retention')} {facts[index]?.retention?.toFixed(1)}%</title></circle>)}
            {retentionSegments.join(' ').split(' ').filter(Boolean).length === days.length && <polyline className={css.retentionLine} points={retentionSegments.join(' ')} />}
          </svg>
        </div>}
        <p className={css.note}>{t('pulse.chartScope')}</p>
      </section>
      <section className={css.panel} aria-label={t('pulse.ladder')}><div className={css.panelHead}><div><h2>{t('pulse.ladder')}</h2><p>{selected?.date ?? '—'} · {t('pulse.ladderHint')}</p></div></div>
        <div className={css.ladder}>{shownLevels.map(({ level, stocks }) => <div className={css.ladderRow} key={level}>
          <strong>{level === 1 ? t('pulse.firstBoard') : `${level === 7 ? '7+' : level} ${t('pulse.boards')}`}</strong>
          <div className={css.chips}>{stocks.slice(0, 4).map((stock, index) => {
            const matched = selected?.stocks.find(item => item.thscode === stock.thscode || item.name === stock.name)
            return matched === undefined
              ? <span key={`${stock.name}-${index}`}>{stock.name}</span>
              : <button type="button" key={matched.thscode} className={selectedStock === matched.thscode ? css.activeChip : undefined} onClick={() => { selectStock(matched) }}>{matched.name}<small>{matched.sealMoney === undefined ? t('pulse.unknown') : money(matched.sealMoney)}</small></button>
          })}{stocks.length > 4 && <small>{t('pulse.more')} {stocks.length - 4}</small>}</div>
          <b>{stocks.length}</b>
        </div>)}</div>
        <p className={css.note}>{t('pulse.ladderScope')}</p>
      </section>
    </div>
    <div className={css.bottomGrid}>
      <section className={css.panel}><div className={css.panelHead}><div><h2>{t('pulse.change')}</h2><p>{t('pulse.changeDescription')}</p></div><strong className={css.accent}>{mood}</strong></div>
        {changes.length === 0 ? <p className={css.empty}>{previous === undefined ? t('pulse.noPrevious') : t('pulse.notComparable')}</p>
          : <div className={css.changes}>{changes.map(item => <div key={item.label}>
            <span>{item.label}</span><div className={css.changeTrack}><i className={item.value >= 0 ? css.positive : css.negative} style={{ width: `${Math.abs(item.value) / maxChange * 50}%`, left: item.value >= 0 ? '50%' : `${50 - Math.abs(item.value) / maxChange * 50}%` }} /></div>
            <strong>{item.value > 0 ? '+' : ''}{item.value.toFixed(item.suffix === '' ? 0 : 1)}{item.suffix}</strong>
          </div>)}</div>}
      </section>
      <section className={css.panel}><div className={css.panelHead}><div><h2>{t('pulse.reasons')}</h2><p>{t('pulse.reasonDescription')}</p></div></div>
        {reasons.length === 0 ? <p className={css.empty}>{t('pulse.noReasons')}</p> : <div className={css.reasons}>{reasons.map(item => <div key={item.name}>
          <span title={item.name}>{item.name}</span><div><i style={{ width: `${item.count / reasonMax * 100}%` }} /></div><strong>{item.count}</strong>
        </div>)}</div>}
      </section>
    </div>
    <footer>{t('pulse.disclaimer')}{selected?.poolTruncated && <> · {t('pulse.poolTruncated')}</>}</footer>
  </div></div>
}
