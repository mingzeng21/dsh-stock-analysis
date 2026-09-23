// @vitest-environment jsdom
/**
 * The watchlist panel as a user sees it: the rows and their quotes, selection,
 * the add flow, and the failure surfaces. Props are fed directly — the data
 * layer owns what a read means, and this suite owns what it renders.
 */
import type { DocumentKind, DocumentRow, InstrumentMatch, Quote } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { WatchlistEntry } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AnalysisOutcome, AnalysisState } from '../src/client/analysis.ts'
import type {
  AddOutcome, CandlesSnapshot, DocumentsSnapshot, ListSnapshot, QuotesSnapshot, SearchOutcome,
} from '../src/client/controller.ts'
import { zh } from '../src/client/locales.ts'
import { createWatchlistStore } from '../src/client/store.ts'
import { WatchlistPanelIcon } from '../src/client/PanelIcon.tsx'
import { WatchlistPanel, type WatchlistPanelProps } from '../src/client/WatchlistPanel.tsx'
import { installCanvas } from './support/canvas.ts'

const MAOTAI: WatchlistEntry = { thscode: '600519.SH', name: '贵州茅台', addedAt: 1 }

/** The analysis session the scripted callbacks answer with. */
const ANALYSIS = 'session-1' as SessionId
const ANALYSIS_RECORDED = 'session-7' as SessionId
const PINGAN: WatchlistEntry = { thscode: '000001.SZ', name: '平安银行', addedAt: 2 }

/** One quote, overridable per test. */
function quote(last: number, changePct: number): Quote {
  return {
    thscode: '600519.SH',
    last,
    change: 0,
    changePct,
    open: 1259,
    high: 1259.95,
    low: 1250.8,
    prevClose: 1257.12,
    volume: 1,
    turnover: 1,
  }
}

/** The props the panel reads, with every callback scripted. */
interface Fixture {
  readonly entries?: readonly WatchlistEntry[]
  readonly quotes?: QuotesSnapshot
  readonly listState?: ListSnapshot
  readonly search?: SearchOutcome
  readonly add?: AddOutcome
  readonly remove?: AddOutcome
  readonly candles?: CandlesSnapshot
  readonly documents?: DocumentsSnapshot
  readonly themeRevision?: number
  readonly selection?: string | null
  readonly interval?: '1d' | '1w' | '1mo'
  readonly documentKind?: DocumentKind
  readonly analysis?: AnalysisState
  readonly analysisSession?: string
  readonly transcriptMissing?: boolean
  readonly startAnalysisImpl?: () => Promise<AnalysisOutcome>
  readonly sendAnalysisImpl?: () => Promise<AnalysisOutcome>
  /** Replace the scripted callbacks entirely, for pinning in-flight behavior. */
  readonly searchImpl?: () => Promise<SearchOutcome>
  readonly addImpl?: () => Promise<AddOutcome>
}

const READY_QUOTES: QuotesSnapshot = { phase: 'ready', byCode: { '600519.SH': quote(1252.57, -0.36) } }
const READY_CANDLES: CandlesSnapshot = { phase: 'ready', interval: '1d', bars: [], truncated: false }
const READY_DOCUMENTS: DocumentsSnapshot = { phase: 'ready', kind: 'report', rows: [] }

/** One document row, overridable per test. */
function documentRow(title: string, overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    kind: 'report',
    title,
    source: '诚通证券',
    publishedAt: 1_789_660_800_000,
    summary: '估值与投资建议',
    summaryTruncated: false,
    ...overrides,
  }
}

beforeEach(() => { installCanvas() })
afterEach(cleanup)

/** Mount the panel over real stores and scripted callbacks. */
function mount(fixture: Fixture = {}) {
  const view = createWatchlistStore().create()
  const entryStore = createSnapshotStore<readonly WatchlistEntry[]>(fixture.entries ?? [MAOTAI, PINGAN])
  const quoteStore = createSnapshotStore<QuotesSnapshot>(fixture.quotes ?? READY_QUOTES)
  const listStore = createSnapshotStore<ListSnapshot>(fixture.listState ?? { phase: 'ready' })
  const candleStore = createSnapshotStore<CandlesSnapshot>(fixture.candles ?? READY_CANDLES)
  const documentStore = createSnapshotStore<DocumentsSnapshot>(fixture.documents ?? READY_DOCUMENTS)
  const analysisStore = createSnapshotStore<AnalysisState>(fixture.analysis ?? { phase: 'idle' })
  const themeStore = createSnapshotStore<number>(fixture.themeRevision ?? 0)
  const load = vi.fn()
  const loadCandles = vi.fn()
  const loadDocuments = vi.fn()
  const refreshQuotes = vi.fn()
  const startAnalysis = vi.fn(fixture.startAnalysisImpl
    ?? (async (): Promise<AnalysisOutcome> => ({ ok: true, sessionId: ANALYSIS })))
  const resumeAnalysis = vi.fn(() => fixture.transcriptMissing !== true)
  const sendAnalysis = vi.fn(fixture.sendAnalysisImpl
    ?? (async (): Promise<AnalysisOutcome> => ({ ok: true, sessionId: ANALYSIS })))
  const openAnalysisInConversation = vi.fn()
  const renderSlot = vi.fn((key: string) => <span data-testid={`slot:${key}`} />)
  const addInstrument = vi.fn(fixture.addImpl ?? (async (): Promise<AddOutcome> => fixture.add ?? { ok: true }))
  const removeInstrument = vi.fn(async (): Promise<AddOutcome> => fixture.remove ?? { ok: true })
  const searchInstruments = vi.fn(fixture.searchImpl ?? (async (): Promise<SearchOutcome> =>
    fixture.search ?? { ok: true, matches: [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' } satisfies InstrumentMatch] }))

  const props = {
    useStore: bindSnapshotSelector(view),
    actions: view.actions,
    t: makeTranslate(zh),
    useEntries: bindSnapshotSelector(entryStore),
    useQuotes: bindSnapshotSelector(quoteStore),
    useListState: bindSnapshotSelector(listStore),
    useCandles: bindSnapshotSelector(candleStore),
    useDocuments: bindSnapshotSelector(documentStore),
    useAnalysis: bindSnapshotSelector(analysisStore),
    useThemeRevision: bindSnapshotSelector(themeStore),
    load,
    refreshQuotes,
    addInstrument,
    removeInstrument,
    searchInstruments,
    loadCandles,
    loadDocuments,
    startAnalysis,
    resumeAnalysis,
    sendAnalysis,
    openAnalysisInConversation,
    renderSlot,
  } as unknown as WatchlistPanelProps

  if (fixture.selection != null) view.actions.select(fixture.selection)
  if (fixture.interval !== undefined) view.actions.setInterval(fixture.interval)
  if (fixture.documentKind !== undefined) view.actions.setDocumentKind(fixture.documentKind)
  if (fixture.analysisSession !== undefined) {
    view.actions.setAnalysisSession(fixture.analysisSession as SessionId)
  }
  render(<WatchlistPanel {...props} />)
  return {
    view, entryStore, quoteStore, candleStore, documentStore, load, refreshQuotes, loadCandles, loadDocuments,
    addInstrument, removeInstrument, searchInstruments,
    startAnalysis, resumeAnalysis, sendAnalysis, openAnalysisInConversation, renderSlot,
  }
}

/**
 * The row button for one instrument. Each row renders two buttons whose
 * accessible names both mention the instrument — the row itself and its remove
 * control — and the row comes first in DOM order.
 */
function rowButton(name: RegExp): HTMLElement {
  const [first] = screen.getAllByRole('button', { name })
  if (first === undefined) throw new Error(`no button matching ${String(name)}`)
  return first
}

/** The instrument rows, in render order. */
function rowTexts(): string[] {
  const list = screen.getByRole('list')
  return within(list).getAllByRole('listitem').map(item => item.textContent ?? '')
}

describe('WatchlistPanel list', () => {
  it('reads on mount, because mounting is what returning to the panel does', () => {
    const { load } = mount()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('renders every instrument with its quote, and a placeholder for one without', () => {
    mount()
    const rows = rowTexts()
    expect(rows[0]).toContain('贵州茅台')
    expect(rows[0]).toContain('600519.SH')
    expect(rows[0]).toContain('1252.57')
    expect(rows[0]).toContain('-0.36%')
    expect(rows[1]).toContain('平安银行')
    expect(rows[1]).toContain('—')
  })

  it('signs a rise and leaves a fall as the number reads it', () => {
    mount({
      quotes: {
        phase: 'ready',
        byCode: { '600519.SH': quote(1252.57, 1.82), '000001.SZ': quote(11.73, -0.36) },
      },
    })
    const rows = rowTexts()
    expect(rows[0]).toContain('+1.82%')
    expect(rows[1]).toContain('-0.36%')
  })

  it('claims an empty list only after a read settled it', () => {
    mount({ entries: [], listState: { phase: 'loading' } })
    expect(screen.queryByText(zh['list.empty'])).toBeNull()
    cleanup()
    mount({ entries: [] })
    expect(screen.getByText(zh['list.empty'])).toBeDefined()
    expect(screen.getByText(zh['list.emptyHint'])).toBeDefined()
  })

  it('renders a failed list read as its code rather than an empty list', () => {
    mount({ entries: [], listState: { phase: 'failed', failure: 'gateway/internal' } })
    expect(screen.getByText('操作失败：gateway/internal')).toBeDefined()
    expect(screen.queryByText(zh['list.empty'])).toBeNull()
  })

  it('renders a failed quote batch with a retry that reads again', () => {
    const { refreshQuotes } = mount({ quotes: { phase: 'failed', failure: 'stock/rate-limited', byCode: {} } })
    expect(screen.getByText(/stock\/rate-limited/)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh['quotes.retry'] }))
    expect(refreshQuotes).toHaveBeenCalledTimes(1)
  })

  it('stamps the batch with the vendor\u2019s readiness time when it reports one', () => {
    mount({
      quotes: { phase: 'ready', asOf: 1789560797000, byCode: { '600519.SH': quote(1252.57, -0.36) } },
    })
    act(() => { fireEvent.click(rowButton(/贵州茅台/)) })
    expect(screen.getByText(/^行情时间 \d{2}:\d{2}$/)).toBeDefined()
  })

  it('says the batch is loading while a read is in flight', () => {
    mount({ quotes: { phase: 'loading', byCode: {} } })
    expect(screen.getByText(zh['quotes.loading'])).toBeDefined()
  })

  it('shows no readiness stamp when the vendor reports none', () => {
    mount({ quotes: { phase: 'ready', byCode: { '600519.SH': quote(1252.57, -0.36) } } })
    act(() => { fireEvent.click(rowButton(/贵州茅台/)) })
    expect(screen.queryByText(/行情时间/)).toBeNull()
  })

  it('refreshes the batch from the rail control', () => {
    const { refreshQuotes } = mount()
    fireEvent.click(screen.getByRole('button', { name: zh['list.refresh'] }))
    expect(refreshQuotes).toHaveBeenCalledTimes(1)
  })
})

describe('WatchlistPanel selection', () => {
  it('selects a row and shows that instrument wherever the store points', () => {
    const { view } = mount()
    expect(screen.getByText(zh['detail.empty'])).toBeDefined()
    act(() => { fireEvent.click(rowButton(/贵州茅台/)) })
    expect(view.getSnapshot().selected).toBe('600519.SH')
    expect(screen.getByText(zh['detail.open'])).toBeDefined()
    expect(screen.getByText('1259.00')).toBeDefined()
    expect(screen.getByText('昨收')).toBeDefined()
    expect(screen.getByText('1257.12')).toBeDefined()
  })

  it('removes an instrument by its thscode and clears the selection it was showing', async () => {
    const { view, removeInstrument } = mount()
    act(() => { fireEvent.click(rowButton(/贵州茅台/)) })
    fireEvent.click(screen.getByRole('button', { name: '移除 贵州茅台' }))
    expect(removeInstrument).toHaveBeenCalledWith('600519.SH')
    await waitFor(() => { expect(view.getSnapshot().selected).toBeNull() })
  })

  it('keeps the selection when a different instrument is removed', async () => {
    const { view } = mount()
    act(() => { fireEvent.click(rowButton(/贵州茅台/)) })
    fireEvent.click(screen.getByRole('button', { name: '移除 平安银行' }))
    await waitFor(() => { expect(view.getSnapshot().selected).toBe('600519.SH') })
  })

  it('renders a refused removal as its code', async () => {
    const { removeInstrument } = mount({ remove: { ok: false, code: 'watchlist/not-found' } })
    fireEvent.click(screen.getByRole('button', { name: '移除 贵州茅台' }))
    expect(removeInstrument).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('操作失败：watchlist/not-found')).toBeDefined()
  })
})

describe('WatchlistPanel add flow', () => {
  it('searches on demand and adds the instrument the user picks', async () => {
    const { searchInstruments, addInstrument } = mount()
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    fireEvent.change(screen.getByLabelText(zh['add.placeholder']), { target: { value: '茅台' } })
    fireEvent.click(screen.getByRole('button', { name: zh['add.search'] }))
    expect(searchInstruments).toHaveBeenCalledWith('茅台')
    const candidates = await screen.findByRole('list', { name: zh['add.candidates'] })
    fireEvent.click(within(candidates).getByRole('button', { name: /贵州茅台/ }))
    expect(addInstrument).toHaveBeenCalledWith('600519.SH')
  })

  it('searches on Enter and closes on Escape', () => {
    const { searchInstruments } = mount()
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    const input = screen.getByLabelText(zh['add.placeholder'])
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(searchInstruments).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '茅台' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(searchInstruments).toHaveBeenCalledWith('茅台')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByLabelText(zh['add.placeholder'])).toBeNull()
  })

  it('ignores a second search while the first is still in flight', async () => {
    const pending = new Promise<SearchOutcome>(() => {})
    const { searchInstruments } = mount({ searchImpl: async () => pending })
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    fireEvent.change(screen.getByLabelText(zh['add.placeholder']), { target: { value: '茅台' } })
    const input = screen.getByLabelText(zh['add.placeholder'])
    fireEvent.click(screen.getByRole('button', { name: zh['add.search'] }))
    await waitFor(() => { expect(searchInstruments).toHaveBeenCalledTimes(1) })
    // The button is disabled while a read is in flight, but Enter still arrives.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(searchInstruments).toHaveBeenCalledTimes(1)
  })

  it('ignores a second pick while the first add is still in flight', async () => {
    const pending = new Promise<AddOutcome>(() => {})
    const { addInstrument } = mount({ addImpl: async () => pending })
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    fireEvent.change(screen.getByLabelText(zh['add.placeholder']), { target: { value: '茅台' } })
    fireEvent.click(screen.getByRole('button', { name: zh['add.search'] }))
    const candidates = await screen.findByRole('list', { name: zh['add.candidates'] })
    const candidate = within(candidates).getByRole('button', { name: /贵州茅台/ })
    fireEvent.click(candidate)
    await waitFor(() => { expect(addInstrument).toHaveBeenCalledTimes(1) })
    fireEvent.click(candidate)
    expect(addInstrument).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing matches', async () => {
    mount({ search: { ok: true, matches: [] } })
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    fireEvent.change(screen.getByLabelText(zh['add.placeholder']), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: zh['add.search'] }))
    expect(await screen.findByText(zh['add.empty'])).toBeDefined()
  })

  it('renders a failed search as its code', async () => {
    mount({ search: { ok: false, code: 'stock/rate-limited' } })
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    fireEvent.change(screen.getByLabelText(zh['add.placeholder']), { target: { value: '茅台' } })
    fireEvent.click(screen.getByRole('button', { name: zh['add.search'] }))
    expect(await screen.findByText('操作失败：stock/rate-limited')).toBeDefined()
  })

  it('renders a refused add as its code', async () => {
    mount({ add: { ok: false, code: 'watchlist/duplicate' } })
    fireEvent.click(screen.getByRole('button', { name: zh['list.add'] }))
    fireEvent.change(screen.getByLabelText(zh['add.placeholder']), { target: { value: '茅台' } })
    fireEvent.click(screen.getByRole('button', { name: zh['add.search'] }))
    const candidates = await screen.findByRole('list', { name: zh['add.candidates'] })
    fireEvent.click(within(candidates).getByRole('button', { name: /贵州茅台/ }))
    expect(await screen.findByText('操作失败：watchlist/duplicate')).toBeDefined()
  })
})

describe('WatchlistPanelIcon', () => {
  it('draws at the requested size, hidden from assistive technology', () => {
    const { container } = render(<WatchlistPanelIcon size={18} active />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('18')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})

describe('WatchlistPanel chart', () => {
  it('reads the series for the selected instrument and the current period', () => {
    const { loadCandles } = mount({ selection: '600519.SH', interval: '1w' })
    expect(loadCandles).toHaveBeenCalledTimes(1)
    expect(loadCandles.mock.calls[0]?.slice(0, 2)).toEqual(['600519.SH', '1w'])
  })

  it('reads nothing before an instrument is selected', () => {
    const { loadCandles } = mount()
    expect(loadCandles).not.toHaveBeenCalled()
  })

  it('offers one period control per period, marking the selected one', () => {
    mount({ selection: '600519.SH', interval: '1w' })
    const group = screen.getByRole('group', { name: zh['chart.aria'] })
    expect(within(group).getByRole('button', { name: zh['chart.period.1w'] })).toBeDefined()
    expect(within(group).getAllByRole('button')).toHaveLength(3)
  })

  it('stores a new period and reads the series again', () => {
    const { view, loadCandles } = mount({ selection: '600519.SH' })
    loadCandles.mockClear()
    fireEvent.click(screen.getByRole('button', { name: zh['chart.period.1mo'] }))
    expect(view.getSnapshot().interval).toBe('1mo')
  })

  it('says the series is loading while the first read is in flight', () => {
    mount({
      selection: '600519.SH',
      candles: { phase: 'loading', interval: '1d', bars: [], truncated: false },
    })
    expect(screen.getByText(zh['chart.loading'])).toBeDefined()
  })

  it('says the window holds no bars once a read settles empty', () => {
    mount({ selection: '600519.SH' })
    expect(screen.getByText(zh['chart.empty'])).toBeDefined()
  })

  it('renders the canvas once a series arrives', () => {
    mount({
      selection: '600519.SH',
      candles: {
        phase: 'ready',
        interval: '1d',
        truncated: false,
        bars: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      },
    })
    expect(document.querySelector('canvas')).not.toBeNull()
    expect(screen.queryByText(zh['chart.empty'])).toBeNull()
  })

  it('renders a failed series as its code and re-reads on retry', () => {
    const { loadCandles } = mount({
      selection: '600519.SH',
      candles: { phase: 'failed', interval: '1d', bars: [], truncated: false, failure: 'stock/no-data' },
    })
    loadCandles.mockClear()
    expect(screen.getByText('操作失败：stock/no-data')).toBeDefined()
    const group = screen.getByRole('group', { name: zh['chart.aria'] })
    fireEvent.click(within(group.parentElement as HTMLElement).getByRole('button', { name: zh['quotes.retry'] }))
    expect(loadCandles).toHaveBeenCalledTimes(1)
    expect(loadCandles.mock.calls[0]?.slice(0, 2)).toEqual(['600519.SH', '1d'])
  })

  it('warns when the seam capped the series', () => {
    mount({
      selection: '600519.SH',
      candles: {
        phase: 'ready',
        interval: '1d',
        truncated: true,
        bars: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
      },
    })
    expect(screen.getByText(zh['chart.truncated'])).toBeDefined()
  })
})

describe('WatchlistPanel documents', () => {
  it('reads the opened channel for the selected instrument', () => {
    const { loadDocuments } = mount({ selection: '600519.SH', documentKind: 'news' })
    expect(loadDocuments).toHaveBeenCalledTimes(1)
    expect(loadDocuments.mock.calls[0]).toEqual(['贵州茅台', 'news'])
  })

  it('reads nothing before an instrument is selected', () => {
    const { loadDocuments } = mount()
    expect(loadDocuments).not.toHaveBeenCalled()
  })

  it('offers one tab per channel, in reading order', () => {
    mount({ selection: '600519.SH' })
    const group = screen.getByRole('group', { name: zh['documents.aria'] })
    expect(within(group).getAllByRole('button').map(button => button.textContent))
      .toEqual([zh['documents.report'], zh['documents.announcement'], zh['documents.news']])
  })

  it('stores a new channel and reads it for the same instrument', () => {
    const { view, loadDocuments } = mount({ selection: '600519.SH' })
    loadDocuments.mockClear()
    fireEvent.click(screen.getByRole('button', { name: zh['documents.announcement'] }))
    expect(view.getSnapshot().documentKind).toBe('announcement')
    expect(loadDocuments.mock.calls[0]).toEqual(['贵州茅台', 'announcement'])
  })

  it('says the channel is loading while its first read is in flight', () => {
    mount({ selection: '600519.SH', documents: { phase: 'loading', kind: 'report' } })
    expect(screen.getByText(zh['documents.loading'])).toBeDefined()
  })

  it('says nothing is published once a read settles empty', () => {
    mount({ selection: '600519.SH', documents: { phase: 'ready', kind: 'report', rows: [] } })
    expect(screen.getByText(zh['documents.empty'])).toBeDefined()
  })

  it('renders each row with its source, date, and excerpt', () => {
    mount({
      selection: '600519.SH',
      documents: { phase: 'ready', kind: 'report', rows: [documentRow('公司跟踪报告')] },
    })
    expect(screen.getByText('公司跟踪报告')).toBeDefined()
    expect(screen.getByText(/^诚通证券 · \d{4}-\d{2}-\d{2}$/u)).toBeDefined()
    expect(screen.getByText('估值与投资建议')).toBeDefined()
  })

  it('links a row the vendor gave a URL and leaves the others as text', () => {
    mount({
      selection: '600519.SH',
      documents: {
        phase: 'ready',
        kind: 'report',
        rows: [
          documentRow('有链接', { url: 'https://example.test/report' }),
          { kind: 'report', title: '无链接', publishedAt: 1_789_660_800_000, summary: '摘要', summaryTruncated: false },
        ],
      },
    })
    const link = screen.getByRole('link', { name: '有链接' })
    expect(link.getAttribute('href')).toBe('https://example.test/report')
    expect(link.getAttribute('rel')).toBe('noreferrer')
    expect(screen.queryByRole('link', { name: '无链接' })).toBeNull()
    expect(screen.getByText(/^\d{4}-\d{2}-\d{2}$/u)).toBeDefined()
  })

  it('marks an excerpt the Host cut', () => {
    mount({
      selection: '600519.SH',
      documents: { phase: 'ready', kind: 'report', rows: [documentRow('长摘要', { summaryTruncated: true })] },
    })
    expect(screen.getByText(zh['documents.truncated'])).toBeDefined()
  })

  it('renders a failed channel as its code and re-reads on retry', () => {
    const { loadDocuments } = mount({
      selection: '600519.SH',
      documents: { phase: 'failed', kind: 'report', failure: 'stock/rate-limited' },
    })
    loadDocuments.mockClear()
    expect(screen.getByText('操作失败：stock/rate-limited')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh['quotes.retry'] }))
    expect(loadDocuments.mock.calls[0]).toEqual(['贵州茅台', 'report'])
  })
})

describe('WatchlistPanel analysis without a quote', () => {
  it('keeps the chart and the documents while the quote batch is still out', () => {
    mount({ selection: '000001.SZ', quotes: { phase: 'idle', byCode: {} } })
    expect(screen.getByText(zh['quotes.loading'])).toBeDefined()
    expect(screen.getByRole('group', { name: zh['chart.aria'] })).toBeDefined()
    expect(screen.getByRole('group', { name: zh['documents.aria'] })).toBeDefined()
  })

  it('names a failed quote batch in the analysis side and retries it there', () => {
    const { refreshQuotes } = mount({
      selection: '000001.SZ',
      quotes: { phase: 'failed', failure: 'stock/rate-limited', byCode: {} },
    })
    const article = document.querySelector('article') as HTMLElement
    expect(within(article).getByText('操作失败：stock/rate-limited')).toBeDefined()
    fireEvent.click(within(article).getByRole('button', { name: zh['quotes.retry'] }))
    expect(refreshQuotes).toHaveBeenCalledTimes(1)
  })
})

describe('WatchlistPanel analysis', () => {
  it('offers to start a session before one exists, and records the identity it returns', async () => {
    const { view, startAnalysis } = mount({ selection: '600519.SH' })
    expect(screen.getByText(zh['analysis.intro'])).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: zh['analysis.start'] }))
    expect(startAnalysis).toHaveBeenCalledTimes(1)
    await waitFor(() => { expect(view.getSnapshot().analysisSession).toBe(ANALYSIS) })
  })

  it('renders the transcript slot and makes the recorded session current again', () => {
    const { resumeAnalysis } = mount({ selection: '600519.SH', analysisSession: ANALYSIS_RECORDED })
    expect(resumeAnalysis).toHaveBeenCalledWith(ANALYSIS_RECORDED)
    expect(screen.getByTestId('slot:watchlist.analysis')).toBeDefined()
    expect(screen.queryByRole('button', { name: zh['analysis.start'] })).toBeNull()
  })

  it('forgets a recorded session the Host no longer lists', async () => {
    const { view } = mount({ selection: '600519.SH', analysisSession: ANALYSIS_RECORDED, transcriptMissing: true })
    await waitFor(() => { expect(view.getSnapshot().analysisSession).toBeNull() })
    expect(screen.queryByTestId('slot:watchlist.analysis')).toBeNull()
    expect(screen.getByRole('button', { name: zh['analysis.start'] })).toBeDefined()
  })

  it('sends a question carrying the selected instrument and clears the draft', async () => {
    const { sendAnalysis } = mount({ selection: '600519.SH', analysisSession: ANALYSIS_RECORDED })
    const field = screen.getByRole('textbox', { name: zh['analysis.ask'] })
    fireEvent.change(field, { target: { value: '为什么跌' } })
    fireEvent.submit(field.closest('form') as HTMLElement)
    await waitFor(() => { expect(sendAnalysis).toHaveBeenCalledTimes(1) })
    expect(sendAnalysis.mock.calls[0]).toEqual([
      ANALYSIS_RECORDED,
      `${zh['analysis.context'].replace('{name}', '贵州茅台').replace('{thscode}', '600519.SH')}\n\n为什么跌`,
    ])
    await waitFor(() => { expect((field as HTMLInputElement).value).toBe('') })
  })

  it('sends nothing for a blank question', () => {
    const { sendAnalysis } = mount({ selection: '600519.SH', analysisSession: ANALYSIS_RECORDED })
    const field = screen.getByRole('textbox', { name: zh['analysis.ask'] })
    fireEvent.submit(field.closest('form') as HTMLElement)
    expect(sendAnalysis).not.toHaveBeenCalled()
  })

  it('renders a failed analysis phase as its code', () => {
    mount({
      selection: '600519.SH',
      analysis: { phase: 'failed', failure: 'gateway/internal' },
    })
    expect(screen.getByText('操作失败：gateway/internal')).toBeDefined()
  })

  it('continues the analysis in the full conversation', () => {
    const { openAnalysisInConversation } = mount({ selection: '600519.SH', analysisSession: ANALYSIS_RECORDED })
    fireEvent.click(screen.getByRole('button', { name: zh['analysis.openInConversation'] }))
    expect(openAnalysisInConversation).toHaveBeenCalledWith(ANALYSIS_RECORDED)
  })
})

describe('WatchlistPanel analysis failures and progress', () => {
  it('keeps the panel session-free when starting one fails', async () => {
    const { view, startAnalysis } = mount({
      selection: '600519.SH',
      startAnalysisImpl: async () => ({ ok: false, code: 'gateway/internal' }),
    })
    fireEvent.click(screen.getByRole('button', { name: zh['analysis.start'] }))
    await waitFor(() => { expect(startAnalysis).toHaveBeenCalledTimes(1) })
    expect(view.getSnapshot().analysisSession).toBeNull()
  })

  it('says the session is being created while it is', () => {
    mount({ selection: '600519.SH', analysis: { phase: 'starting' } })
    expect(screen.getByRole('button', { name: zh['analysis.starting'] })).toBeDefined()
    expect(screen.getByRole('button', { name: zh['analysis.starting'] }).hasAttribute('disabled')).toBe(true)
  })

  it('keeps the question when sending it fails', async () => {
    const { sendAnalysis } = mount({
      selection: '600519.SH',
      analysisSession: ANALYSIS_RECORDED,
      sendAnalysisImpl: async () => ({ ok: false, code: 'session/busy' }),
    })
    const field = screen.getByRole('textbox', { name: zh['analysis.ask'] }) as HTMLInputElement
    fireEvent.change(field, { target: { value: '为什么跌' } })
    fireEvent.submit(field.closest('form') as HTMLElement)
    await waitFor(() => { expect(sendAnalysis).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(field.value).toBe('为什么跌') })
  })
})
