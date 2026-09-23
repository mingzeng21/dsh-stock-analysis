// @vitest-environment jsdom
/**
 * The analysis transcript as the pane shows it: the turns the session's Chat
 * target publishes, and the empty state before any question was asked.
 */
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AnalysisTranscript, type AnalysisTranscriptProps } from '../src/client/AnalysisTranscript.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** The Chat hook as the renderer binds it: one selector over the snapshot. */
function chatHook(items: readonly { readonly anchorKey: string; readonly prompt: string; readonly response: string }[]) {
  const snapshot = { navigation: { items: () => items } } as unknown as ChatSnapshot
  return ((select: (value: ChatSnapshot) => unknown) => select(snapshot)) as AnalysisTranscriptProps['useChat']
}

/** Mount the transcript over one scripted Chat snapshot. */
function mount(items: readonly { readonly anchorKey: string; readonly prompt: string; readonly response: string }[]) {
  const props = { useChat: chatHook(items), t: makeTranslate(zh) } as unknown as AnalysisTranscriptProps
  render(<AnalysisTranscript {...props} />)
}

describe('AnalysisTranscript', () => {
  it('says nothing was asked yet when the session has no turns', () => {
    mount([])
    expect(screen.getByText(zh['analysis.empty'])).toBeDefined()
  })

  it('renders each turn as its question and the answer preview', () => {
    mount([
      { anchorKey: 'turn-1', prompt: '当前标的：贵州茅台 600519.SH\n\n为什么跌', response: '因为…' },
      { anchorKey: 'turn-2', prompt: '支撑位在哪', response: '1550 附近' },
    ])
    const list = screen.getByRole('list', { name: zh['analysis.transcript'] })
    expect(list.children).toHaveLength(2)
    expect(screen.getByText(/当前标的：贵州茅台 600519\.SH/u)).toBeDefined()
    expect(screen.getByText('因为…')).toBeDefined()
    expect(screen.getByText('1550 附近')).toBeDefined()
  })

  it('leaves the answer out while the turn has not answered yet', () => {
    mount([{ anchorKey: 'turn-1', prompt: '为什么跌', response: '' }])
    expect(screen.getByText('为什么跌')).toBeDefined()
    expect(screen.getByRole('listitem').querySelectorAll('p')).toHaveLength(1)
  })
})
