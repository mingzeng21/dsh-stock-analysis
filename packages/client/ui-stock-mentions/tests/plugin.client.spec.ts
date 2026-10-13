// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import type { IStockClient } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { StockQuoteOverlay } from '../src/client/overlay.ts'

describe('stock mention browser plugin', () => {
  it('opens the fixed quote panel from a resolved mention on any main page', async () => {
    const ctx = new Context()
    let overlay: StockQuoteOverlay | undefined
    ctx.provide('stockClient', { searchSymbols: async () => [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }] } as Pick<IStockClient, 'searchSymbols'> as IStockClient)
    ctx.provide('layout', {} as never)
    ctx.provide('slots', {
      inject: (_name: string, register: () => () => void) => register(),
      register: (options: { name: string; inject?: () => { overlay: StockQuoteOverlay } }) => {
        if (options.name === 'shell.overlay') overlay = options.inject?.().overlay
        return () => {}
      },
    } as never)
    ctx.provide('locale', { register: () => () => {}, bind: () => (key: string) => key } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const source = ctx.get('chatTextAnnotations')!.forSession('session' as SessionId)
    source.request('贵州茅台')
    await vi.waitFor(() => { expect(source.resolve('贵州茅台')).toHaveLength(1) })
    source.resolve('贵州茅台')[0]!.onActivate()
    expect(overlay?.getSnapshot()?.thscode).toBe('600519.SH')
    await fiber.dispose()
  })
})
