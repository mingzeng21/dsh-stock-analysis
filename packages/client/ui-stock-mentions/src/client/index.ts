/** Inline stock mentions and the matching quote tab in the right sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-stock-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { StockMentions } from './mentions.ts'
import { QuoteOverlay } from './QuotePanel.tsx'
import { StockQuoteOverlay } from './overlay.ts'
import { en, NS, zh, type StockMentionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Stock mention and quote panel copy. */
    stockMentions: StockMentionKey
  }
}

/** Required stock reads, root overlay slot, and locale. */
export const inject = ['stockClient', 'slots', 'locale', 'layout']

/** Register the optional annotation provider and fixed right-edge quote panel. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-stock-mentions: locale')
  const t = ctx.locale.bind(NS)
  const overlay = new StockQuoteOverlay()
  const mentions = new StockMentions(ctx.stockClient,
    (hit) => { overlay.open(hit) },
    hit => t('view', { name: hit.name, code: hit.thscode }))
  ctx.provide('chatTextAnnotations', mentions)
  ctx.effect(() => () => { mentions.dispose() }, 'ui-stock-mentions: resolver cleanup')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'stock-quote', locale: NS,
    inject: () => ({ overlay, stock: ctx.stockClient, nameOf: (code: string) => mentions.name(code) }),
  }, QuoteOverlay)), 'ui-stock-mentions: global quote panel')
}
