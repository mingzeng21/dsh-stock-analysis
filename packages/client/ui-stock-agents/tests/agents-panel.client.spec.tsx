// @vitest-environment jsdom
/** The Agents panel keeps specialist output and history inside its own main entry. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StockAgentCard } from '@deepseek-ai/dsh-api-stock-agents-controller/types'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
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

afterEach(cleanup)

function mount(history = false) {
  const catalog = createSnapshotStore<readonly StockAgentCard[]>([SCREENING])
  const sessions = createSnapshotStore<SessionListState>({
    ids: history ? [SESSION] : [],
    byId: history ? {
      [SESSION]: {
        id: SESSION, displayTitle: '筛选结果', running: false, retainedBy: {}, blank: false,
        updatedAt: 1_780_000_000_000,
        projectionValues: { stockAgent: { name: SCREENING.name, query: '半导体公司' } },
      },
    } : {},
    phase: 'ready',
    projectionsBySession: {},
  })
  const locale = createSnapshotStore<LocaleSnapshot>({ active: 'zh', locales: [], revision: 0 })
  const error = createSnapshotStore<string | null>(null)
  const start = vi.fn(async () => SESSION)
  const openSession = vi.fn()
  const renderSlot = vi.fn((..._args: unknown[]) => <div data-testid="conversation">流式回答与追问</div>)
  const unused = () => { throw new Error('unneeded global slot prop') }
  const props = {
    t: makeTranslate(zh),
    useCatalog: bindSnapshotSelector(catalog),
    useSessions: bindSnapshotSelector(sessions),
    useLocale: bindSnapshotSelector(locale),
    useCatalogError: bindSnapshotSelector(error),
    loadCatalog: vi.fn(),
    start,
    openSession,
    renderSlot,
    usePanelInfo: unused,
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    useWorkspaces: unused,
    useResource: unused,
  } as AgentsPanelProps
  render(<AgentsPanel {...props} />)
  return { start, openSession, renderSlot }
}

it('renders a newly launched Agent in the Agents panel and returns to its catalog', async () => {
  const { start, renderSlot } = mount()
  fireEvent.click(screen.getByRole('button', { name: /智能选股/ }))
  fireEvent.change(screen.getByLabelText('描述你的分析条件'), { target: { value: '半导体公司' } })
  fireEvent.click(screen.getByRole('button', { name: '运行分析' }))
  await waitFor(() => { expect(screen.getByTestId('conversation')).toBeTruthy() })
  expect(start).toHaveBeenCalledWith(SCREENING, '半导体公司')
  expect(renderSlot).toHaveBeenCalledWith('stock-agents.conversation', {})
  fireEvent.click(screen.getByRole('button', { name: '返回 Agents' }))
  expect(screen.queryByTestId('conversation')).toBeNull()
  expect(screen.getByRole('button', { name: /智能选股/ })).toBeTruthy()
})

it('opens a recorded Agent inside the same panel', () => {
  const { openSession } = mount(true)
  fireEvent.click(screen.getByRole('button', { name: '查看分析' }))
  expect(openSession).toHaveBeenCalledWith(SESSION)
  expect(screen.getByTestId('conversation')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重新分析' }))
  expect(screen.queryByTestId('conversation')).toBeNull()
  expect(screen.getByLabelText('描述你的分析条件')).toHaveProperty('value', '半导体公司')
})
