// @vitest-environment jsdom
/** The completed report offers one explicit Wiki import action. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { TurnTailChatData } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ResearchSnapshot } from '@deepseek-ai/dsh-api-research-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import { keyedObservableHook } from '../../ui-renderer/src/client/bindings.tsx'
import type { GlobalStandardProps, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchReportAction, isCompleteResearchReport } from '../src/client/ResearchReportAction.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const report = '# L1 终端需求\n# L2 供应链\n# L3 瓶颈\n# L4 证据\n# L5 判断'

it('recognizes only a report with all five levels', () => {
  expect(isCompleteResearchReport(report)).toBe(true)
  expect(isCompleteResearchReport('# L1\n# L2\n# L3\n# L4')).toBe(false)
})

it('offers import for a completed report in its research Session', () => {
  const state = createSnapshotStore<ResearchSnapshot>({
    sources: [], pages: [], history: [], proposals: [], activity: [],
    studies: [{ id: 'study-1' as never, title: 'CPO 激光器', question: 'CPO 激光器',
      stage: 'question', notes: '', sessionId: 'session-1', createdAt: 1, updatedAt: 1 }],
    templates: { entity: '', concept: '', topic: '', source: '' },
  })
  const blocks = [{ kind: 'text' as const, text: report }]
  const data: TurnTailChatData = {
    turn: 1, seq: 10, time: 10, branchUnavailable: false,
    closing: { status: 'settled', turn: 1, step: 1, blocks, time: 10,
      finalNode: { kind: 'assistant', seq: 9, time: 9, turn: 1, step: 1, blocks } },
  }
  const source = createSnapshotStore<readonly TurnTailChatData[]>([data])
  const importReport = vi.fn(async () => undefined)
  const sessionId = brandString<SessionId>('session-1')
  const unused = (): never => { throw new Error('unused framework property') }
  const standard: GlobalStandardProps & SessionStandardProps = {
    sessionId, useSession: unused, useProjection: unused, useConversation: unused,
    useInput: unused, useChat: unused, useTrajectory: unused,
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useResource: unused, useWorkspaces: unused,
    inputActions: { captureInsertion: unused, insertText: unused, setDraft: unused,
      addAttachments: unused, removeAttachment: unused, pruneAttachments: unused, submit: unused },
  }
  const props = {
    ...standard,
    turn: { turn: 1 } as TurnLocation, seq: 10, openFile: vi.fn(),
    t: makeTranslate(zh),
    useLibrary: bindSnapshotSelector(state),
    useReport: keyedObservableHook(() => source) as Parameters<typeof ResearchReportAction>[0]['useReport'],
    ensureLoaded: vi.fn(async () => undefined), importReport,
  } as Parameters<typeof ResearchReportAction>[0]
  render(<ResearchReportAction {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '录入知识库' }))
  expect(importReport).toHaveBeenCalledWith(1, report, 'CPO 激光器')
})
