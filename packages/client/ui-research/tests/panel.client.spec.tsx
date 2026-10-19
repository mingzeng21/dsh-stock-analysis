// @vitest-environment jsdom
/** The directory and graph render committed pages while proposals wait for review. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ResearchSnapshot } from '@deepseek-ai/dsh-api-research-controller/types'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchPanel, type ResearchPanelProps } from '../src/client/ResearchPanel.tsx'
import { zh } from '../src/client/locales.ts'

const library: ResearchSnapshot = {
  sources: [], studies: [], history: [], activity: [],
  pages: [{ id: 'page-1' as never, kind: 'topic', title: '芯片产业链', summary: '已审阅页面',
    markdown: '# 芯片产业链\n公开披露', sourceIds: [], links: [], revision: 1, createdAt: 1, updatedAt: 1 }],
  proposals: [{ id: 'proposal-1', kind: 'topic', title: '未经审阅的新判断', summary: '待审',
    markdown: '# 新判断', sourceIds: [], links: [], createdAt: 2 }],
  templates: { entity: '', concept: '', topic: '', source: '' },
}

afterEach(cleanup)

it('shows published pages, reviews a proposal, and opens an unlinked page from the graph', () => {
  const state = createSnapshotStore(library)
  const phase = createSnapshotStore<'ready'>('ready')
  const acceptProposal = vi.fn(async () => undefined)
  const unused = () => { throw new Error('unused global panel property') }
  const props = {
    t: makeTranslate(zh), useLibrary: bindSnapshotSelector(state), usePhase: bindSnapshotSelector(phase),
    load: vi.fn(async () => undefined), saveSource: vi.fn(), savePage: vi.fn(), restorePage: vi.fn(),
    startStudy: vi.fn(), runSource: vi.fn(), openStudy: vi.fn(),
    acceptProposal, rejectProposal: vi.fn(), sourceFile: vi.fn(), saveTemplate: vi.fn(),
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useWorkspaces: unused, useResource: unused,
  } as ResearchPanelProps
  render(<ResearchPanel {...props} />)
  expect(screen.getByText('待审阅修改 (1)')).toBeTruthy()
  expect(screen.getByRole('button', { name: /芯片产业链已审阅页面/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '发布' }))
  expect(acceptProposal).toHaveBeenCalledWith('proposal-1')
  fireEvent.click(screen.getByRole('button', { name: '芯片产业链' }))
  expect(screen.getByText('已审阅页面', { exact: false })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '关系图谱' }))
  expect(screen.getByText('这些页面尚未建立关联。选择页面可查看内容并编辑关联。')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '主题芯片产业链' }))
  expect(screen.getByRole('button', { name: '编辑页面' })).toBeTruthy()
})

it('exposes linked graph nodes as keyboard-operable pages', () => {
  const first = library.pages[0]
  if (first === undefined) throw new Error('the graph fixture needs a page')
  const state = createSnapshotStore({ ...library, proposals: [], pages: [
    { ...first, links: ['page-2' as never] },
    { ...first, id: 'page-2' as never, title: '上游材料', links: [] },
  ] })
  const phase = createSnapshotStore<'ready'>('ready')
  const unused = () => { throw new Error('unused global panel property') }
  const props = {
    t: makeTranslate(zh), useLibrary: bindSnapshotSelector(state), usePhase: bindSnapshotSelector(phase),
    load: vi.fn(async () => undefined), saveSource: vi.fn(), savePage: vi.fn(), restorePage: vi.fn(),
    startStudy: vi.fn(), runSource: vi.fn(), openStudy: vi.fn(),
    acceptProposal: vi.fn(), rejectProposal: vi.fn(), sourceFile: vi.fn(), saveTemplate: vi.fn(),
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useWorkspaces: unused, useResource: unused,
  } as ResearchPanelProps
  render(<ResearchPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '关系图谱' }))
  const graph = screen.getByRole('group', { name: /图谱显示前 30 个页面/ })
  const node = within(graph).getByRole('button', { name: '上游材料' })
  fireEvent.keyDown(node, { key: 'Enter' })
  expect(screen.getByRole('heading', { name: '上游材料' })).toBeTruthy()
})

it('starts a complete topic study from one topic field', () => {
  const state = createSnapshotStore(library)
  const phase = createSnapshotStore<'ready'>('ready')
  const startStudy = vi.fn(async () => undefined)
  const unused = () => { throw new Error('unused global panel property') }
  const props = {
    t: makeTranslate(zh), useLibrary: bindSnapshotSelector(state), usePhase: bindSnapshotSelector(phase),
    load: vi.fn(async () => undefined), saveSource: vi.fn(), savePage: vi.fn(), restorePage: vi.fn(),
    startStudy, runSource: vi.fn(), openStudy: vi.fn(), acceptProposal: vi.fn(), rejectProposal: vi.fn(),
    sourceFile: vi.fn(), saveTemplate: vi.fn(),
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useWorkspaces: unused, useResource: unused,
  } as ResearchPanelProps
  render(<ResearchPanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: '专题研究' }))
  fireEvent.change(screen.getByRole('textbox', { name: '研究主题' }), { target: { value: '  CPO 激光器  ' } })
  fireEvent.click(screen.getByRole('button', { name: '开始研究' }))
  expect(startStudy).toHaveBeenCalledWith('CPO 激光器')
  expect(screen.queryByText('当前阶段')).toBeNull()
})

it('offers usable first steps before the library has any content', () => {
  const state = createSnapshotStore({ ...library, pages: [], proposals: [] })
  const phase = createSnapshotStore<'ready'>('ready')
  const unused = () => { throw new Error('unused global panel property') }
  const props = {
    t: makeTranslate(zh), useLibrary: bindSnapshotSelector(state), usePhase: bindSnapshotSelector(phase),
    load: vi.fn(async () => undefined), saveSource: vi.fn(), savePage: vi.fn(), restorePage: vi.fn(),
    startStudy: vi.fn(), runSource: vi.fn(), openStudy: vi.fn(), acceptProposal: vi.fn(), rejectProposal: vi.fn(),
    sourceFile: vi.fn(), saveTemplate: vi.fn(),
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useWorkspaces: unused, useResource: unused,
  } as ResearchPanelProps
  render(<ResearchPanel {...props} />)
  expect(screen.getByText('建立你的研究资料库')).toBeTruthy()
  expect(screen.queryByText('wiki/index.md')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '添加资料' }))
  expect(screen.getByRole('textbox', { name: '原文或摘录' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '关系图谱' }))
  expect(screen.getByText('关系图谱从页面开始')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '新建页面' }))
  expect(screen.getByRole('textbox', { name: '页面内容' })).toBeTruthy()
})
