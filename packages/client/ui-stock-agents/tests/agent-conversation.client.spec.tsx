// @vitest-environment jsdom
/** Answer references can navigate back to matching dashboard records. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentConversation } from '../src/client/AgentConversation.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

it('offers a focus button for a stock mentioned in the latest answer', () => {
  const onFocus = vi.fn()
  const unused = () => { throw new Error('unneeded global slot prop') }
  const props = {
    sessionId: 'agent-run' as SessionId,
    useSession: () => ({ openState: 'active' }),
    useConversation: () => '甲公司 600001.SH 的机构净额较高',
    renderFactorySlot: () => <div>回答内容</div>,
    dashboardData: {
      tradeDate: '2026-10-12', boards: [{ type: 'all', stockCount: 1, recordCount: 1, truncated: false,
        stocks: [{ thscode: '600001.SH', name: '甲公司', netValue: 10_000_000 }], seats: [] }],
    },
    onFocus,
    t: makeTranslate(zh),
    usePanelInfo: unused,
    useSessions: unused,
    useSessionStatus: unused,
    useSessionRetainInfo: unused,
    useWorkspaces: unused,
    useResource: unused,
  } as React.ComponentProps<typeof AgentConversation>
  render(<AgentConversation {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '甲公司' }))
  expect(onFocus).toHaveBeenCalledWith('600001.SH')
})
