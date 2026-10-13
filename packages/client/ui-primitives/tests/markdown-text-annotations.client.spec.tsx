// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MarkdownText } from './markdown-test-components.tsx'

describe('settled Markdown text annotations', () => {
  it('activates prose in place without nesting controls in links or marking code', () => {
    const open = vi.fn()
    const annotations = { resolve: (value: string) => {
      const start = value.indexOf('贵州茅台')
      return start < 0 ? [] : [{ start, end: start + 4, label: '查看贵州茅台行情', title: '贵州茅台', onActivate: open }]
    } }
    const view = render(<MarkdownText text={'贵州茅台、[贵州茅台](https://example.com)、`贵州茅台`'} textAnnotations={annotations} />)
    const button = view.getByRole('button', { name: '查看贵州茅台行情' })
    expect(view.getAllByText('贵州茅台')).toHaveLength(3)
    fireEvent.click(button)
    expect(open).toHaveBeenCalledOnce()
    expect(view.container.querySelector('a button')).toBeNull()
    expect(view.container.querySelector('code button')).toBeNull()
  })

  it('keeps annotations inert while streaming', () => {
    const view = render(<MarkdownText text="贵州茅台" streaming textAnnotations={{ resolve: () => [{ start: 0, end: 4, label: '行情', title: '', onActivate: vi.fn() }] }} />)
    expect(view.queryByRole('button', { name: '行情' })).toBeNull()
  })
})
