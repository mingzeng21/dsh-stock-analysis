/**
 * The watchlist domain declaration: the ordered list as one durable value.
 *
 * Order and records are two halves of one fact, so they are one document: the
 * global singleton holds the entries in display order. That makes every
 * mutation a single durable write, which is what removes the failure class a
 * separate order slot would introduce — there is no interleaving in which the
 * two could disagree, so no recovery marker and no load-time repair path is
 * needed.
 * @module @deepseek-ai/dsh-api-watchlist-controller/spec
 */

import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** Durable shape of one watchlist entry. */
export const watchlistRecord = z.object({
  thscode: z.string(),
  name: z.string(),
  addedAt: z.number(),
})

/** One stored watchlist entry, inferred from {@link watchlistRecord}. */
export type WatchlistRecord = z.infer<typeof watchlistRecord>

/** Durable list state: every entry, in display order. */
export const watchlistDomainState = z.object({
  entries: z.array(watchlistRecord),
})

/** Durable list state inferred from {@link watchlistDomainState}. */
export type WatchlistDomainState = z.infer<typeof watchlistDomainState>

/**
 * The watchlist domain spec. It declares no table: the list is always read and
 * written whole, so a keyed record table would add a second write without
 * adding a lookup any caller performs.
 */
export const watchlistDomainSpec = defineDomain({
  name: 'watchlist',
  version: 1,
  global: {
    schema: watchlistDomainState,
    initial: { entries: [] },
  },
  tables: {},
})
