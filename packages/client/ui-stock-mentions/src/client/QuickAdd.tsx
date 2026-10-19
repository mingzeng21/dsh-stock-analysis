/** The same watchlist action in assistant prose and the quote header. */
import { useSyncExternalStore } from 'react'
import type { InstrumentMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { IWatchlist } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { IconCheckOutlineRegular, IconPlusOutlineRegular, Toast, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WatchlistQuickAdd } from './watchlist.ts'
import css from './QuickAdd.module.css'

export interface StockToastNotice { readonly seq: number; readonly text: string; readonly success: boolean }

/** Render one transient result beyond the lifetime of either action button. */
export function StockAddToast({ notice, dismiss }: {
  notice: ObservableSnapshot<StockToastNotice | null>
  dismiss: (seq: number) => void
}) {
  const current = useSyncExternalStore(fn => notice.subscribe(fn), () => notice.getSnapshot())
  return current === null ? null : <Toast key={current.seq} text={current.text}
    {...current.success ? { tone: 'success' as const } : {}}
    onDone={() => { dismiss(current.seq) }} />
}

/** Add the selected security directly, or show its durable membership. */
export function QuickAddButton({ hit, watchlist, add, t, compact = false }: {
  hit: InstrumentMatch
  watchlist: IWatchlist
  add: WatchlistQuickAdd
  t: PropsLocale<'stockMentions'>['t']
  compact?: boolean
}) {
  const entries = useSyncExternalStore(fn => watchlist.entries.subscribe(fn), () => watchlist.entries.getSnapshot())
  const pending = useSyncExternalStore(fn => add.pending.subscribe(fn), () => add.pending.getSnapshot())
  const added = entries.some(entry => entry.thscode === hit.thscode)
  const busy = pending.has(hit.thscode)
  const label = t(added ? 'watchlist.inList' : busy ? 'watchlist.adding' : 'watchlist.add')
  const button = <button type="button" className={compact ? css.compact : css.panel}
    aria-label={t(added ? 'watchlist.addedName' : busy ? 'watchlist.addingName' : 'watchlist.addName', { name: hit.name })}
    disabled={added || busy} onClick={() => { void add.add(hit) }}>
    {added ? <IconCheckOutlineRegular size={14} /> : <IconPlusOutlineRegular size={14} />}
    {!compact && <span>{label}</span>}
  </button>
  return compact ? <Tooltip label={label} portal>{button}</Tooltip> : button
}
