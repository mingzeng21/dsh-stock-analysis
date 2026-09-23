import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-api-watchlist-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
