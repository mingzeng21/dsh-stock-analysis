/**
 * Browser-facing vocabulary for the `watchlist` Remote namespace.
 * @module @deepseek-ai/dsh-api-watchlist-controller/types
 */

// Import the protocol module so the declaration at the end of this file
// augments its error map rather than defining an unrelated ambient module.
import type {} from '@deepseek-ai/dsh-typert-protocol'

/** One instrument on the list, as ordered by the Host. */
export interface WatchlistEntry {
  /** Complete thscode, e.g. `600519.SH`. */
  readonly thscode: string
  /** Display name resolved when the entry was added. */
  readonly name: string
  /** When the entry was added, in milliseconds since the Unix epoch. */
  readonly addedAt: number
}

/** One add request. */
export interface WatchlistAddRequest {
  /** Complete thscode; the Host resolves its display name before storing it. */
  readonly thscode: string
}

/** One remove request. */
export interface WatchlistRemoveRequest {
  /** Complete thscode of the entry to drop. */
  readonly thscode: string
}

/** One reorder request. */
export interface WatchlistReorderRequest {
  /** Every entry's thscode, in the order the list should take. */
  readonly thscodes: readonly string[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The instrument is already on the list. */
    'watchlist/duplicate': { readonly thscode: string }
    /** No list entry carries that thscode. */
    'watchlist/not-found': { readonly thscode: string }
    /** The stock seam resolved no instrument for that thscode. */
    'watchlist/unknown-symbol': { readonly thscode: string }
    /** The stock seam failed before the instrument could be resolved. */
    'watchlist/lookup-failed': { readonly thscode: string; readonly reason: string }
    /** The list already holds as many entries as this deployment allows. */
    'watchlist/limit-reached': { readonly maxEntries: number }
  }
}
