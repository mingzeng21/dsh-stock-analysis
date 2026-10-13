import { describe, expect, it, vi } from 'vitest'
import type { IStockClient, InstrumentMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { candidates, StockMentions } from '../src/client/mentions.ts'

const MAOTAI: InstrumentMatch = { thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }

describe('settled stock mentions', () => {
  it('extracts codes and a name embedded in Chinese prose while excluding Markdown destinations', () => {
    expect(candidates('贵州茅台业绩增长，代码 600519.SH。[忽略](https://example.com/000001.SZ) `300750.SZ`'))
      .toContain('贵州茅台')
    expect(candidates('贵州茅台业绩增长，代码 600519.SH。')).toContain('600519.SH')
    expect(candidates('[忽略](https://example.com/000001.SZ) `300750.SZ`')).not.toContain('300750.SZ')
  })

  it('annotates only one exact resolved security and opens its quote', async () => {
    const searchSymbols = vi.fn(async (query: string) => query === '贵州茅台' || query === '600519.SH'
      ? [MAOTAI] : [{ ...MAOTAI, name: '贵州茅台股份' }])
    const open = vi.fn()
    const service = new StockMentions({ searchSymbols } as Pick<IStockClient, 'searchSymbols'> as IStockClient,
      open, hit => `查看 ${hit.name} 行情`)
    const source = service.forSession('s1' as SessionId)
    source.request('贵州茅台 600519.SH')
    await vi.waitFor(() => { expect(source.resolve('贵州茅台 600519.SH')).toHaveLength(2) })
    const first = source.resolve('贵州茅台 600519.SH')[0]!
    expect(first).toMatchObject({ start: 0, end: 4, label: '查看 贵州茅台 行情' })
    first.onActivate()
    expect(open).toHaveBeenCalledWith(MAOTAI)
    expect(searchSymbols).toHaveBeenCalledWith('贵州茅台', 20)
    service.dispose()
  })

  it('leaves an ambiguous name inert', async () => {
    const stock: Pick<IStockClient, 'searchSymbols'> = {
      searchSymbols: async () => [MAOTAI, { ...MAOTAI, thscode: '000001.SZ' }],
    }
    const service = new StockMentions(stock as IStockClient, vi.fn(), () => '')
    const source = service.forSession('s1' as SessionId)
    source.request('贵州茅台')
    await vi.waitFor(() => { expect(source.getSnapshot()).toBeGreaterThan(0) })
    expect(source.resolve('贵州茅台')).toEqual([])
    service.dispose()
  })
})
