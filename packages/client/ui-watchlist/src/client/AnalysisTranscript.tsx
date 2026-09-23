/**
 * The analysis pane's compact transcript.
 *
 * It renders the bounded prompt and response previews the session's Chat target
 * already publishes for its navigation rail — the widest projection of a turn
 * that is still plain text — so a panel can show the thread without importing
 * another feature plugin's node renderers, which the client layering forbids.
 */
import type { ChatSnapshot, TurnNavigationItem } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WatchlistPanel.module.css'

/** Composed props of the `watchlist.analysis` entry: the session seat and locale. */
export type AnalysisTranscriptProps = PropsRuntime<'watchlist.analysis'> & PropsLocale<'watchlist'>

/**
 * Render the loaded turns of the bound session.
 * @param props - composed slot props (session seat, `useChat`, locale).
 * @returns the transcript element tree.
 */
export function AnalysisTranscript({ useChat, t }: AnalysisTranscriptProps) {
  const items = useChat((snapshot: ChatSnapshot): readonly TurnNavigationItem[] => snapshot.navigation.items())
  if (items.length === 0) return <p className={css.note}>{t('analysis.empty')}</p>
  return (
    <ol className={css.turns} aria-label={t('analysis.transcript')}>
      {items.map(item => (
        <li key={item.anchorKey} className={css.turn}>
          <p className={css.turnPrompt}>{item.prompt}</p>
          {item.response !== '' && <p className={css.turnResponse}>{item.response}</p>}
        </li>
      ))}
    </ol>
  )
}
