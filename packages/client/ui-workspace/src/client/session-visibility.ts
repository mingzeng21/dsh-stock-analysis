import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'

/** Determine whether a Session belongs in ordinary Conversation navigation.
 * @param session - Session metadata and registered projection values.
 * @returns true when ordinary Conversation navigation may display the Session.
 */
export function isConversationSession(session: SessionSummary): boolean {
  return session.origin !== 'subagent' && !isStockAgentSession(session)
}

/** A non-null stockAgent projection marks a Session as an Agents record. */
function isStockAgentSession(session: SessionSummary): boolean {
  return Object.entries(session.projectionValues ?? {}).some(([key, value]) =>
    key === 'stockAgent' && value !== null && value !== undefined)
}
