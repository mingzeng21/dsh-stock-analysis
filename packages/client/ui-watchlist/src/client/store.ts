/**
 * Panel view state: which instrument the analysis side shows, which chart
 * period and document channel it shows for it, the list width, and the
 * analysis draft, session, and detail scroll position. It survives a tab
 * switch because the panel unmounts when another panel is selected.
 */
import type { CandleInterval, DocumentKind } from '@deepseek-ai/dsh-api-stock-controller/client'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Period the chart opens on, before the reader picks one. */
const DEFAULT_INTERVAL: CandleInterval = '1d'

/** Number of latest bars fitted into the chart, or the full returned series. */
export type ChartRange = 30 | 90 | 180 | 'all'

/** Document channel the list opens on, before the reader picks one. */
const DEFAULT_DOCUMENT_KIND: DocumentKind = 'report'

/** Initial width of the instrument list on a desktop panel. */
export const DEFAULT_RAIL_WIDTH = 264

interface WatchlistPanelState {
  /** Selected instrument's thscode, or null before anything is selected. */
  selected: string | null
  /** Period the chart draws; it survives a tab switch like the selection does. */
  interval: CandleInterval
  /** Preset viewport for the chart; the canvas still supports manual zoom and pan. */
  chartRange: ChartRange
  /** Document channel the list shows; it survives a tab switch too. */
  documentKind: DocumentKind
  /** Preferred list width, retained when the panel unmounts. */
  railWidth: number
  /**
   * The panel's analysis session, or null before one is started. One session
   * serves every instrument, and its identity outlives the panel because the
   * transcript binds to whichever session is current when the panel is open.
   */
  analysisSession: SessionId | null
  /** Unsent question retained when the panel unmounts. */
  analysisDraft: string
  /** Last position in the instrument detail. */
  detailScrollTop: number
}

type WatchlistPanelActions = {
  select: (draft: WatchlistPanelState, thscode: string | null) => void
  setInterval: (draft: WatchlistPanelState, interval: CandleInterval) => void
  setChartRange: (draft: WatchlistPanelState, range: ChartRange) => void
  setDocumentKind: (draft: WatchlistPanelState, kind: DocumentKind) => void
  setRailWidth: (draft: WatchlistPanelState, width: number) => void
  setAnalysisSession: (draft: WatchlistPanelState, sessionId: SessionId | null) => void
  setAnalysisDraft: (draft: WatchlistPanelState, text: string) => void
  setDetailScrollTop: (draft: WatchlistPanelState, top: number) => void
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
      chartRange: 90,
      documentKind: DEFAULT_DOCUMENT_KIND,
      railWidth: DEFAULT_RAIL_WIDTH,
      analysisSession: null,
      analysisDraft: '',
      detailScrollTop: 0,
    }),
    actions: {
      select: (draft, thscode) => {
        if (draft.selected !== thscode) draft.detailScrollTop = 0
        draft.selected = thscode
      },
      setInterval: (draft, interval) => { draft.interval = interval },
      setChartRange: (draft, range) => { draft.chartRange = range },
      setDocumentKind: (draft, kind) => { draft.documentKind = kind },
      setRailWidth: (draft, width) => { draft.railWidth = width },
      setAnalysisSession: (draft, sessionId) => { draft.analysisSession = sessionId },
      setAnalysisDraft: (draft, text) => { draft.analysisDraft = text },
      setDetailScrollTop: (draft, top) => { draft.detailScrollTop = top },
    },
  })
}
