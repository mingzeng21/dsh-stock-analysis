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
    expect(result.messages[1]?.source).toEqual({ kind: 'skill-invocation', name: 'stock-screening', form: 'instructions' })
    expect(result.messages[1]?.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('当前版研究要求') })
  })

  it('blocks follow-up when its skill was removed', async () => {
    expect(await continueStockAgent(proposed, record, async () => undefined)).toEqual({ kind: 'reject' })
  })
})
