// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectionActions } from '../src/client/chat/SelectionActions.tsx'

afterEach(() => { cleanup(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks() })

function selectText(element: Element): void {
  const range = document.createRange()
  range.selectNodeContents(element)
  Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(80, 90, 100, 20) })
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  vi.spyOn(selection, 'getRangeAt').mockReturnValue(range)
}

describe('Assistant selection actions', () => {
  it('quotes selected answer text into the chosen follow-up', () => {
    const followUp = vi.fn()
    const view = render(<SelectionActions explain={{ label: '解释这段', prompt: '请解释这段话。' }}
      verify={{ label: '核对来源', prompt: '请核对来源。' }} onFollowUp={followUp}>
      <div data-assistant-answer><span>营收同比增长</span></div>
    </SelectionActions>)
    selectText(view.getByText('营收同比增长'))
    fireEvent.mouseUp(view.getByText('营收同比增长'))
    fireEvent.click(screen.getByRole('button', { name: '核对来源' }))
    expect(followUp).toHaveBeenCalledWith('> 营收同比增长\n\n请核对来源。')
    expect(screen.queryByRole('button', { name: '核对来源' })).toBeNull()
  })

  it('does not offer actions for reasoning and dismisses them with Escape', () => {
    const view = render(<SelectionActions explain={{ label: '解释这段', prompt: '请解释这段话。' }}
      verify={{ label: '核对来源', prompt: '请核对来源。' }} onFollowUp={vi.fn()}>
      <span>推理文字</span><div data-assistant-answer><span>回答文字</span></div>
    </SelectionActions>)
    selectText(view.getByText('推理文字'))
    fireEvent.mouseUp(view.getByText('推理文字'))
    expect(screen.queryByRole('button', { name: '解释这段' })).toBeNull()
    selectText(view.getByText('回答文字'))
    fireEvent.mouseUp(view.getByText('回答文字'))
    expect(screen.getByRole('button', { name: '解释这段' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: '解释这段' })).toBeNull()
  })

  it('escapes clipped content and closes when the conversation scrolls', () => {
    const view = render(<div style={{ overflow: 'hidden' }}>
      <SelectionActions explain={{ label: '解释这段', prompt: '请解释这段话。' }}
        verify={{ label: '核对来源', prompt: '请核对来源。' }} onFollowUp={vi.fn()}>
        <div data-assistant-answer><span>回答文字</span></div>
      </SelectionActions>
    </div>)
    selectText(view.getByText('回答文字'))
    fireEvent.mouseUp(view.getByText('回答文字'))
    const action = screen.getByRole('button', { name: '解释这段' })
    expect(document.body.querySelector('[data-selection-actions]')?.contains(action)).toBe(true)
    fireEvent.scroll(view.container.firstElementChild!)
    expect(screen.queryByRole('button', { name: '解释这段' })).toBeNull()
  })
})
