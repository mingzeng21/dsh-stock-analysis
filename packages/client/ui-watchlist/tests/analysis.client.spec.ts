/**
 * The analysis session driver: the order it creates, composes, and selects a
 * session in, the directory it targets, and the phase it publishes while the
 * work is in flight or after it failed.
 */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { ANALYSIS_PRESET, AnalysisSession, type AnalysisPorts, type AnalysisSessionRows } from '../src/client/analysis.ts'

const SESSION = 'session-1' as SessionId

/** Rows as the Host list reports them, overridable per test. */
function rows(overrides: Partial<AnalysisSessionRows> = {}): AnalysisSessionRows {
  return { ids: [], byId: {}, current: undefined, ...overrides }
}

/** Ports with every effect scripted, overridable per test. */
function ports(overrides: Partial<AnalysisPorts> = {}) {
  const create = vi.fn(async () => SESSION)
  const selectPreset = vi.fn(async () => ({ ok: true as const }))
  const open = vi.fn(async () => {})
  const openInConversation = vi.fn()
  const prompt = vi.fn(async () => ({ ok: true as const }))
  const all: AnalysisPorts = {
    rows: () => rows(),
    create,
    selectPreset,
    open,
    openInConversation,
    prompt,
    ...overrides,
  }
  return { all, create, selectPreset, open, openInConversation, prompt }
}

describe('AnalysisSession.start', () => {
  it('creates a session, composes it from the analysis preset, and retains it for the panel', async () => {
    const { all, create, selectPreset, open } = ports()
    const analysis = new AnalysisSession(all)
    await expect(analysis.start()).resolves.toEqual({ ok: true, sessionId: SESSION })
    expect(create).toHaveBeenCalledWith({})
    expect(selectPreset).toHaveBeenCalledWith(SESSION, ANALYSIS_PRESET)
    expect(open).toHaveBeenCalledWith(SESSION)
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'idle' })
  })

  it('targets the directory the current session uses', async () => {
    const { all, create } = ports({
      rows: () => rows({ ids: [SESSION], byId: { [SESSION]: { cwd: '/work/b' } }, current: SESSION }),
    })
    await new AnalysisSession(all).start()
    expect(create).toHaveBeenCalledWith({ cwd: '/work/b' })
  })

  it('falls back to the most recently listed directory when nothing is current', async () => {
    const other = 'session-2' as SessionId
    const { all, create } = ports({
      rows: () => rows({ ids: [other, SESSION], byId: { [other]: { cwd: '/work/a' } } }),
    })
    await new AnalysisSession(all).start()
    expect(create).toHaveBeenCalledWith({ cwd: '/work/a' })
  })

  it('creates against the Host default when no listed session has a directory', async () => {
    const { all, create } = ports({
      rows: () => rows({ ids: [SESSION], byId: { [SESSION]: {} }, current: SESSION }),
    })
    await new AnalysisSession(all).start()
    expect(create).toHaveBeenCalledWith({})
  })

  it('publishes an uncoded creation failure as unknown', async () => {
    const { all } = ports({ create: async () => { throw new Error('offline') } })
    const analysis = new AnalysisSession(all)
    await expect(analysis.start()).resolves.toEqual({ ok: false, code: 'unknown' })
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'failed', failure: 'unknown' })
  })

  it('publishes a refused preset selection as the code it carried', async () => {
    const { all, open } = ports({
      selectPreset: async () => ({ ok: false, error: { code: 'gateway/not-found' } }),
    })
    const analysis = new AnalysisSession(all)
    await expect(analysis.start()).resolves.toEqual({ ok: false, code: 'gateway/not-found' })
    expect(open).not.toHaveBeenCalled()
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'failed', failure: 'gateway/not-found' })
  })

  it('publishes a preset selection that threw as its Remote code', async () => {
    const { all } = ports({
      selectPreset: async () => {
        throw new RemoteError('gateway/internal', 'roster unavailable', {})
      },
    })
    await expect(new AnalysisSession(all).start()).resolves.toEqual({ ok: false, code: 'gateway/internal' })
  })

  it('publishes a retention that threw as its Remote code', async () => {
    const { all } = ports({
      open: async () => {
        throw new RemoteError('gateway/internal', 'retain unavailable', {})
      },
    })
    const analysis = new AnalysisSession(all)
    await expect(analysis.start()).resolves.toEqual({ ok: false, code: 'gateway/internal' })
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'failed', failure: 'gateway/internal' })
  })
})

describe('AnalysisSession.send', () => {
  it('sends through the session port and settles back to idle', async () => {
    const { all, prompt } = ports()
    const analysis = new AnalysisSession(all)
    await expect(analysis.send(SESSION, '问题')).resolves.toEqual({ ok: true, sessionId: SESSION })
    expect(prompt).toHaveBeenCalledWith(SESSION, '问题')
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'idle' })
  })

  it('publishes a refused prompt as the code it carried', async () => {
    const { all } = ports({ prompt: async () => ({ ok: false, error: { code: 'session/busy' } }) })
    const analysis = new AnalysisSession(all)
    await expect(analysis.send(SESSION, '问题')).resolves.toEqual({ ok: false, code: 'session/busy' })
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'failed', failure: 'session/busy' })
  })

  it('publishes a send that could not reach the Host as unknown', async () => {
    const { all } = ports({ prompt: async () => { throw new Error('carrier closed') } })
    const analysis = new AnalysisSession(all)
    await expect(analysis.send(SESSION, '问题')).resolves.toEqual({ ok: false, code: 'unknown' })
  })
})

describe('AnalysisSession selection', () => {
  it('retains a listed session for its transcript', async () => {
    const { all, open } = ports({ rows: () => rows({ ids: [SESSION], byId: { [SESSION]: {} } }) })
    await expect(new AnalysisSession(all).resume(SESSION)).resolves.toBe(true)
    expect(open).toHaveBeenCalledWith(SESSION)
  })

  it('reports a recorded session the Host no longer lists', async () => {
    const { all, open } = ports()
    await expect(new AnalysisSession(all).resume(SESSION)).resolves.toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('reports a retention that failed while resuming', async () => {
    const { all } = ports({
      rows: () => rows({ ids: [SESSION], byId: { [SESSION]: {} } }),
      open: async () => {
        throw new RemoteError('gateway/internal', 'retain unavailable', {})
      },
    })
    const analysis = new AnalysisSession(all)
    await expect(analysis.resume(SESSION)).resolves.toBe(false)
    expect(analysis.state.getSnapshot()).toEqual({ phase: 'failed', failure: 'gateway/internal' })
  })

  it('opens the analysis in the conversation surface', () => {
    const { all, open, openInConversation } = ports()
    new AnalysisSession(all).openInConversation(SESSION)
    expect(open).not.toHaveBeenCalled()
    expect(openInConversation).toHaveBeenCalledWith(SESSION)
  })
})
