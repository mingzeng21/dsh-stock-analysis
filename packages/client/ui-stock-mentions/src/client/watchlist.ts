/** Shared quick-add state for inline mentions and the quote panel. */
import type { InstrumentMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { IWatchlist } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'

/** Result shown after one Host watchlist command. */
export type AddFeedback = 'added' | 'already' | 'limit' | 'failed'

function failureCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/** Coordinate duplicate clicks while the Host publishes the durable list. */
export class WatchlistQuickAdd {
  private readonly pendingStore = createSnapshotStore<ReadonlySet<string>>(new Set())
  private initialLoad: Promise<void> | undefined
  /** Complete codes with an add command in flight. */
  readonly pending: ObservableSnapshot<ReadonlySet<string>> = this.pendingStore

  constructor(private readonly watchlist: IWatchlist,
    private readonly feedback: (result: AddFeedback, name: string) => void) {}

  /** Load initial membership once; failure leaves the add command available.
   * @returns completion of the initial read.
   */
  load(): Promise<void> {
    if (this.initialLoad === undefined) {
      this.initialLoad = (async () => {
        try { await this.watchlist.refresh() } catch (_error: unknown) { /* The add command can still reach the Host. */ }
      })()
    }
    return this.initialLoad
  }

  /** Add one uniquely resolved A-share and publish the Host's answer.
   * @param hit - exact security match.
   * @returns completion after membership or failure feedback is published.
   */
  async add(hit: InstrumentMatch): Promise<void> {
    const code = hit.thscode
    if (this.pendingStore.getSnapshot().has(code)
      || this.watchlist.entries.getSnapshot().some(entry => entry.thscode === code)) return
    this.pendingStore.set(new Set([...this.pendingStore.getSnapshot(), code]))
    try {
      await this.load()
      if (this.watchlist.entries.getSnapshot().some(entry => entry.thscode === code)) {
        this.feedback('already', hit.name)
        return
      }
      await this.watchlist.add(code)
      this.feedback('added', hit.name)
    } catch (error: unknown) {
      const code = failureCode(error)
      if (code === 'watchlist/duplicate') {
        try { await this.watchlist.refresh() } catch (_error: unknown) { /* The Host still reported membership. */ }
        this.feedback('already', hit.name)
      } else {
        this.feedback(code === 'watchlist/limit-reached' ? 'limit' : 'failed', hit.name)
      }
    } finally {
      const next = new Set(this.pendingStore.getSnapshot())
      next.delete(hit.thscode)
      this.pendingStore.set(next)
    }
  }
}
