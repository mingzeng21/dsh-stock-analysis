/** Session-bound Conversation content shown inside the Agents main panel. */
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import css from './AgentsPanel.module.css'

function InquiryTargets({ response, dashboardData, onFocus, t }: Pick<
  PropsRuntime<'stock-agents.conversation'> & PropsLocale<'stockAgents'>,
  'dashboardData' | 'onFocus' | 't'
> & { response: string }) {
  if (dashboardData === undefined || onFocus === undefined) return null
  const stocks = 'boards' in dashboardData
    ? dashboardData.boards.flatMap(board => board.stocks.map(stock => ({ code: stock.thscode, name: stock.name })))
    : 'constituents' in dashboardData
      ? dashboardData.constituents.map(stock => ({ code: stock.thscode, name: stock.name }))
      : dashboardData.days.flatMap(day => day.stocks.map(stock => ({ code: stock.thscode, name: stock.name })))
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
  sessionId, useSession, useConversation, renderFactorySlot, dashboardData, onFocus, suggestions, onSuggest, t,
}: PropsRuntime<'stock-agents.conversation'> & PropsRenderFactories & PropsLocale<'stockAgents'>) {
  const session = useSession(value => value)
  const conversation = useConversation(value => value)
  const response = useConversation((snapshot) => {
    const assistant = snapshot.views.get('chat')?.legacy.nodes.findLast(node => node.kind === 'assistant')
    return assistant?.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('') ?? ''
  }) ?? ''
  if (sessionId === undefined) return null
  const phase = session === undefined || conversation === undefined || session.openState === 'loading'
    ? 'settling' : 'active'
  return <>
    {renderFactorySlot('conversation.content', {
      variant: 'embedded', phase, hero: false,
    }, { slots: { views: AgentChatView } })}
    {dashboardData !== undefined && <InquiryTargets response={response} dashboardData={dashboardData}
      {...onFocus === undefined ? {} : { onFocus }} t={t} />}
    {dashboardData !== undefined && session?.running === false && response !== ''
      && suggestions !== undefined && onSuggest !== undefined && <div className={css.inquirySuggestions}>
      <span>{t('inquiry.followups')}</span>
      {suggestions.map(question => <button type="button" key={question}
        onClick={() => { onSuggest(question) }}>{question}</button>)}
    </div>}
  </>
}
