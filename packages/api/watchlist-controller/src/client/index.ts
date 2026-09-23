/**
 * Browser half: the `watchlist` Client model over the `watchlist` Remote
 * namespace.
 *
 * The model owns the browser's projection of the Host list as one
 * observable snapshot, and every command publishes the complete list the Host
 * returned. There is no local merge rule: the Host list is the authority, a
 * command's result is that authority's new value, and a failed command leaves
 * the published value untouched.
 *
 * The model does not read on construction. A surface that needs the list calls
 * {@link IWatchlist.refresh}, so a failure to reach the Host is reported to the
 * surface that can render it rather than becoming an unobserved rejection.
 * @module @deepseek-ai/dsh-api-watchlist-controller/client
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
// Merges the generated `watchlist` namespace into the Client Remote face.
import type {} from '@deepseek-ai/dsh-api-watchlist-controller/remote'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult, TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { WatchlistEntry } from '../types.ts'

export type { WatchlistAddRequest, WatchlistEntry, WatchlistRemoveRequest, WatchlistReorderRequest } from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Browser projection and commands for the durable watchlist. */
    watchlist: IWatchlist
  }
}

/** The watchlist as a surface uses it: one observable list plus its commands. */
export interface IWatchlist {
  /** The Host list, replaced wholesale by every successful read or mutation. */
  readonly entries: ObservableSnapshot<readonly WatchlistEntry[]>
  /**
   * Read the Host list.
   * @returns the list the Host returned.
   */
  refresh(): Promise<readonly WatchlistEntry[]>
  /**
   * Resolve an instrument and append it.
   * @param thscode - complete thscode to add.
   * @returns the complete list after the addition.
   */
  add(thscode: string): Promise<readonly WatchlistEntry[]>
  /**
   * Drop one entry.
   * @param thscode - complete thscode to remove.
   * @returns the complete list after the removal.
   */
  remove(thscode: string): Promise<readonly WatchlistEntry[]>
  /**
   * Replace the list order.
   * @param thscodes - every entry's thscode in the new order.
   * @returns the complete list in its new order.
   */
  reorder(thscodes: readonly string[]): Promise<readonly WatchlistEntry[]>
}

/** Return a successful result's value, or throw the Gateway's failure unchanged. */
function unwrap<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw result.error
}

/** Required Client services: the Remote carrier and its generated namespace. */
export const inject = ['remote', 'remote.watchlist']

/** Browser projection and commands for the durable watchlist. */
export class WatchlistClient extends Service implements IWatchlist {
  private readonly store = createSnapshotStore<readonly WatchlistEntry[]>([])

  /** {@inheritDoc IWatchlist.entries} */
  readonly entries: ObservableSnapshot<readonly WatchlistEntry[]> = this.store

  /**
   * @param ctx - Client root context carrying the Remote face.
   * @param namespace - the `watchlist` namespace bound on this plugin's own
   * context: Cordis replaces `ctx` with the consumer's on a handed-out service,
   * so a method reading `this.ctx` answers to the consumer's injections.
   */
  constructor(ctx: Context, private readonly namespace: TypertRemoteNamespaceMap['watchlist']) {
    super(ctx, 'watchlist')
  }

  /** {@inheritDoc IWatchlist.refresh} */
  async refresh(): Promise<readonly WatchlistEntry[]> {
    return this.publish(unwrap(await this.namespace.list()))
  }

  /** {@inheritDoc IWatchlist.add} */
  async add(thscode: string): Promise<readonly WatchlistEntry[]> {
    return this.publish(unwrap(await this.namespace.add({ thscode })))
  }

  /** {@inheritDoc IWatchlist.remove} */
  async remove(thscode: string): Promise<readonly WatchlistEntry[]> {
    return this.publish(unwrap(await this.namespace.remove({ thscode })))
  }

  /** {@inheritDoc IWatchlist.reorder} */
  async reorder(thscodes: readonly string[]): Promise<readonly WatchlistEntry[]> {
    return this.publish(unwrap(await this.namespace.reorder({ thscodes: [...thscodes] })))
  }

  /** Publish one Host-authored list through the same source every reader holds. */
  private publish(entries: readonly WatchlistEntry[]): readonly WatchlistEntry[] {
    this.store.set(entries)
    return entries
  }
}

/**
 * Client plugin body: publish the model for this plugin's lifetime.
 * @param ctx - Client root context.
 */
export function apply(ctx: Context): void {
  new WatchlistClient(ctx, ctx.remote.watchlist)
}
