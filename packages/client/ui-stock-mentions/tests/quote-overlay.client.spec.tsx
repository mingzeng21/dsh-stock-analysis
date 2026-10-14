// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { IStockClient } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { IWatchlist } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { describe, expect, it, vi } from 'vitest'
import { QuoteOverlay } from '../src/client/QuotePanel.tsx'
import { StockQuoteOverlay } from '../src/client/overlay.ts'
import { WatchlistQuickAdd } from '../src/client/watchlist.ts'

const stock: IStockClient = {
  dragonTiger: vi.fn(async () => { throw new Error('this spec never reads dragon-tiger boards') }),
  quotes: vi.fn(async () => ({ quotes: [{
    thscode: '600519.SH', last: 1252.57, change: -4.55, changePct: -0.36,
    open: 1259, high: 1259.95, low: 1250.8, prevClose: 1257.12, volume: 2_501_689, turnover: 3_135_910_000,
  }] })),
  candles: vi.fn(async () => ({ thscode: '600519.SH', interval: '1d' as const, truncated: false, candles: [
    { time: 1789516800000, open: 1250, high: 1260, low: 1240, close: 1252, volume: 10, turnover: 12_520 },
    { time: 1789603200000, open: 1252, high: 1265, low: 1250, close: 1258, volume: 12, turnover: 15_096 },
  ] })),
  searchSymbols: vi.fn(async () => [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }]),
  documents: vi.fn(async () => [{ kind: 'news' as const, title: '公司公告', publishedAt: 1789603200000,
    summary: '', summaryTruncated: false, url: 'https://example.com/news' }]),
}

const copy: Record<string, string> = {
  title: '证券行情', quote: '行情', latest: '最新价', high: '最高', low: '最低', open: '今开',
  previous: '昨收', volume: '成交量', turnover: '成交额', marketSH: '上交所', marketSZ: '深交所',
  close: '关闭行情', refresh: '刷新', retry: '重试', daily: '近期日 K 走势', news: '相关新闻',
  loading: '行情加载中', failed: '行情暂时无法加载', empty: '暂无数据', asOf: '数据时间',
}

const entries = createSnapshotStore<readonly []>([])
const watchlist: IWatchlist = {
  entries,
  refresh: async () => [],
  add: async () => [],
  remove: async () => [],
  reorder: async () => [],
}
const add = new WatchlistQuickAdd(watchlist, () => {})
const toast = createSnapshotStore(null)

describe('global stock quote panel', () => {
  it('shows the same quote and tabs, and Escape closes the panel', async () => {
    const overlay = new StockQuoteOverlay()
    const view = render(<QuoteOverlay overlay={overlay} stock={stock} nameOf={() => '贵州茅台'}
      watchlist={watchlist} add={add} toast={toast} dismissToast={() => {}}
      t={(key: string) => copy[key] ?? key} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    overlay.open({ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' })
    await waitFor(() => { expect(screen.getByRole('dialog', { name: '贵州茅台 证券行情' })).toBeTruthy() })
    await waitFor(() => { expect(screen.getByText('1252.57')).toBeTruthy() })
    expect(screen.getByRole('img', { name: '近期日 K 走势' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '相关新闻' }))
    expect(screen.getByRole('link', { name: '公司公告' })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    view.unmount()
  })
})
