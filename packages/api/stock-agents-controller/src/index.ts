/** Host catalog and durable identity for bundled stock research skills. */

import { resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import { renderSkillContent, type SkillDefinition } from '@deepseek-ai/dsh-skill'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session-projection'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { StockAgentCard, StockAgentRecord } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the stock Agents catalog Remote namespace. */
    stockAgentsController: StockAgentsController
    /** Shipped skill root supplied by the Web startup plugin. */
    stockAgentSkillDir: string
  }
}

const localeText = z.object({ zh: z.string().min(1), en: z.string().min(1) })
const cardSchema = z.object({
  title: localeText,
  summary: localeText,
  launch: z.enum(['query', 'immediate']),
  examples: z.object({ zh: z.array(z.string()), en: z.array(z.string()) }).optional(),
  prompt: localeText.optional(),
}).superRefine((card, issue) => {
  if (card.launch === 'immediate' && card.prompt === undefined) {
    issue.addIssue({ code: 'custom', message: 'immediate stock Agent requires prompt' })
  }
})
const recordSchema = z.object({ name: z.string(), query: z.string() })
const stateSchema = z.object({ record: recordSchema.nullable(), firstPrompt: z.string() })

/** Extract the first text block of a human prompt. */
function firstText(content: UserMessage['content']): string {
  return content.find(block => block.type === 'text')?.text ?? ''
}

/**
 * Fold a committed user message into the specialist identity.
 * @param state - identity accumulated before this message.
 * @param message - committed user or skill instruction message.
 * @returns the updated projection state.
 */
export function advanceStockAgent(
  state: z.infer<typeof stateSchema>,
  message: UserMessage,
): z.infer<typeof stateSchema> {
  if (state.record !== null) return state
  if (message.source.kind === 'user') {
    return { ...state, firstPrompt: firstText(message.content) }
  }
  if (message.source.kind !== 'skill-invocation') return state
  const name = message.source.name
  if (!name.startsWith('stock-')) return state
  const query = state.firstPrompt.replace(new RegExp(`^/${name}(?:\\s+|$)`), '').trim()
  return { ...state, record: { name, query } }
}

/** Stable projection from committed Session messages to specialist identity. */
export const stockAgentProjection = {
  key: 'stockAgent',
  stateVersion: 1,
  stateSchema,
  init: () => ({ record: null, firstPrompt: '' }),
  apply: (state: z.infer<typeof stateSchema>, event: import('@deepseek-ai/dsh-session').SessionEvent) =>
    event.type === 'user/message' ? advanceStockAgent(state, event.data) : state,
  wire: { viewSchema: recordSchema.nullable(), view: (state: z.infer<typeof stateSchema>) => state.record },
} as const

/**
 * Load the latest specialist instructions before each follow-up step.
 * @param decision - proposed step from earlier listeners.
 * @param record - specialist identity stored in the Session.
 * @param loadSkill - scoped read of the current skill definition.
 * @returns a step with logged instructions or a rejection if the skill is missing.
 */
export async function continueStockAgent(
  decision: PreStepDecision,
  record: StockAgentRecord | null | undefined,
  loadSkill: (name: string) => Promise<Pick<SkillDefinition, 'name' | 'provider' | 'resourceBase' | 'content'> | undefined>,
): Promise<PreStepDecision> {
  if (decision.kind === 'reject' || record === undefined || record === null) return decision
  if (decision.messages.some(message => message.source.kind === 'skill-invocation' && message.source.name === record.name)) {
    return decision
  }
  const skill = await loadSkill(record.name)
  if (skill === undefined) return { kind: 'reject' }
  return {
    ...decision,
    messages: [...decision.messages, createUserMessage({
      content: [{ type: 'text', text: renderSkillContent(skill) }],
      source: { kind: 'skill-invocation', name: record.name, form: 'instructions' },
    })],
  }
}

/** Catalog over skills mounted by the stock-analysis preset. */
export class StockAgentsController extends TypertRemoteService {
  static inject = ['agentPresets', 'skills', 'sessionProjections', 'stockAgentSkillDir']

  /** @param ctx - Host services and bundled skill root. */
  constructor(ctx: Context) {
    super(ctx, 'stockAgentsController', { namespace: 'stockAgents' })
    ctx.sessionProjections.register(stockAgentProjection)
    ctx.on('agent/pre-step', async ({ agent, signal }, next): Promise<PreStepDecision> => {
      const decision = await next()
      const record = ctx.sessionProjections.stateOf(agent.session, 'stockAgent')?.record
      return continueStockAgent(decision, record,
        name => ctx.skills.get(name, { cwd: agent.session.header.cwd, scope: agent, signal }))
    })
  }

  /**
   * Read marked bundled skills without loading their instruction bodies.
   * @returns cards for the current stock preset.
   */
  @Remote
  async list(): Promise<readonly StockAgentCard[]> {
    await using lease = await this.ctx.agentPresets.acquireScope('stock-analysis')
    const skills = await this.ctx.skills.list({ scope: lease.key, cwd: process.cwd() })
    const root = resolve(this.ctx.stockAgentSkillDir) + sep
    return skills.flatMap((skill) => {
      if (skill.path === undefined || !resolve(skill.path).startsWith(root)) return []
      const parsed = cardSchema.safeParse(skill.metadata?.stockAgent)
      if (!parsed.success) throw new Error(`Invalid stock Agent metadata in ${skill.path}: ${parsed.error.message}`)
      const { title, summary, launch, examples, prompt } = parsed.data
      return [{ name: skill.name, title, summary, launch,
        ...examples === undefined ? {} : { examples },
        ...prompt === undefined ? {} : { prompt },
      }]
    })
  }
}

export default StockAgentsController
