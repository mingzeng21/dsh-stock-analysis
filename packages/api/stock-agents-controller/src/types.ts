/** Browser-safe stock Agent card and Session identity. */
import type {} from '@deepseek-ai/dsh-session-projection/types'

/** Card metadata supplied by a bundled SKILL.md. */
export interface StockAgentCard {
  readonly name: string
  readonly title: Readonly<Record<'zh' | 'en', string>>
  readonly summary: Readonly<Record<'zh' | 'en', string>>
  readonly launch: 'query' | 'immediate'
  readonly queryInput?: Readonly<{ label: Readonly<Record<'zh' | 'en', string>>; kind: 'text' | 'textarea' }>
  readonly examples?: Readonly<Record<'zh' | 'en', readonly string[]>>
  readonly prompt?: Readonly<Record<'zh' | 'en', string>>
}

/** Durable specialist identity extracted from a dashboard question or explicit skill invocation. */
export interface StockAgentRecord {
  readonly name: string
  readonly query: string
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    stockAgent: { readonly record: StockAgentRecord | null; readonly firstPrompt: string }
  }
  interface SessionProjectionMap {
    stockAgent: StockAgentRecord | null
  }
}
