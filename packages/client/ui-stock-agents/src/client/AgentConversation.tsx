/** Session-bound Conversation content shown inside the Agents main panel. */
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

function AgentChatView({ renderSlot }: ConversationViewsProps) {
  return renderSlot('conversation.session', { view: 'chat' })
}

/** Render the selected Agent Session with the shared transcript and composer. */
export function AgentConversation({
  sessionId, useSession, useConversation, renderFactorySlot,
}: PropsRuntime<'stock-agents.conversation'> & PropsRenderFactories) {
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  if (sessionId === undefined) return null
  const phase = session === undefined || conversation === undefined || session.openState === 'loading'
    ? 'settling' : 'active'
  return renderFactorySlot('conversation.content', {
    variant: 'embedded', phase, hero: false,
  }, { slots: { views: AgentChatView } })
}
