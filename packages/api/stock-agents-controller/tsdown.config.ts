import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-api-stock-agents-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
