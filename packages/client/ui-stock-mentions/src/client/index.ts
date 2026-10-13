/** Inline stock mentions and the matching quote tab in the right sidebar. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-stock-controller/client'
import type {} from '@deepseek-ai/dsh-api-watchlist-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { StockMentions } from './mentions.ts'
import { QuoteOverlay } from './QuotePanel.tsx'
import { StockQuoteOverlay } from './overlay.ts'
import { QuickAddButton, type StockToastNotice } from './QuickAdd.tsx'
import { WatchlistQuickAdd, type AddFeedback } from './watchlist.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createElement } from 'react'
import { en, NS, zh, type StockMentionKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Stock mention and quote panel copy. */
    stockMentions: StockMentionKey
  }
}

/** Required stock reads, root overlay slot, and locale. */
export const inject = ['stockClient', 'watchlist', 'slots', 'locale', 'layout']

/** Register the optional annotation provider and fixed right-edge quote panel. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-stock-mentions: locale')
  const t = ctx.locale.bind(NS)
  const overlay = new StockQuoteOverlay()
  const toast = createSnapshotStore<StockToastNotice | null>(null)
  let toastSeq = 0
  const feedback = (result: AddFeedback, name: string): void => {
    toast.set({ seq: ++toastSeq, text: t(`watchlist.${result}`, { name }), success: result === 'added' || result === 'already' })
  }
  const add = new WatchlistQuickAdd(ctx.watchlist, feedback)
  void add.load()
  const mentions = new StockMentions(ctx.stockClient,
    (hit) => { overlay.open(hit) },
    hit => t('view', { name: hit.name, code: hit.thscode }),
    hit => createElement(QuickAddButton, { hit, watchlist: ctx.watchlist, add, t, compact: true }))
  ctx.provide('chatTextAnnotations', mentions)
  ctx.effect(() => () => { mentions.dispose() }, 'ui-stock-mentions: resolver cleanup')
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'stock-quote', locale: NS,
    inject: () => ({ overlay, stock: ctx.stockClient, watchlist: ctx.watchlist, add, toast,
      dismissToast: (seq: number) => { if (toast.getSnapshot()?.seq === seq) toast.set(null) },
      nameOf: (code: string) => mentions.name(code) }),
  }, QuoteOverlay)), 'ui-stock-mentions: global quote panel')
}
