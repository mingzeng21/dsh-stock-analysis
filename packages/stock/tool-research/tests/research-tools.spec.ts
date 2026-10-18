/** Model tool registration and publication review over an isolated research controller. */
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'
import * as ToolResearch from '../src/index.ts'

const signal = new AbortController().signal

/** Register the model tools over one stubbed published snapshot. */
async function mount() {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const proposals: object[] = []
  ctx.provide('researchController', {
    current: () => ({
      pages: [{ id: 'page-1', title: '稀缺环节', kind: 'topic', summary: '摘要', markdown: '证据'.repeat(10_000), sourceIds: ['source-1'], links: [] }],
      sources: [{ id: 'source-1', title: '原始资料', text: '披露内容' }],
    }),
    propose: async (request: object) => {
      proposals.push(request)
      return { proposals: [{ id: 'proposal-1' }] }
    },
  } as never)
  await ctx.plugin(ToolResearch)
  const call = (name: string, args: object) => ctx.tools.execute({
    signal, callId: ToolCallId('call-1'), name, arguments: args,
  })
  return { ctx, call, proposals }
}

describe('research model tools', () => {
  it('registers search, read, and reviewed proposal tools', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual(['research_search', 'research_read', 'research_propose'])
  })

  it('reads saved material and stages a proposal without publishing a page', async () => {
    const { call, proposals } = await mount()
    const search = await call('research_search', { query: '稀缺' })
    expect(JSON.stringify(search.value)).toContain('page-1')
    const read = await call('research_read', { id: 'source-1' })
    expect(JSON.stringify(read.value)).toContain('披露内容')
    const proposed = await call('research_propose', {
      kind: 'topic', title: '新研究', summary: '结论', markdown: '# 新研究', sourceIds: ['source-1'], links: ['page-1'],
    })
    expect(JSON.stringify(proposed.value)).toContain('proposal-1')
    expect(proposals).toHaveLength(1)
  })

  it('returns long pages in successive bounded chunks', async () => {
    const { call } = await mount()
    const first = await call('research_read', { id: 'page-1' })
    const firstValue = JSON.parse(String(first.value)) as { content: string; nextOffset: number }
    expect(firstValue.nextOffset).toBeGreaterThan(0)
    const second = await call('research_read', { id: 'page-1', offset: firstValue.nextOffset })
    const secondValue = JSON.parse(String(second.value)) as { content: string; nextOffset: null }
    expect(firstValue.content + secondValue.content).toBe('证据'.repeat(10_000))
    expect(secondValue.nextOffset).toBeNull()
  })
})
