/**
 * Panel view state: which instrument the analysis side shows, which chart
 * period and document channel it shows for it, and the analysis session it
 * asks. It survives a tab switch because the panel unmounts when another panel
 * or the Conversation is selected, and coming back to the instrument and the
 * thread you were reading is the point.
 */
import type { CandleInterval, DocumentKind } from '@deepseek-ai/dsh-api-stock-controller/client'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Period the chart opens on, before the reader picks one. */
const DEFAULT_INTERVAL: CandleInterval = '1d'

/** Document channel the list opens on, before the reader picks one. */
const DEFAULT_DOCUMENT_KIND: DocumentKind = 'report'

interface WatchlistPanelState {
  /** Selected instrument's thscode, or null before anything is selected. */
  selected: string | null
  /** Period the chart draws; it survives a tab switch like the selection does. */
  interval: CandleInterval
  /** Document channel the list shows; it survives a tab switch too. */
  documentKind: DocumentKind
  /**
   * The panel's analysis session, or null before one is started. One session
   * serves every instrument, and its identity outlives the panel because the
   * transcript binds to whichever session is current when the panel is open.
   */
  analysisSession: SessionId | null
}

type WatchlistPanelActions = {
  select: (draft: WatchlistPanelState, thscode: string | null) => void
  setInterval: (draft: WatchlistPanelState, interval: CandleInterval) => void
  setDocumentKind: (draft: WatchlistPanelState, kind: DocumentKind) => void
  setAnalysisSession: (draft: WatchlistPanelState, sessionId: SessionId | null) => void
}

/**
 * Declare the watchlist panel's view store.
 * @returns a non-persisted store handle whose instance the Slot registry owns.
 */
export function createWatchlistStore(): EngineStoreHandle<WatchlistPanelState, WatchlistPanelActions> {
  return defineStore({
    init: (): WatchlistPanelState => ({
      selected: null,
      interval: DEFAULT_INTERVAL,
      documentKind: DEFAULT_DOCUMENT_KIND,
      analysisSession: null,
    }),
    actions: {
      select: (draft, thscode) => { draft.selected = thscode },
      setInterval: (draft, interval) => { draft.interval = interval },
      setDocumentKind: (draft, kind) => { draft.documentKind = kind },
      setAnalysisSession: (draft, sessionId) => { draft.analysisSession = sessionId },
    },
  })
}
