/**
 * Web watchlist plugin, browser half: the global-panel row and the panel it
 * selects.
 *
 * The panel reads the durable list and market data through two injected client
 * services, so this plugin holds no transport of its own. Its analysis pane
 * drives one session over the shipped session service and renders that
 * session's transcript through a session-scoped child slot, which is the same
 * shape the Conversation uses for its own body. Every registration lives inside
 * one `ctx.effect`, and their lifetimes are the plugin's: unloading the plugin
 * removes the row, the panel, and the transcript together, which is what
 * returns the center column to the Conversation.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-stock-controller/client'
import type {} from '@deepseek-ai/dsh-api-watchlist-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { AnalysisSession, type AnalysisAck } from './analysis.ts'
import { AnalysisTranscript } from './AnalysisTranscript.tsx'
import { WatchlistSurface } from './controller.ts'
import { en, NS, zh, type WatchlistKey } from './locales.ts'
import { WatchlistPanelIcon } from './PanelIcon.tsx'
import { createWatchlistStore } from './store.ts'
import { WatchlistPanel, type WatchlistPanelInjected } from './WatchlistPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Watchlist panel copy. */
    'watchlist': WatchlistKey
  }

  interface SlotMap {
    /**
     * The analysis pane's transcript. Declared by the Watchlist entry and
     * occupied by this plugin's own body; `session`-scoped so the renderer
     * binds it to the current session and hands it `useChat`.
     */
    'watchlist.analysis': { kind: 'single'; scope: 'session' }
  }
}

export type { WatchlistPanelInjected, WatchlistPanelProps } from './WatchlistPanel.tsx'

/** Services required by the panel: the durable list, market data, theme, slots, locale, sessions, and layout. */
export const inject = [
  'watchlist', 'stockClient', 'theme', 'slots', 'locale', 'sessions', 'layout', 'remote', 'remote.agentPresets',
]

/** Sidebar row id and main-panel key; the two must agree for selection to resolve. */
const WATCHLIST_PANEL_ID = 'watchlist' as MainPanelId

/**
 * Send one question through a listed session's own face, carrying the local
 * submission echo so it appears before the Host's durable event does.
 * @param ctx - client root context.
 * @param sessionId - session to prompt.
 * @param text - prompt text, sent verbatim as one text block.
 * @returns acceptance, or the failure code the pane renders.
 */
async function promptSession(ctx: ClientContext, sessionId: SessionId, text: string): Promise<AnalysisAck> {
  const face = ctx.sessions.binding(sessionId)?.session
  if (face === undefined) return { ok: false, error: { code: 'session/not-found' } }
  const submission = face.beginSubmission({ mode: 'queue', text, attachments: [] })
  const result = await face.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
  return result.ok ? { ok: true } : { ok: false, error: { code: result.error.code } }
}

/**
 * Client plugin body: register the dictionaries, the navigation row, the
 * panel that row selects, and the analysis transcript inside it.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const surface = new WatchlistSurface(ctx.watchlist, ctx.stockClient)
  const store = createWatchlistStore()
  const analysis = new AnalysisSession({
    rows: () => ctx.sessions.list.getSnapshot(),
    create: target => ctx.sessions.create(target),
    selectPreset: (sessionId, presetId) => ctx.remote.agentPresets.select(sessionId, presetId),
    open: (sessionId) => { ctx.sessions.open(sessionId) },
    leavePanel: () => { ctx.layout.selectPanel(null) },
    prompt: (sessionId, text) => promptSession(ctx, sessionId, text),
  })
  // A canvas cannot follow a CSS variable, so the chart repaints when the theme
  // revision moves. The listener registers after ui-layout's presenter, which is
  // what guarantees the document already carries the new palette.
  const themeRevision = createSnapshotStore(ctx.theme.getTheme().revision)
  ctx.effect(() => {
    const off = ctx.on('theme/change', (snapshot) => { themeRevision.set(snapshot.revision) })
    return () => { off() }
  }, 'ui-watchlist: theme revision')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-watchlist: dictionaries')
  const t = ctx.locale.bind(NS)

  const injectProps = (): WatchlistPanelInjected => ({
    hooks: {
      entries: ctx.watchlist.entries,
      quotes: surface.quotes,
      listState: surface.list,
      candles: surface.candles,
      documents: surface.documents,
      analysis: analysis.state,
      themeRevision,
    },
    load: () => { void surface.load() },
    refreshQuotes: () => { void surface.refreshQuotes() },
    addInstrument: thscode => surface.add(thscode),
    removeInstrument: thscode => surface.remove(thscode),
    searchInstruments: query => surface.search(query),
    loadCandles: (thscode, interval, now) => { void surface.loadCandles(thscode, interval, now) },
    loadDocuments: (name, kind) => { void surface.loadDocuments(name, kind) },
    startAnalysis: () => analysis.start(),
    resumeAnalysis: sessionId => analysis.resume(sessionId),
    sendAnalysis: (sessionId, text) => analysis.send(sessionId, text),
    openAnalysisInConversation: (sessionId) => { analysis.openInConversation(sessionId) },
  })

  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: WATCHLIST_PANEL_ID,
    order: 10,
    label: () => t('panel.nav'),
  }, WatchlistPanelIcon))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: WATCHLIST_PANEL_ID,
    locale: NS,
    store,
    children: { 'watchlist.analysis': { kind: 'single', scope: 'session' } },
    inject: injectProps,
  }, WatchlistPanel))

  ctx.slots.inject('watchlist.analysis', () => ctx.slots.register({
    name: 'watchlist.analysis',
    locale: NS,
  }, AnalysisTranscript))
}
