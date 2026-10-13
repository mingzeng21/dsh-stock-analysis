// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ChatTextAnnotationSource } from '../src/client/contract/slots.ts'
import { AssistantMarkdown, type AssistantMarkdownProps } from '../src/client/chat/AssistantMarkdown.tsx'
import { useDetailedPresentation } from './presentation-fixture.client.ts'
import { useDisclosure } from '../src/client/chat/use-disclosure.ts'
import { zh } from '../src/client/locale.ts'

const t = makeTranslate(zh, commonZh)
const renderMessageImages: AssistantMarkdownProps['renderMessageImages'] = () => null

describe('assistant prose annotations', () => {
  it('requests a settled block and repaints its original words when resolution arrives', async () => {
    let revision = 0
    let resolved = false
    const listeners = new Set<() => void>()
    const open = vi.fn()
    const request = vi.fn(() => { queueMicrotask(() => {
      resolved = true
      revision++
      for (const listener of listeners) listener()
    }) })
    const source: ChatTextAnnotationSource = {
      request,
      getSnapshot: () => revision,
      subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      resolve: text => resolved && text === '贵州茅台'
        ? [{ start: 0, end: 4, label: '查看行情', title: '贵州茅台', onActivate: open }] : [],
    }
    const props = { useDisclosure, usePresentation: useDetailedPresentation, t,
      blocks: [{ kind: 'text' as const, text: '贵州茅台' }], renderMessageImages, textAnnotations: source }
    const view = render(<AssistantMarkdown {...props} streaming />)
    expect(view.queryByRole('button', { name: '查看行情' })).toBeNull()
    view.rerender(<AssistantMarkdown {...props} streaming={false} />)
    await waitFor(() => { expect(view.getByRole('button', { name: '查看行情' })).toBeTruthy() })
    expect(request).toHaveBeenCalledWith('贵州茅台')
  })
})
