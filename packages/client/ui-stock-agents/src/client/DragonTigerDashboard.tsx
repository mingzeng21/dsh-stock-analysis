/** Interactive dragon-tiger dashboard rendered directly in the Agents panel. */
import { useState, type CSSProperties } from 'react'
import type { DragonTigerBoard, DragonTigerBoardType, DragonTigerDashboard as DashboardData, DragonTigerStock } from '@deepseek-ai/dsh-api-stock-controller/client'
import { IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DragonTigerDashboard.module.css'

type Translate = PropsLocale<'stockAgents'>['t']
type SortKey = 'netValue' | 'orgNetValue' | 'hotMoneyNetValue'

/** Data and actions supplied by the Agents panel. */
export interface DragonTigerDashboardProps {
  readonly data: DashboardData | null
  readonly loading: boolean
  readonly error: boolean
  readonly onRetry: () => void
  readonly t: Translate
}

const BOARD_TYPES: readonly DragonTigerBoardType[] = ['all', 'org', 'hot_money']
const SORT_KEYS: readonly SortKey[] = ['netValue', 'orgNetValue', 'hotMoneyNetValue']

function amount(value: number, t: Translate): string {
  const magnitude = Math.abs(value)
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  if (magnitude >= 100_000_000) return `${sign}${(magnitude / 100_000_000).toFixed(2)}${t('dragon.hundredMillionUnit')}`
  if (magnitude >= 10_000) return `${sign}${(magnitude / 10_000).toFixed(1)}${t('dragon.tenThousandUnit')}`
  return `${sign}${magnitude.toFixed(0)}`
}

function sumNet(board: DragonTigerBoard): number {
  return board.stocks.reduce((sum, stock) => sum + stock.netValue, 0)
}

function boardLabel(type: DragonTigerBoardType, t: Translate): string {
  switch (type) {
    case 'all': return t('dragon.boardAll')
    case 'org': return t('dragon.boardOrg')
    case 'hot_money': return t('dragon.boardHot')
  }
}

function metricLabel(key: SortKey, t: Translate): string {
  switch (key) {
    case 'netValue': return t('dragon.net')
    case 'orgNetValue': return t('dragon.orgNet')
    case 'hotMoneyNetValue': return t('dragon.hotNet')
  }
}

function barStyle(value: number, maximum: number): CSSProperties {
  return { width: `${value === 0 ? 0 : Math.max(1, Math.abs(value) / maximum * 100)}%` }
}

/** Render the latest boards, their signed amounts, stock list, and linked seats. */
export function DragonTigerDashboard({ data, loading, error, onRetry, t }: DragonTigerDashboardProps) {
  const [boardType, setBoardType] = useState<DragonTigerBoardType>('all')
  const [sortKey, setSortKey] = useState<SortKey>('netValue')
  const [selection, setSelection] = useState<string | null>(null)

  if (data === null) {
    if (loading) return <div className={css.center}><IconLoadingOutlineRegular className={css.spinner} size={24} /></div>
    return <div className={css.center} role="alert"><p>{t('dragon.loadFailure')}</p><button type="button" onClick={onRetry}>{t('dragon.retry')}</button></div>
  }

  const board = data.boards.find(item => item.type === boardType) ?? data.boards[0]
  if (board === undefined) return <div className={css.center} role="alert">{t('dragon.loadFailure')}</div>
  const boards = BOARD_TYPES.flatMap(type => data.boards.find(item => item.type === type) ?? [])
  const chartMax = Math.max(1, ...boards.map(item => Math.abs(sumNet(item))))
  const stocks = board.stocks.map((stock, index) => ({ stock, index })).sort((a, b) => {
    const left = a.stock[sortKey]
    const right = b.stock[sortKey]
    if (left === undefined) return right === undefined ? 0 : 1
    if (right === undefined) return -1
    return right - left
  })
  const maxStock = Math.max(1, ...stocks.map(({ stock }) => Math.abs(stock[sortKey] ?? 0)))
  const selectedStock = selection?.startsWith('stock:')
    ? board.stocks[Number(selection.slice(6))] : undefined
  const selectedSeat = selection?.startsWith('seat:')
    ? board.seats[Number(selection.slice(5))] : undefined

  return <div className={css.scroll}>
    <div className={css.dashboard}>
      <header className={css.hero}>
        <div>
          <span className={css.eyebrow}>{t('dragon.eyebrow')}</span>
          <h1>{t('dragon.title')}</h1>
          <p>{t('dragon.subtitle')}</p>
        </div>
        <div className={css.dateCard}>
          <span>{t('dragon.tradeDate')}</span>
          <strong>{data.tradeDate}</strong>
          <small>{t('dragon.source')}</small>
        </div>
      </header>

      {error && <div className={css.notice} role="alert">{t('dragon.refreshFailure')} <button type="button" onClick={onRetry}>{t('dragon.retry')}</button></div>}
      <nav className={css.tabs} aria-label={t('dragon.boardNav')}>
        {BOARD_TYPES.map(type => <button key={type} type="button" className={boardType === type ? css.activeTab : undefined}
          aria-current={boardType === type ? 'page' : undefined}
          onClick={() => { setBoardType(type); setSelection(null) }}>{boardLabel(type, t)}</button>)}
      </nav>

      <section className={css.metrics} aria-label={t('dragon.overview')}>
        <div className={css.metric}><span>{t('dragon.stockCount')}</span><strong>{board.stockCount}</strong><small>{t('dragon.stocksUnit')}</small></div>
        <div className={css.metric}><span>{t('dragon.recordCount')}</span><strong>{board.recordCount}</strong><small>{t('dragon.recordsUnit')}</small></div>
        <div className={css.metric}><span>{t('dragon.returnedNet')}</span><strong className={sumNet(board) >= 0 ? css.positive : css.negative}>{amount(sumNet(board), t)}</strong><small>{t('dragon.yuanUnit')}</small></div>
        <div className={css.metric}><span>{t('dragon.seatCount')}</span><strong>{board.seats.length}</strong><small>{t('dragon.seatsUnit')}</small></div>
      </section>

      <section className={css.comparison} aria-label={t('dragon.comparison')}>
        <div className={css.sectionHeading}><div><span className={css.eyebrow}>{t('dragon.capitalFlow')}</span><h2>{t('dragon.comparison')}</h2></div><small>{t('dragon.comparisonNote')}</small></div>
        <div className={css.comparisonRows}>
          {boards.map((item) => {
            const value = sumNet(item)
            return <div className={css.comparisonRow} key={item.type}>
              <span>{boardLabel(item.type, t)}</span>
              <div className={css.bipolar}>
                <div className={css.leftBar}>{value < 0 && <i className={css.negativeBar} style={barStyle(value, chartMax)} />}</div>
                <div className={css.zero} />
                <div className={css.rightBar}>{value >= 0 && <i className={css.positiveBar} style={barStyle(value, chartMax)} />}</div>
              </div>
              <strong className={value >= 0 ? css.positive : css.negative}>{amount(value, t)}</strong>
            </div>
          })}
        </div>
      </section>

      <div className={css.lowerGrid}>
        <section className={css.stockPanel} aria-label={t('dragon.stocks')}>
          <div className={css.sectionHeading}><div><span className={css.eyebrow}>{t('dragon.stockEyebrow')}</span><h2>{t('dragon.stocks')}</h2></div>
            <label className={css.sort}>{t('dragon.sort')}<select value={sortKey} onChange={(event) => { setSortKey(event.target.value as SortKey) }}>
              {SORT_KEYS.map(key => <option key={key} value={key}>{metricLabel(key, t)}</option>)}
            </select></label></div>
          <div className={css.stockHeader}><span>{t('dragon.stock')}</span><span>{metricLabel(sortKey, t)}</span></div>
          {stocks.length === 0 ? <p className={css.empty}>{t('dragon.emptyStocks')}</p> : <div className={css.stockList}>
            {stocks.map(({ stock, index }, rank) => {
              const value = stock[sortKey]
              return <button type="button" key={`${stock.thscode}-${index}`} className={css.stockRow}
                aria-pressed={selection === `stock:${index}`} onClick={() => { setSelection(`stock:${index}`) }}>
                <span className={css.stockIdentity}><b>{String(rank + 1).padStart(2, '0')}</b><span><strong>{stock.name}</strong><small>{stock.thscode}</small></span></span>
                <span className={css.stockAmount}>{value === undefined ? t('dragon.unavailable') : <><span className={css.miniBar}><i className={value >= 0 ? css.positiveBar : css.negativeBar} style={barStyle(value, maxStock)} /></span><strong className={value >= 0 ? css.positive : css.negative}>{amount(value, t)}</strong></>}</span>
              </button>
            })}
          </div>}
        </section>

        <aside className={css.sideColumn}>
          <section className={css.seatPanel} aria-label={t('dragon.seats')}>
            <div className={css.sectionHeading}><div><span className={css.eyebrow}>{t('dragon.seatEyebrow')}</span><h2>{t('dragon.seats')}</h2></div></div>
            {board.seats.length === 0 ? <p className={css.empty}>{t('dragon.emptySeats')}</p> : <div className={css.seatList}>{board.seats.map((seat, index) =>
              <button type="button" key={`${seat.name}-${index}`} aria-pressed={selection === `seat:${index}`} onClick={() => { setSelection(`seat:${index}`) }}>
                <span className={css.seatRank}>{String(index + 1).padStart(2, '0')}</span><strong>{seat.name}</strong><small>{seat.stocks.length} {t('dragon.stocksUnit')}</small>
              </button>)}</div>}
          </section>
          <section className={css.detailPanel} aria-label={t('dragon.details')}>
            <div className={css.sectionHeading}><div><span className={css.eyebrow}>{t('dragon.detailEyebrow')}</span><h2>{t('dragon.details')}</h2></div></div>
            {selectedStock ? <StockDetail stock={selectedStock} t={t} /> : selectedSeat ? <div className={css.selectedDetail}><h3>{selectedSeat.name}</h3><p>{t('dragon.linkedStocks')}</p><ul>{selectedSeat.stocks.map((stock, index) => <li key={`${stock.thscode}-${index}`}><span>{stock.name} <small>{stock.thscode}</small></span><strong>{stock.netValue === undefined ? t('dragon.unavailable') : amount(stock.netValue, t)}</strong></li>)}</ul></div> : <p className={css.empty}>{t('dragon.selectHint')}</p>}
          </section>
        </aside>
      </div>
      <footer className={css.footer}>
        <span>{t('dragon.source')} · {data.tradeDate}</span>
        <span>{board.truncated ? t('dragon.truncated') : t('dragon.scope')}</span>
        <span>{t('dragon.disclaimer')}</span>
      </footer>
    </div>
  </div>
}

function StockDetail({ stock, t }: { stock: DragonTigerStock; t: Translate }) {
  const values = [
    [t('dragon.net'), stock.netValue], [t('dragon.orgNet'), stock.orgNetValue],
    [t('dragon.hotNet'), stock.hotMoneyNetValue], [t('dragon.buy'), stock.buyValue], [t('dragon.sell'), stock.sellValue],
  ] as const
  return <div className={css.selectedDetail}><h3>{stock.name} <small>{stock.thscode}</small></h3>
    <dl>{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value === undefined ? undefined : value >= 0 ? css.positive : css.negative}>{value === undefined ? t('dragon.unavailable') : amount(value, t)}</dd></div>)}</dl>
    {stock.rangeDays !== undefined && <p>{t('dragon.rangeDays', { count: stock.rangeDays })}</p>}
  </div>
}
