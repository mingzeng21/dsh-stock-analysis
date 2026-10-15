/** Session-bound Conversation content shown inside the Agents main panel. */
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import css from './AgentsPanel.module.css'

function InquiryTargets({ useConversation, dashboardData, onFocus, t }: Pick<
  PropsRuntime<'stock-agents.conversation'> & PropsLocale<'stockAgents'>,
  'useConversation' | 'dashboardData' | 'onFocus' | 't'
>) {
  const response = useConversation((snapshot) => {
    const assistant = snapshot.views.get('chat')?.legacy.nodes.findLast(node => node.kind === 'assistant')
    return assistant?.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('') ?? ''
  }) ?? ''
  if (dashboardData === undefined || onFocus === undefined) return null
  const stocks = 'boards' in dashboardData
    ? dashboardData.boards.flatMap(board => board.stocks.map(stock => ({ code: stock.thscode, name: stock.name })))
    : dashboardData.constituents.map(stock => ({ code: stock.thscode, name: stock.name }))
  const mentioned = [...new Map(stocks.filter(stock => response.includes(stock.code) || response.includes(stock.name))
    .map(stock => [stock.code, stock])).values()].slice(0, 4)
  if (mentioned.length === 0) return null
  return <div className={css.inquiryTargets}>
    <span>{t('inquiry.related')}</span>
    {mentioned.map(stock => <button type="button" key={stock.code} onClick={() => { onFocus(stock.code) }}>{stock.name}</button>)}
  </div>
}

function AgentChatView({ renderSlot }: ConversationViewsProps) {
  return renderSlot('conversation.session', { view: 'chat' })
}

/** Render the selected Agent Session with the shared transcript and composer. */
export function AgentConversation({
  sessionId, useSession, useConversation, renderFactorySlot, dashboardData, onFocus, t,
}: PropsRuntime<'stock-agents.conversation'> & PropsRenderFactories & PropsLocale<'stockAgents'>) {
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  if (sessionId === undefined) return null
  const phase = session === undefined || conversation === undefined || session.openState === 'loading'
    ? 'settling' : 'active'
  return <>
    {renderFactorySlot('conversation.content', {
      variant: 'embedded', phase, hero: false,
    }, { slots: { views: AgentChatView } })}
    {dashboardData !== undefined && <InquiryTargets useConversation={useConversation} dashboardData={dashboardData}
      {...onFocus === undefined ? {} : { onFocus }} t={t} />}
  </>
}
