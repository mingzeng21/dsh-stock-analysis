/** Durable research operations over the real domain facility and memory medium. */
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import ResearchController from '../src/index.ts'

const SIGNAL = new AbortController().signal
const CONFIG = { maxFileBytes: 5_000_000, maxTextChars: 100_000, maxPages: 500, maxSources: 200 }
const disposals: Array<() => Promise<void>> = []

afterEach(async () => {
  while (disposals.length > 0) await disposals.pop()?.()
})

/** Boot the production controller against an isolated domain backend. */
async function boot(pool: MemoryMediaPool) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  let fileBytes = new Uint8Array()
  ctx.provide('attachments', {
    saveFile: async ({ data, name }: { data: Uint8Array; name?: string }) => {
      fileBytes = new Uint8Array(data)
      return { attachmentId: 'sha256:test', name: name ?? 'source.bin', bytes: data.byteLength }
    },
    readFileStream: async function* () { yield fileBytes },
  } as never)
  const fiber = await ctx.plugin(ResearchController, CONFIG)
  disposals.push(() => fiber.dispose())
  return ctx.researchController
}

describe('personal research library', () => {
  it('keeps original text and page revisions across a Host restart', async () => {
    const pool = new MemoryMediaPool()
    const first = await boot(pool)
    const withSource = await first.addSource({ title: '年度报告', text: '报告原文', publishedAt: '2026-03-30' }, SIGNAL)
    const source = withSource.sources[0]
    expect(source?.text).toBe('报告原文')
    if (source === undefined) throw new Error('missing source')
    const withPage = await first.savePage({
      kind: 'entity', title: '示例公司', summary: '初稿', markdown: '# 示例公司\n初稿', sourceIds: [source.id], links: [],
    }, SIGNAL)
    const page = withPage.pages[0]
    if (page === undefined) throw new Error('missing page')
    const updated = await first.savePage({
      id: page.id, expectedRevision: 1, kind: 'entity', title: page.title, summary: '更新',
      markdown: '# 示例公司\n更新', sourceIds: [source.id], links: [],
    }, SIGNAL)
    expect(updated.history).toMatchObject([{ id: page.id, revision: 1, markdown: '# 示例公司\n初稿' }])
    await disposals.pop()?.()
    const second = await boot(pool)
    const restored = await second.snapshot(SIGNAL)
    expect(restored.sources).toMatchObject([{ title: '年度报告', text: '报告原文' }])
    expect(restored.pages).toMatchObject([{ title: '示例公司', revision: 2 }])
    expect(restored.activity).toHaveLength(3)
    const reverted = await second.restorePage(page.id, 1, SIGNAL)
    expect(reverted.pages[0]).toMatchObject({ revision: 3, markdown: '# 示例公司\n初稿' })
    expect(reverted.history).toHaveLength(2)
  })

  it('keeps model edits pending and refuses a stale proposal after a page changes', async () => {
    const controller = await boot(new MemoryMediaPool())
    const initial = await controller.savePage({
      kind: 'topic', title: '产业链', summary: '', markdown: '# 产业链', sourceIds: [], links: [],
    }, SIGNAL)
    const page = initial.pages[0]
    if (page === undefined) throw new Error('missing page')
    const proposed = await controller.propose({
      id: page.id, kind: 'topic', title: page.title, summary: '提案', markdown: '# 新判断', sourceIds: [], links: [],
    })
    expect(proposed.pages[0]?.markdown).toBe('# 产业链')
    const proposal = proposed.proposals[0]
    if (proposal === undefined) throw new Error('missing proposal')
    await controller.savePage({
      id: page.id, expectedRevision: 1, kind: 'topic', title: page.title, summary: '',
      markdown: '# 人工更新', sourceIds: [], links: [],
    }, SIGNAL)
    await expect(controller.acceptProposal(proposal.id, SIGNAL)).rejects.toMatchObject({ code: 'research/conflict' })
    expect((await controller.snapshot(SIGNAL)).pages[0]?.markdown).toBe('# 人工更新')
  })

  it('stores and reads an original file byte-for-byte', async () => {
    const controller = await boot(new MemoryMediaPool())
    const bytes = Buffer.from('raw source bytes')
    const state = await controller.addSource({ title: '附件', fileName: 'note.txt', fileBase64: bytes.toString('base64') }, SIGNAL)
    const source = state.sources[0]
    if (source === undefined) throw new Error('missing source')
    expect(Buffer.from(await controller.sourceFile(source.id, SIGNAL), 'base64')).toEqual(bytes)
    expect(source.text).toBe('raw source bytes')
    expect(state.pages).toEqual([])
  })

  it('retains one immutable report original per completed Session Turn', async () => {
    const pool = new MemoryMediaPool()
    const first = await boot(pool)
    const request = { title: 'CPO 报告', markdown: '# L1\n需求', sessionId: brandString<SessionId>('session-1'), turn: 1 }
    const created = await first.addReport(request, SIGNAL)
    const repeated = await first.addReport({ ...request, markdown: '# 改写内容' }, SIGNAL)
    expect(repeated.sourceId).toBe(created.sourceId)
    expect(repeated.snapshot.sources).toHaveLength(1)
    expect(repeated.snapshot.sources[0]?.text).toBe('# L1\n需求')
    await disposals.pop()?.()
    const second = await boot(pool)
    const restored = await second.addReport(request, SIGNAL)
    expect(restored.sourceId).toBe(created.sourceId)
    expect(restored.snapshot.activity).toHaveLength(1)
  })

  it('refuses a link to a missing page at publication', async () => {
    const controller = await boot(new MemoryMediaPool())
    await expect(controller.savePage({
      kind: 'topic', title: '研究', summary: '', markdown: '# 研究', sourceIds: [],
      links: ['missing' as never],
    }, SIGNAL)).rejects.toMatchObject({ code: 'research/not-found' })
    expect((await controller.snapshot(SIGNAL)).pages).toEqual([])
  })
})
