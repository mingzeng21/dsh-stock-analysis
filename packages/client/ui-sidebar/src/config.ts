/** Sidebar presentation choices set by the Web bundle. */
import z from '@deepseek-ai/schemastery'

/** Sidebar presentation configuration. */
export interface Config {
  /** Show only stock research navigation and move Session history into Conversation. */
  stockResearchHome: boolean
}

/** Validated sidebar presentation configuration. */
export const Config = z.object({
  stockResearchHome: z.boolean().default(false),
})
