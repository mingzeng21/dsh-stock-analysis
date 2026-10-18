/** Add a completed L1–L5 report to the reviewed Wiki workflow. */
import { useEffect, useState } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ResearchSnapshot } from '@deepseek-ai/dsh-api-research-controller/types'
import type { TurnTailChatData } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ResearchReportAction.module.css'

/** Session-bound data and import action for one completed report. */
export interface ResearchReportActionInjected {
  readonly sessionId: SessionId
  readonly hooks: { readonly library: ObservableSnapshot<ResearchSnapshot> }
  readonly keyedHooks: { readonly report: (turn: string) => ObservableSnapshot<readonly TurnTailChatData[]> }
  readonly ensureLoaded: () => Promise<void>
  readonly importReport: (turn: number, report: string, topic: string) => Promise<void>
}

/** Recognize the five required report sections, excluding ordinary follow-up answers. */
export function isCompleteResearchReport(text: string): boolean {
  const lines = text.split('\n').map(line => line.trim().replace(/^#{1,6}\s*/, '').replace(/^\*\*/, '').toUpperCase())
  return [1, 2, 3, 4, 5].every(level => lines.some(line =>
    line.startsWith(`L${level}`) && !/\d/.test(line.charAt(2))))
}

/** Show the import button only beside a complete report in its research Session. */
export function ResearchReportAction({ turn, sessionId, useLibrary, useReport, ensureLoaded, importReport, t }:
  PropsRuntime<'conversation.chat.turnTail'> & InjectFace<ResearchReportActionInjected> & PropsLocale<'research'>) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  const studies = useLibrary(state => state.studies)
  const data = useReport(String(turn.turn))?.at(-1)
  useEffect(() => { void ensureLoaded() }, [ensureLoaded])
  const study = studies.find(item => item.sessionId === sessionId)
  const closing = data?.closing
  const report = closing?.status === 'settled'
    ? closing.blocks.filter(block => block.kind === 'text').map(block => block.text).join('\n').trim()
    : ''
  if (study === undefined || !isCompleteResearchReport(report)) return null
  return <div className={css.root}>
    <button type="button" disabled={status === 'pending' || status === 'done'} onClick={() => {
      setStatus('pending')
      void importReport(turn.turn, report, study.title).then(() => { setStatus('done') }, () => { setStatus('error') })
    }}>{t(status === 'pending' ? 'report.importing' : 'report.import')}</button>
    {status === 'done' && <span role="status">{t('report.imported')}</span>}
    {status === 'error' && <span role="alert">{t('report.importError')}</span>}
  </div>
}
