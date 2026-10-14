// @vitest-environment jsdom
/** The Agents panel keeps specialist output and history inside its own main entry. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { DragonTigerDashboard, HotRankDashboard } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { SessionListState, SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentsPanel, type AgentsPanelProps } from '../src/client/AgentsPanel.tsx'
import { zh } from '../src/client/locales.ts'

const SESSION = 'agent-run' as SessionId
const SCREENING: StockAgentCard = {
  name: 'stock-screening',
  title: { zh: '智能选股', en: 'A-share screening' },
  summary: { zh: '筛选股票', en: 'Screen stocks' },
  launch: 'query',
  examples: { zh: ['半导体公司'], en: ['Semiconductor companies'] },
}
const COMPANY: StockAgentCard = {
  name: 'stock-company-analysis',
  title: { zh: '分析个股', en: 'Company analysis' },
  summary: { zh: '分析一只 A 股', en: 'Analyze an A-share company' },
  launch: 'query',
  queryInput: { label: { zh: '输入股票名称或代码', en: 'Enter a stock name or code' }, kind: 'text' },
}
const SECTOR: StockAgentCard = {
  name: 'stock-sector-analysis',
  title: { zh: '分析板块', en: 'Sector analysis' },
  summary: { zh: '分析一个 A 股板块', en: 'Analyze an A-share sector' },
  launch: 'query',
  queryInput: { label: { zh: '输入板块名称', en: 'Enter a sector name' }, kind: 'text' },
}

const DASHBOARD: DragonTigerDashboard = {
  tradeDate: '2026-10-12',
  boards: [
    { type: 'all', stockCount: 2, recordCount: 2, truncated: false, seats: [{ name: '活跃席位', stocks: [{ thscode: '600001.SH', name: '甲公司', netValue: 30_000_000 }], truncated: false }], stocks: [
      { thscode: '600001.SH', name: '甲公司', changePct: 5.57, amount: 924_555_074.08, netValue: 120_000_000, orgNetValue: 70_000_000 },
      { thscode: '000002.SZ', name: '乙公司', changePct: -3.74, amount: 100_000_000, netValue: -60_000_000, hotMoneyNetValue: -40_000_000 },
    ] },
    { type: 'org', stockCount: 1, recordCount: 1, truncated: false, seats: [], stocks: [{ thscode: '600001.SH', name: '甲公司', netValue: 70_000_000 }] },
    { type: 'hot_money', stockCount: 1, recordCount: 1, truncated: false, seats: [], stocks: [{ thscode: '000002.SZ', name: '乙公司', netValue: -40_000_000 }] },
  ],
}

const HOT_RANK: HotRankDashboard = { boards: [
  { kind: 'hot', period: 'day', asOf: 1_781_000_000_000, stocks: [
    { thscode: '600001.SH', ticker: '600001', name: '甲公司', rank: 1, heat: '1941909', rankChange: 7, rankTrend: 'up' },
  ] },
  { kind: 'hot', period: 'hour', stocks: [] },
  { kind: 'surge', period: 'day', stocks: [] },
  { kind: 'surge', period: 'hour', stocks: [] },
] }

afterEach(cleanup)

function mount(history: boolean | 'dragon' | 'hot' = false, cards: readonly StockAgentCard[] = [SCREENING]) {
  const catalog = createSnapshotStore<readonly StockAgentCard[]>(cards)
  const sessions = createSnapshotStore<SessionListState>({
    ids: history ? [SESSION] : [],
    byId: history ? {
      [SESSION]: {
        id: SESSION, displayTitle: '筛选结果', running: false, retainedBy: {}, blank: false,
        updatedAt: 1_780_000_000_000,
        projectionValues: { stockAgent: history === 'dragon' || history === 'hot'
          ? { name: `dashboard-${history}`, query: '榜单如何？' }
          : { name: SCREENING.name, query: '半导体公司' } },
      },
    } : {},
    phase: 'ready',
    projectionsBySession: {},
  })
  const locale = createSnapshotStore<LocaleSnapshot>({ active: 'zh', locales: [], revision: 0 })
  const conversation = createSnapshotStore<ConversationSnapshot>({
    views: { get: () => undefined, grouped: () => undefined }, activeTargets: new Set(),
  })
  const error = createSnapshotStore<string | null>(null)
  const binding = { sessionId: SESSION } as SessionReference['binding']
  const release = vi.fn()
  const reference: SessionReference = {
    sessionId: SESSION,
    binding,
    ready: Promise.resolve(binding),
    release,
    [Symbol.dispose]: release,
  }
  const start = vi.fn(async () => reference)
  const startDashboard = vi.fn(async (_prompt: string) => reference)
  const continueDashboard = vi.fn(async (_sessionId: SessionId, _prompt: string) => {})
  const loadDragonTiger = vi.fn(async () => DASHBOARD)
  const loadHotRank = vi.fn(async () => HOT_RANK)
  const loadHotRankHistory = vi.fn(async () => ({ thscode: '600001.SH', points: [
    { date: '2026-10-12', rank: 12 }, { date: '2026-10-13', rank: 1 },
  ] }))
  const openSession = vi.fn(() => reference)
  const renderSlot = vi.fn((..._args: unknown[]) => <div data-testid="conversation">流式回答与追问</div>)
  const unused = () => { throw new Error('unneeded global slot prop') }
  const props = {
    SessionProvider: ({ children }: { children: ReactNode }) => children,
    t: makeTranslate(zh),
    useCatalog: bindSnapshotSelector(catalog),
    useSessions: bindSnapshotSelector(sessions),
    useLocale: bindSnapshotSelector(locale),
    useConversation: bindSnapshotSelector(conversation),
    useCatalogError: bindSnapshotSelector(error),
    loadCatalog: vi.fn(),
    start,
    startDashboard,
    continueDashboard,
    loadDragonTiger,
    loadHotRank,
    loadHotRankHistory,
    openSession,
    renderSlot,
    usePanelInfo: unused,
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    useWorkspaces: unused,
    useResource: unused,
  } as AgentsPanelProps
  render(<AgentsPanel {...props} />)
  return { start, startDashboard, continueDashboard, release, openSession, renderSlot, loadDragonTiger, loadHotRank, loadHotRankHistory }
}

it('starts a dashboard Session on first question and carries the selected snapshot into follow-ups', async () => {
  const { startDashboard, continueDashboard, release } = mount()
  fireEvent.click(screen.getByRole('button', { name: /龙虎榜观察/ }))
  await waitFor(() => { expect(screen.getByText('2026-10-12')).toBeTruthy() })
  expect(startDashboard).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '问看板' }))
  fireEvent.click(screen.getByRole('button', { name: /甲公司/ }))
  fireEvent.change(screen.getByLabelText('你的问题'), { target: { value: '它的资金流向如何？' } })
  fireEvent.click(screen.getByRole('button', { name: '发送问题' }))
  await waitFor(() => { expect(startDashboard).toHaveBeenCalledTimes(1) })
  const first = startDashboard.mock.calls[0]?.[0]
  expect(first).toContain('它的资金流向如何？')
  expect(first).toContain('600001.SH')
  expect(first).toContain('2026-10-12')
  await waitFor(() => { expect(screen.getByTestId('conversation')).toBeTruthy() })
  fireEvent.change(screen.getByLabelText('你的问题'), { target: { value: '与另一只相比呢？' } })
  fireEvent.click(screen.getByRole('button', { name: '发送问题' }))
  await waitFor(() => { expect(continueDashboard).toHaveBeenCalledTimes(1) })
  expect(continueDashboard.mock.calls[0]?.[0]).toBe(SESSION)
  expect(continueDashboard.mock.calls[0]?.[1]).toContain('与另一只相比呢？')
  fireEvent.click(screen.getByRole('button', { name: '返回Agents' }))
  await waitFor(() => { expect(release).toHaveBeenCalledTimes(1) })
})

it('marks prior answers stale when the hot-rank selection changes', async () => {
  const { startDashboard } = mount()
  fireEvent.click(screen.getByRole('button', { name: /热股榜监控/ }))
  await waitFor(() => { expect(screen.getByRole('button', { name: /甲公司/ })).toBeTruthy() })
  fireEvent.click(screen.getByRole('button', { name: '问看板' }))
  fireEvent.change(screen.getByLabelText('你的问题'), { target: { value: '排名如何？' } })
  fireEvent.click(screen.getByRole('button', { name: '发送问题' }))
  await waitFor(() => { expect(startDashboard).toHaveBeenCalledTimes(1) })
  expect(startDashboard.mock.calls[0]?.[0]).toContain('1941909')
  fireEvent.click(within(screen.getByRole('navigation', { name: '热股榜视图' })).getByRole('button', { name: '热股 · 小时' }))
  expect(screen.getByText('看板内容已变化，下一条提问将使用当前数据。')).toBeTruthy()
})

it('opens hot-rank lists and daily history without starting a Session', async () => {
  const { start, loadHotRank, loadHotRankHistory } = mount()
  fireEvent.click(screen.getByRole('button', { name: /热股榜监控/ }))
  await waitFor(() => { expect(screen.getByRole('button', { name: /甲公司/ })).toBeTruthy() })
  await waitFor(() => { expect(screen.getByText('2026-10-12')).toBeTruthy() })
  expect(start).not.toHaveBeenCalled()
  expect(loadHotRank).toHaveBeenCalledTimes(1)
  expect(loadHotRankHistory).toHaveBeenCalledWith('600001.SH', expect.any(AbortSignal))
  fireEvent.click(within(screen.getByRole('navigation', { name: '热股榜视图' })).getByRole('button', { name: '热股 · 小时' }))
  expect(screen.getByText('当前榜单没有股票')).toBeTruthy()
})

it('opens the native dragon-tiger dashboard without starting a Session', async () => {
  const { start, loadDragonTiger } = mount()
  fireEvent.click(screen.getByRole('button', { name: /龙虎榜观察/ }))
  await waitFor(() => { expect(screen.getByText('2026-10-12')).toBeTruthy() })
  expect(start).not.toHaveBeenCalled()
  expect(loadDragonTiger).toHaveBeenCalledTimes(1)
  expect(screen.getByText('1 / 1')).toBeTruthy()
  expect(screen.getByText('+5.57%')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'amount' } })
  expect(screen.getByRole('option', { name: '成交额' }).getAttribute('value')).toBe('amount')
  fireEvent.click(within(screen.getByRole('navigation', { name: '龙虎榜类型' })).getByRole('button', { name: '机构榜' }))
  expect(screen.getByText('机构榜', { selector: 'button' }).getAttribute('aria-current')).toBe('page')
  fireEvent.click(screen.getByRole('button', { name: /甲公司/ }))
  expect(screen.getByRole('region', { name: '记录详情' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '返回Agents' }))
  expect(screen.getByRole('button', { name: /龙虎榜观察/ })).toBeTruthy()
})

it('renders a newly launched Agent in the Agents panel and returns to its catalog', async () => {
  const { start, renderSlot } = mount()
  fireEvent.click(screen.getByRole('button', { name: /智能选股/ }))
  fireEvent.change(screen.getByLabelText('描述你的筛选条件'), { target: { value: '半导体公司' } })
  fireEvent.click(screen.getByRole('button', { name: '运行分析' }))
  await waitFor(() => { expect(screen.getByTestId('conversation')).toBeTruthy() })
  expect(start).toHaveBeenCalledWith(SCREENING, '半导体公司')
  expect(renderSlot).toHaveBeenCalledWith('stock-agents.conversation', {})
  fireEvent.click(screen.getByRole('button', { name: '返回Agents' }))
  expect(screen.queryByTestId('conversation')).toBeNull()
  expect(screen.getByRole('button', { name: /智能选股/ })).toBeTruthy()
})

it('starts company analysis from a stock name or code field', async () => {
  const { start } = mount(false, [COMPANY])
  fireEvent.click(screen.getByRole('button', { name: /分析个股/ }))
  const input = screen.getByLabelText('输入股票名称或代码')
  expect(input.tagName).toBe('INPUT')
  fireEvent.change(input, { target: { value: '600519' } })
  fireEvent.click(screen.getByRole('button', { name: '运行分析' }))
  await waitFor(() => { expect(start).toHaveBeenCalledWith(COMPANY, '600519') })
})

it('starts sector analysis from a sector name field', async () => {
  const { start } = mount(false, [SECTOR])
  fireEvent.click(screen.getByRole('button', { name: /分析板块/ }))
  const input = screen.getByLabelText('输入板块名称')
  expect(input.tagName).toBe('INPUT')
  fireEvent.change(input, { target: { value: '人工智能' } })
  fireEvent.click(screen.getByRole('button', { name: '运行分析' }))
  await waitFor(() => { expect(start).toHaveBeenCalledWith(SECTOR, '人工智能') })
})

it('opens a recorded Agent inside the same panel', () => {
  const { openSession } = mount(true)
  fireEvent.click(screen.getByRole('button', { name: '查看结果' }))
  expect(openSession).toHaveBeenCalledWith(SESSION)
  expect(screen.getByTestId('conversation')).toBeTruthy()
  fireEvent.click(within(screen.getByRole('navigation', { name: '投研Agents' })).getByRole('button', { name: '重新分析' }))
  expect(screen.queryByTestId('conversation')).toBeNull()
  expect(screen.getByLabelText('描述你的筛选条件')).toHaveProperty('value', '半导体公司')
})

it('reopens a recorded dashboard Session with its board and inquiry panel', async () => {
  const { openSession, loadDragonTiger } = mount('dragon')
  fireEvent.click(screen.getByRole('button', { name: '查看结果' }))
  await waitFor(() => { expect(screen.getByText('2026-10-12')).toBeTruthy() })
  expect(openSession).toHaveBeenCalledWith(SESSION)
  expect(loadDragonTiger).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('complementary', { name: '问看板' }).hasAttribute('hidden')).toBe(false)
  expect(screen.getByTestId('conversation')).toBeTruthy()
})

it('collapses and restores Agent history with an icon button', () => {
  mount(true)
  const history = screen.getByRole('complementary', { name: '分析记录' })
  const hide = within(history).getByRole('button', { name: '隐藏分析记录' })
  expect(hide.querySelector('svg')).not.toBeNull()
  expect(hide.textContent).toBe('')
  fireEvent.click(hide)
  expect(history).toHaveProperty('hidden', true)
  const show = screen.getByRole('button', { name: '显示分析记录' })
  expect(show.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(show)
  expect(history).toHaveProperty('hidden', false)
  expect(within(history).getByRole('button', { name: '隐藏分析记录' })).toBeTruthy()
})
