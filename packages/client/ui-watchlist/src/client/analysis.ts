/**
 * The panel's analysis session.
 *
 * One session serves every instrument: it is created on the first question,
 * composed from the shipped `stock-analysis` preset, and remembered by the
 * panel store, so browsing the list never creates a session and a follow-up
 * question keeps its thread. The selected instrument travels in the prompt
 * itself, which the panel formats from its own dictionary.
 *
 * The object is React-free and reaches the Host only through its ports, so the
 * order of creation, preset selection, and selection is testable without a
 * Cordis context.
 * @module @deepseek-ai/dsh-client-ui-watchlist/analysis
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { failureCode } from './failures.ts'

/** The preset a panel-created analysis session is composed from. */
export const ANALYSIS_PRESET = 'stock-analysis'

/** The session rows the analysis pane reads from the Host list. */
export interface AnalysisSessionRows {
  /** Host-list order; analysed by the workspace fallback in that order. */
  readonly ids: readonly SessionId[]
  /** Rows by identity; a listed id is always present. */
  readonly byId: Readonly<Record<SessionId, { readonly cwd?: string }>>
  /** Currently selected session, when one is. */
  readonly current: SessionId | undefined
}

/** A Host answer whose only interesting part here is whether it was accepted. */
export type AnalysisAck =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly code: string } }

/** Host effects the analysis session drives. */
export interface AnalysisPorts {
  /** The Host's current session rows. */
  readonly rows: () => AnalysisSessionRows
  /** Create a session, targeting an existing session's directory when there is one. */
  readonly create: (target: { readonly cwd?: string }) => Promise<SessionId>
  /** Compose a blank session from the analysis preset. */
  readonly selectPreset: (sessionId: SessionId, presetId: string) => Promise<AnalysisAck>
  /** Make a session current. */
  readonly open: (sessionId: SessionId) => void
  /** Return to the full conversation surface. */
  readonly leavePanel: () => void
  /** Send one text prompt into a listed session, through that session's own echo. */
  readonly prompt: (sessionId: SessionId, text: string) => Promise<AnalysisAck>
}

/** Published phase of the analysis pane's own work. */
export type AnalysisState =
  | { readonly phase: 'idle' | 'starting' | 'sending' }
  | { readonly phase: 'failed'; readonly failure: string }

/** Outcome of starting or sending. */
export type AnalysisOutcome =
  | { readonly ok: true; readonly sessionId: SessionId }
  | { readonly ok: false; readonly code: string }

/** The panel's analysis session and the phase of the work it drives. */
export class AnalysisSession {
  private readonly store = createSnapshotStore<AnalysisState>({ phase: 'idle' })

  /** Phase of the pane's own work; a failure carries the code the pane renders. */
  readonly state: ObservableSnapshot<AnalysisState> = this.store

  /**
   * @param ports - Host effects the session drives.
   */
  constructor(private readonly ports: AnalysisPorts) {}

  /**
   * Create the panel's analysis session, compose it from the preset, and make
   * it current. The preset is selected while the session is still blank: the
   * Host refuses a composition swap once history exists.
   * @returns the new session identity, or the failure code the pane renders.
   */
  async start(): Promise<AnalysisOutcome> {
    this.store.set({ phase: 'starting' })
    let sessionId: SessionId
    try {
      sessionId = await this.ports.create(this.workspaceTarget())
    } catch (error: unknown) {
      return this.failed(error)
    }
    let selected: AnalysisAck
    try {
      selected = await this.ports.selectPreset(sessionId, ANALYSIS_PRESET)
    } catch (error: unknown) {
      return this.failed(error)
    }
    if (!selected.ok) return this.failed(selected.error)
    this.ports.open(sessionId)
    this.store.set({ phase: 'idle' })
    return { ok: true, sessionId }
  }

  /**
   * Send one question to a session this pane owns.
   * @param sessionId - the panel's analysis session.
   * @param text - prompt text, already carrying the instrument context.
   * @returns acceptance, or the failure code the pane renders.
   */
  async send(sessionId: SessionId, text: string): Promise<AnalysisOutcome> {
    this.store.set({ phase: 'sending' })
    let sent: AnalysisAck
    try {
      sent = await this.ports.prompt(sessionId, text)
    } catch (error: unknown) {
      return this.failed(error)
    }
    if (!sent.ok) return this.failed(sent.error)
    this.store.set({ phase: 'idle' })
    return { ok: true, sessionId }
  }

  /**
   * Make a recorded session current again so the transcript binds to it.
   * @param sessionId - the identity the panel store recorded.
   * @returns whether the Host still lists that session.
   */
  resume(sessionId: SessionId): boolean {
    if (!this.ports.rows().ids.includes(sessionId)) return false
    this.ports.open(sessionId)
    return true
  }

  /**
   * Continue this analysis in the full conversation surface.
   * @param sessionId - the panel's analysis session.
   */
  openInConversation(sessionId: SessionId): void {
    this.ports.open(sessionId)
    this.ports.leavePanel()
  }

  /**
   * The directory a new analysis session targets: the current session's own
   * directory, then the most recently listed one, matching how the sidebar's
   * New Session resolves a workspace. Both absent means the Host default.
   * @returns the creation target.
   */
  private workspaceTarget(): { readonly cwd?: string } {
    const rows = this.ports.rows()
    const current = rows.current
    const cwd = current === undefined ? undefined : rows.byId[current]?.cwd
    if (cwd !== undefined) return { cwd }
    for (const id of rows.ids) {
      const candidate = rows.byId[id]?.cwd
      if (candidate !== undefined) return { cwd: candidate }
    }
    return {}
  }

  /** Publish one failure and report it to the caller. */
  private failed(error: unknown): AnalysisOutcome {
    const code = failureCode(error)
    this.store.set({ phase: 'failed', failure: code })
    return { ok: false, code }
  }
}
