/**
 * Durable personal instrument list: the Host half of the `watchlist` Remote
 * namespace.
 *
 * The list is user data rather than configuration, so it is stored through the
 * storage-domain facility and survives a host restart, a browser change, and a
 * profile move. It is host-owned rather than browser-local so a later
 * model-facing tool can read the same list the panel shows.
 *
 * Every mutation returns the complete new list. The list is small and always
 * read whole, so returning it makes the client's projection a wholesale
 * replacement of one authoritative value and removes the merge rules a
 * per-entry delta would need. Mutations are serialized on one chain, so two
 * concurrent adds cannot interleave their reads of the current list.
 *
 * Adding resolves the instrument through the stock seam before storing it, so an
 * entry always carries the display name every surface renders and an unresolved
 * code never enters the list as an unrenderable row.
 * @module @deepseek-ai/dsh-api-watchlist-controller
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { DomainGlobal } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-stock'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { watchlistDomainSpec } from './spec.ts'
import type { WatchlistDomainState, WatchlistRecord } from './spec.ts'
import type {
  WatchlistAddRequest, WatchlistEntry, WatchlistRemoveRequest, WatchlistReorderRequest,
} from './types.ts'

export type * from './types.ts'
export { watchlistDomainSpec } from './spec.ts'
export type { WatchlistDomainState, WatchlistRecord } from './spec.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `watchlist` Remote namespace. */
    watchlistController: WatchlistController
  }
}

/** Reads and mutations this service exposes, and the bound a deployment applies. */
export interface Config {
  /** Inclusive cap on list entries; adding beyond it fails instead of growing the list. */
  readonly maxEntries: number
}

/** The refusal a call whose caller is already gone receives, or `undefined` while the caller is live. */
function cancelled(signal: AbortSignal): RemoteError | undefined {
  return signal.aborted
    ? new RemoteError('gateway/cancelled', 'the watchlist call was cancelled', {})
    : undefined
}

/** One required thscode argument, normalized. */
function requireThscode(value: string): string {
  const thscode = value.trim()
  if (thscode === '') throw new RemoteError('gateway/bad-request', 'thscode is required', {})
  return thscode
}

/** The seam failure code a stock call carried, when it carried one. */
function seamCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && code.startsWith('STOCK_') ? code : undefined
}

/** Project one stored record onto the wire vocabulary. */
function toEntry(record: WatchlistRecord): WatchlistEntry {
  return { thscode: record.thscode, name: record.name, addedAt: record.addedAt }
}

/** Host Remote reads and mutations over the durable watchlist domain. */
export class WatchlistController extends TypertRemoteService {
  static inject = ['storageDomain', 'stock']

  static Config: z<Config> = z.object({
    maxEntries: z.number().step(1).min(1).default(200),
  })

  private global?: DomainGlobal<WatchlistDomainState>
  private state?: WatchlistDomainState
  /** Serializes mutations so a read of the current list and its write are one step. */
  private chain: Promise<unknown> = Promise.resolve()

  /**
   * @param ctx - Host context carrying the storage facility and the stock seam.
   * @param config - deployment bound on the list size.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'watchlistController', { namespace: 'watchlist' })
  }

  /** Open the domain and load the stored list before the service answers any call. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(watchlistDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'watchlist.domainClose')
    this.global = domain.global
    this.state = domain.global.get()
  }

  /**
   * Read the whole list in display order.
   * @param signal - caller cancellation; the read is synchronous, so a cancelled caller is refused rather than interrupted.
   * @returns every entry, in order.
   */
  @Remote
  list(signal: AbortSignal): Promise<readonly WatchlistEntry[]> {
    const refusal = cancelled(signal)
    return refusal === undefined ? Promise.resolve(this.snapshot()) : Promise.reject(refusal)
  }

  /**
   * Resolve an instrument and append it to the list.
   * @param request - the complete thscode to add.
   * @param signal - caller cancellation; the symbol lookup is refused before it starts when the caller is gone.
   * @returns the complete list after the addition.
   */
  @Remote
  async add(request: WatchlistAddRequest, signal: AbortSignal): Promise<readonly WatchlistEntry[]> {
    this.assertLive(signal)
    const thscode = requireThscode(request.thscode)
    return await this.mutate(async () => {
      const entries = this.current()
      if (entries.some(entry => entry.thscode === thscode)) {
        throw new RemoteError('watchlist/duplicate', `${thscode} is already on the watchlist`, { thscode })
      }
      if (entries.length >= this.config.maxEntries) {
        throw new RemoteError(
          'watchlist/limit-reached',
          `the watchlist already holds its maximum of ${this.config.maxEntries} entries`,
          { maxEntries: this.config.maxEntries },
        )
      }
      const name = await this.resolveName(thscode)
      return [...entries, { thscode, name, addedAt: Date.now() }]
    })
  }

  /**
   * Drop one entry.
   * @param request - the thscode to remove.
   * @param signal - caller cancellation; the mutation is refused before it starts when the caller is gone.
   * @returns the complete list after the removal.
   */
  @Remote
  async remove(request: WatchlistRemoveRequest, signal: AbortSignal): Promise<readonly WatchlistEntry[]> {
    this.assertLive(signal)
    const thscode = requireThscode(request.thscode)
    return await this.mutate(() => {
      const entries = this.current()
      const remaining = entries.filter(entry => entry.thscode !== thscode)
      if (remaining.length === entries.length) {
        throw new RemoteError('watchlist/not-found', `${thscode} is not on the watchlist`, { thscode })
      }
      return remaining
    })
  }

  /**
   * Replace the list order.
   * @param request - every entry's thscode in the new order.
   * @param signal - caller cancellation; the mutation is refused before it starts when the caller is gone.
   * @returns the complete list in its new order.
   */
  @Remote
  async reorder(request: WatchlistReorderRequest, signal: AbortSignal): Promise<readonly WatchlistEntry[]> {
    this.assertLive(signal)
    const wanted = request.thscodes.map(requireThscode)
    return await this.mutate(() => {
      const entries = this.current()
      const byKey = new Map(entries.map(entry => [entry.thscode, entry]))
      if (wanted.length !== entries.length || new Set(wanted).size !== wanted.length) {
        throw new RemoteError('gateway/bad-request', 'reorder must name every entry exactly once', {})
      }
      const reordered: WatchlistEntry[] = []
      for (const thscode of wanted) {
        const entry = byKey.get(thscode)
        if (entry === undefined) {
          throw new RemoteError('gateway/bad-request', `reorder names unknown entry "${thscode}"`, {})
        }
        reordered.push(entry)
      }
      return reordered
    })
  }

  /**
   * Refuse a call whose caller is already gone. The seam's symbol lookup and the
   * domain write are both non-cancellable, so cancellation is honored at the
   * entry point rather than pretending the work can be interrupted mid-flight.
   */
  private assertLive(signal: AbortSignal): void {
    const refusal = cancelled(signal)
    if (refusal !== undefined) throw refusal
  }

  /** Run one mutation on the serialized chain, publishing only what it durably stored. */
  private async mutate(
    step: () => readonly WatchlistEntry[] | Promise<readonly WatchlistEntry[]>,
  ): Promise<readonly WatchlistEntry[]> {
    const run = this.chain.then(step, step)
    this.chain = run.then(() => undefined, () => undefined)
    const entries = await run
    await this.requireGlobal().set({ entries: [...entries] })
    this.state = { entries: [...entries] }
    return this.snapshot()
  }

  /** Resolve one thscode to its display name through the seam's disambiguation. */
  private async resolveName(thscode: string): Promise<string> {
    let matches
    try {
      matches = await this.ctx.stock.resolveSymbols(thscode, { assetType: 'a-share', limit: 5 })
    } catch (error: unknown) {
      const reason = seamCodeOf(error)
      if (reason === undefined) throw error
      throw new RemoteError(
        'watchlist/lookup-failed',
        `resolving ${thscode} failed: ${reason}`,
        { thscode, reason },
        { cause: error },
      )
    }
    const exact = matches.find(match => match.thscode.toUpperCase() === thscode.toUpperCase())
    if (exact === undefined) {
      throw new RemoteError('watchlist/unknown-symbol', `no instrument matches "${thscode}"`, { thscode })
    }
    return exact.name
  }

  /** The stored entries, in order. */
  private current(): readonly WatchlistEntry[] {
    return this.requireState().entries.map(toEntry)
  }

  /** A copy of the current list, safe to hand across the wire. */
  private snapshot(): readonly WatchlistEntry[] {
    return this.current()
  }

  /** The opened global handle; a call before `init` resolved is a wiring mistake. */
  private requireGlobal(): DomainGlobal<WatchlistDomainState> {
    /* v8 ignore next 2 -- `[Service.init]` opens the domain before the service answers any call. */
    if (this.global === undefined) throw new Error('watchlist domain is not open')
    return this.global
  }

  /** The loaded state; a call before `init` resolved is a wiring mistake. */
  private requireState(): WatchlistDomainState {
    /* v8 ignore next 2 -- `[Service.init]` loads the state before the service answers any call. */
    if (this.state === undefined) throw new Error('watchlist domain is not open')
    return this.state
  }
}

export default WatchlistController
