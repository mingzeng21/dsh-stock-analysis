// @vitest-environment jsdom
/**
 * The plugin body over a real SlotRegistry: the navigation row and the panel it
 * selects, the dictionary the row's label resolves through, the injected read
 * face, and fiber teardown proving both contributions are removed.
 */
import { Context } from '@deepseek-ai/cordis'
import type { IStockClient } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { IWatchlist, WatchlistEntry } from '@deepseek-ai/dsh-api-watchlist-controller/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import { apply as hostApply } from '../src/index.ts'
import { apply, inject, type WatchlistPanelInjected } from '../src/client/index.ts'
import { WatchlistPanelIcon } from '../src/client/PanelIcon.tsx'
import { WatchlistPanel } from '../src/client/WatchlistPanel.tsx'
import { AnalysisTranscript } from '../src/client/AnalysisTranscript.tsx'

const MAOTAI: WatchlistEntry = { thscode: '600519.SH', name: '贵州茅台', addedAt: 1 }

/** The session identity the scripted Host list reports. */
const SESSION = 'session-1' as SessionId

/** The durable list as a scripted Client model. */
function watchlistStub(initial: readonly WatchlistEntry[] = []): IWatchlist {
  const store = createSnapshotStore<readonly WatchlistEntry[]>(initial)
  return {
    entries: store,
    refresh: async () => store.getSnapshot(),
    add: async (thscode: string) => {
      if (thscode === '600519.SH') store.set([MAOTAI])
      return store.getSnapshot()
    },
    remove: async () => {
      store.set([])
      return store.getSnapshot()
    },
    reorder: async () => store.getSnapshot(),
  }
}

/** The market-data face as a scripted Client model. */
function stockStub(): IStockClient {
  return {
    searchSymbols: async () => [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }],
    quotes: async () => ({
      asOf: 1789560797000,
      quotes: [{
        thscode: '600519.SH',
        last: 1252.57,
        change: -4.55,
        changePct: -0.36,
        open: 1259,
        high: 1259.95,
        low: 1250.8,
        prevClose: 1257.12,
        volume: 2501689,
        turnover: 3135910000,
      }],
    }),
    candles: async ({ thscode, interval }) => ({
      thscode,
      interval,
      truncated: false,
      candles: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }],
    }),
    documents: async () => [],
  }
}

/** One scripted session face, for the send path. */
function sessionFace(answer: { ok: true } | { ok: false; code: string } = { ok: true }) {
  const beginSubmission = vi.fn(() => ({ requestId: 'request-1' }))
  const prompt = vi.fn(async () => (answer.ok
    ? { ok: true as const, value: { accepted: true as const } }
    : { ok: false as const, error: { code: answer.code } }))
  return { beginSubmission, prompt }
}

/** Boot the browser half over a slot tree declaring both seats it fills. */
async function bench(options: {
  readonly watchlist?: IWatchlist
  readonly stock?: IStockClient
  readonly sessions?: readonly string[]
  readonly face?: ReturnType<typeof sessionFace> | undefined
} = {}) {
  const watchlist = options.watchlist ?? watchlistStub([MAOTAI])
  const stock = options.stock ?? stockStub()
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.panellist': { kind: 'list', scope: 'root' },
      'main': { kind: 'keyed', scope: 'root' },
    },
  } as never, () => null)
  const create = vi.fn(async () => SESSION)
  const open = vi.fn()
  const selectPanel = vi.fn()
  const selectPreset = vi.fn(async () => ({ ok: true as const, value: undefined }))
  const binding = vi.fn(() => (options.face === undefined ? undefined : { session: options.face }))
  ctx.provide('watchlist', watchlist as never)
  ctx.provide('stockClient', stock as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('theme', { getTheme: () => ({ revision: 7 }) } as never)
  ctx.provide('layout', { selectPanel } as never)
  ctx.provide('sessions', {
    list: createSnapshotStore({
      ids: options.sessions ?? [],
      byId: {},
      current: undefined,
    }),
    create,
    open,
    binding,
  } as never)
  ctx.provide('remote', { agentPresets: { select: selectPreset } } as never)
  ctx.provide('remote.agentPresets', { select: selectPreset } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, watchlist, stock, create, open, selectPreset, selectPanel, binding }
}

/** The read face the panel entry injects. */
function injectedFace(ctx: Context): WatchlistPanelInjected {
  const entry = ctx.slots.entries('main')[0]
  return (entry?.inject as unknown as () => WatchlistPanelInjected)()
}

describe('ui-watchlist browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual([
      'watchlist', 'stockClient', 'theme', 'slots', 'locale', 'sessions', 'layout', 'remote', 'remote.agentPresets',
    ])
  })

  it('registers one navigation row and one panel, and fiber teardown removes both', async () => {
    const { ctx, fiber } = await bench()
    const row = ctx.slots.entries('sidebar.panellist')[0]
    expect(row?.component).toBe(WatchlistPanelIcon)
    expect(row?.options).toMatchObject({ id: 'watchlist', order: 10 })
    const panel = ctx.slots.entries('main')[0]
    expect(panel?.component).toBe(WatchlistPanel)
    expect(panel?.options.key).toBe('watchlist')
    const transcript = ctx.slots.entries('watchlist.analysis')[0]
    expect(transcript?.component).toBe(AnalysisTranscript)
    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(ctx.slots.entries('main')).toEqual([])
    expect(ctx.slots.entries('watchlist.analysis')).toEqual([])
  })

  it('resolves the row label from the plugin dictionary, following the active locale', async () => {
    const { ctx, fiber } = await bench()
    const label = ctx.slots.entries('sidebar.panellist')[0]?.options.label as () => string
    expect(typeof label).toBe('function')
    expect(label()).toBe('Watchlist')
    ctx.locale.setLocale('zh')
    expect(label()).toBe('自选股')
    await fiber.dispose()
  })

  it('reads the durable list and its quotes through the injected face', async () => {
    const { ctx, fiber } = await bench()
    const face = injectedFace(ctx)
    face.load()
    await vi.waitFor(() => { expect(face.hooks.quotes.getSnapshot().phase).toBe('ready') })
    expect(face.hooks.entries.getSnapshot()).toEqual([MAOTAI])
    expect(face.hooks.listState.getSnapshot()).toEqual({ phase: 'ready' })
    expect(face.hooks.quotes.getSnapshot().byCode['600519.SH']?.last).toBe(1252.57)
    expect(face.hooks.quotes.getSnapshot().asOf).toBe(1789560797000)
    await fiber.dispose()
  })

  it('publishes a failed list read as a code the surface can render', async () => {
    const failing: IWatchlist = {
      ...watchlistStub(),
      refresh: async () => { throw new RemoteError('gateway/internal', 'host down', {}) },
    }
    const { ctx, fiber } = await bench({ watchlist: failing })
    const face = injectedFace(ctx)
    face.load()
    await vi.waitFor(() => { expect(face.hooks.listState.getSnapshot().phase).toBe('failed') })
    const state = face.hooks.listState.getSnapshot()
    expect(state.phase === 'failed' ? state.failure : undefined).toBe('gateway/internal')
    await fiber.dispose()
  })

  it('reads a candle series and republishes the theme revision', async () => {
    const { ctx, fiber } = await bench()
    const face = injectedFace(ctx)
    expect(face.hooks.themeRevision.getSnapshot()).toBe(7)
    ctx.emit('theme/change', { revision: 9 } as never)
    expect(face.hooks.themeRevision.getSnapshot()).toBe(9)
    face.loadCandles('600519.SH', '1w', 1_000_000)
    await vi.waitFor(() => { expect(face.hooks.candles.getSnapshot().phase).toBe('ready') })
    expect(face.hooks.candles.getSnapshot()).toMatchObject({ interval: '1w', truncated: false })
    expect(face.hooks.candles.getSnapshot().bars).toHaveLength(1)
    await fiber.dispose()
  })

  it('reads a document channel through the injected face', async () => {
    const { ctx, fiber } = await bench()
    const face = injectedFace(ctx)
    expect(face.hooks.documents.getSnapshot()).toEqual({ phase: 'idle' })
    face.loadDocuments('贵州茅台', 'announcement')
    await vi.waitFor(() => { expect(face.hooks.documents.getSnapshot().phase).toBe('ready') })
    expect(face.hooks.documents.getSnapshot()).toMatchObject({ kind: 'announcement' })
    await fiber.dispose()
  })

  it('starts an analysis session, prompts it through its own echo, and opens it in the conversation', async () => {
    const face = sessionFace()
    const { ctx, fiber, create, open, selectPreset, selectPanel } = await bench({ face, sessions: [SESSION] })
    const injected = injectedFace(ctx)
    await expect(injected.startAnalysis()).resolves.toEqual({ ok: true, sessionId: SESSION })
    expect(create).toHaveBeenCalledWith({})
    expect(selectPreset).toHaveBeenCalledWith(SESSION, 'stock-analysis')
    expect(open).toHaveBeenCalledWith(SESSION)
    await expect(injected.sendAnalysis(SESSION, '当前标的：贵州茅台 600519.SH')).resolves.toEqual({
      ok: true,
      sessionId: 'session-1',
    })
    expect(face.beginSubmission).toHaveBeenCalledWith({
      mode: 'queue',
      text: '当前标的：贵州茅台 600519.SH',
      attachments: [],
    })
    expect(face.prompt).toHaveBeenCalledWith(
      [{ type: 'text', text: '当前标的：贵州茅台 600519.SH' }],
      'queue',
      undefined,
      'request-1',
    )
    expect(injected.resumeAnalysis(SESSION)).toBe(true)
    injected.openAnalysisInConversation(SESSION)
    expect(selectPanel).toHaveBeenCalledWith(null)
    await fiber.dispose()
  })

  it('reports a prompt that names no listed session', async () => {
    const { ctx, fiber } = await bench({ face: undefined })
    const injected = injectedFace(ctx)
    await expect(injected.sendAnalysis('session-9' as SessionId, '问题')).resolves.toEqual({
      ok: false,
      code: 'session/not-found',
    })
    expect(injected.resumeAnalysis('session-9' as SessionId)).toBe(false)
    await fiber.dispose()
  })

  it('reports the code a refused prompt carried', async () => {
    const { ctx, fiber } = await bench({ face: sessionFace({ ok: false, code: 'session/busy' }) })
    const injected = injectedFace(ctx)
    await expect(injected.sendAnalysis(SESSION, '问题')).resolves.toEqual({ ok: false, code: 'session/busy' })
    expect(injected.hooks.analysis.getSnapshot()).toEqual({ phase: 'failed', failure: 'session/busy' })
    await fiber.dispose()
  })

  it('answers add, remove, and search through the injected callbacks', async () => {
    const { ctx, fiber } = await bench({ watchlist: watchlistStub() })
    const face = injectedFace(ctx)
    await expect(face.searchInstruments('茅台')).resolves.toEqual({
      ok: true,
      matches: [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台' }],
    })
    await expect(face.addInstrument('600519.SH')).resolves.toEqual({ ok: true })
    await vi.waitFor(() => { expect(face.hooks.entries.getSnapshot()).toEqual([MAOTAI]) })
    await expect(face.removeInstrument('600519.SH')).resolves.toEqual({ ok: true })
    await vi.waitFor(() => { expect(face.hooks.entries.getSnapshot()).toEqual([]) })
    face.refreshQuotes()
    await vi.waitFor(() => { expect(face.hooks.quotes.getSnapshot()).toEqual({ phase: 'ready', byCode: {} }) })
    await fiber.dispose()
  })
})

describe('ui-watchlist node half', () => {
  it('contributes no host behavior', () => {
    expect(() => { hostApply() }).not.toThrow()
  })
})
