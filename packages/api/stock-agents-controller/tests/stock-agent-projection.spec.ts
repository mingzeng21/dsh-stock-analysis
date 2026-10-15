/** Durable specialist identity is derived from committed user and skill messages. */
import { describe, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { advanceStockAgent, continueStockAgent } from '../src/index.ts'

const empty = { record: null, firstPrompt: '' }

function prompt(text: string) {
  return createUserMessage({ content: [{ type: 'text' as const, text }], source: { kind: 'user' as const } })
}
function invoked(name: string) {
  return createUserMessage({
    content: [{ type: 'text' as const, text: '# current instructions' }],
    source: { kind: 'skill-invocation' as const, name, form: 'instructions' as const },
  })
}

describe('stock Agent record projection', () => {
  it('retains the first card query and explicit skill name across later turns', () => {
    const asked = advanceStockAgent(empty, prompt('/stock-screening 财务增长且突破均线'))
    expect(asked).toEqual({ record: null, firstPrompt: '/stock-screening 财务增长且突破均线' })
    const active = advanceStockAgent(asked, invoked('stock-screening'))
    expect(active.record).toEqual({ name: 'stock-screening', query: '财务增长且突破均线' })
    expect(advanceStockAgent(active, prompt('继续查看下一页'))).toBe(active)
  })

  it('ignores ordinary skills and records an immediate Agent prompt', () => {
    const asked = advanceStockAgent(empty, prompt('/stock-market-overview 分析最新大盘'))
    expect(advanceStockAgent(asked, invoked('unrelated'))).toBe(asked)
    expect(advanceStockAgent(asked, invoked('stock-market-overview')).record).toEqual({
      name: 'stock-market-overview', query: '分析最新大盘',
    })
  })

  it('uses the prompt that invoked a specialist after an ordinary Chat turn', () => {
    const chat = advanceStockAgent(empty, prompt('介绍半导体行业'))
    const asked = advanceStockAgent(chat, prompt('/stock-screening 半导体公司近三年净利润增长'))
    expect(advanceStockAgent(asked, invoked('stock-screening')).record).toEqual({
      name: 'stock-screening', query: '半导体公司近三年净利润增长',
    })
  })

  it('records a sector dashboard with its selected code for reopening', () => {
    const active = advanceStockAgent(empty, prompt('用户问题：有哪些成分？\n\ndashboard-session:sector\nsector-code:886001.TI\n\n看板快照（JSON）：{}'))
    expect(active.record).toEqual({ name: 'dashboard-sector', query: '886001.TI' })
  })

  it('records dashboard questions without requiring a skill invocation', () => {
    const active = advanceStockAgent(empty, prompt('用户问题：机构净额最高的是谁？\n\ndashboard-session:dragon\n\n看板快照（JSON）：{}'))
    expect(active.record).toEqual({ name: 'dashboard-dragon', query: '机构净额最高的是谁？' })
    expect(active.firstPrompt).toBe('')
    expect(advanceStockAgent(active, prompt('继续比较'))).toBe(active)
  })
})

describe('specialist follow-up', () => {
  const record = { name: 'stock-screening', query: '财务增长' }
  const proposed = { kind: 'enter' as const, messages: [prompt('继续分析')] }

  it('loads the current skill body for an existing record', async () => {
    const result = await continueStockAgent(proposed, record, async () => ({
      name: 'stock-screening', provider: 'test', content: '当前版研究要求',
    }))
    expect(result.kind).toBe('enter')
    if (result.kind !== 'enter') return
    const instruction = result.messages[1]
    expect(instruction?.source).toEqual({ kind: 'skill-invocation', name: 'stock-screening', form: 'instructions' })
    expect(instruction?.content[0]?.type).toBe('text')
    if (instruction?.content[0]?.type !== 'text') return
    expect(instruction.content[0].text).toContain('当前版研究要求')
  })

  it('blocks follow-up when its skill was removed', async () => {
    expect(await continueStockAgent(proposed, record, async () => undefined)).toEqual({ kind: 'reject' })
  })

  it('continues dashboard questions without loading a specialist skill', async () => {
    const loadSkill = async () => { throw new Error('dashboard has no skill') }
    expect(await continueStockAgent(proposed, { name: 'dashboard-hot', query: '排名如何' }, loadSkill)).toBe(proposed)
    expect(await continueStockAgent(proposed, { name: 'dashboard-sector', query: '886001.TI' }, loadSkill)).toBe(proposed)
  })
})
