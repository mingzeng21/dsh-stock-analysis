/** Resolve settled assistant prose through the existing stock search service. */
import type { IStockClient, InstrumentMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import type { ChatTextAnnotations, ChatTextAnnotationSource } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { MarkdownTextAnnotation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReactNode } from 'react'

const CODE = /(?<![0-9a-z])(\d{6}(?:\.(?:SH|SZ))?)(?![0-9a-z])/giu
const HAN = /[\p{Script=Han}]{2,}/gu
const STOPWORDS = new Set(['股票', '公司', '行业', '市场', '价格', '今天', '昨日', '明天', '目前', '相关', '消息', '表示', '可以', '以及', '如果', '因为', '所以'])
const MAX_CANDIDATES = 24

/** Suppress syntax whose visible text must stay inert. The renderer also excludes these nodes. */
function searchable(markdown: string): string {
  const prose = markdown.replace(
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|!?\[[^\]]*\]\([^)]*\)|https?:\/\/[^\s)]+|<[^>]+>/gu,
    match => ' '.repeat(match.length))
  return prose.replace(/\$\$[\s\S]*?\$\$|\\\([\s\S]*?\\\)|(?<!\\)\$[^$\n]+\$/gu,
    match => ' '.repeat(match.length))
}

/** Bounded candidate extraction including names embedded in continuous Chinese prose.
 * @param markdown - settled assistant Markdown source.
 * @returns distinct candidate names and codes within the fixed request cap.
 */
export function candidates(markdown: string): readonly string[] {
  const text = searchable(markdown)
  const result = new Set<string>()
  for (const match of text.matchAll(CODE)) {
    if (match[1] !== undefined) result.add(match[1].toUpperCase())
  }
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
  for (const run of text.matchAll(HAN)) {
    const words = [...segmenter.segment(run[0])].map(part => part.segment)
      .filter(word => /^[\p{Script=Han}]+$/u.test(word))
    for (let i = 0; i < words.length; i++) {
      let joined = ''
      for (let j = i; j < words.length; j++) {
        joined += words[j] ?? ''
        if (joined.length > 8) break
        if (joined.length >= 2 && !STOPWORDS.has(joined)) result.add(joined)
      }
    }
  }
  return [...result].slice(0, MAX_CANDIDATES)
}

function exactMatch(candidate: string, hits: readonly InstrumentMatch[]): InstrumentMatch | undefined {
  const matches = hits.filter((hit) => {
    if (!/^\d{6}\.(?:SH|SZ)$/u.test(hit.thscode)) return false
    if (/^\d{6}/u.test(candidate)) return hit.ticker === candidate.slice(0, 6)
      && (!candidate.includes('.') || hit.thscode.toUpperCase() === candidate)
    return hit.name.replace(/\s/gu, '') === candidate.replace(/\s/gu, '')
  })
  const unique = new Map(matches.map(hit => [hit.thscode, hit]))
  return unique.size === 1 ? unique.values().next().value : undefined
}

interface CacheEntry { readonly hit: InstrumentMatch | undefined; readonly expires: number }

/** One browser lifetime of positive and negative lookup results, shared across Sessions. */
export class StockMentions implements ChatTextAnnotations {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly pending = new Map<string, Promise<void>>()
  private readonly sources = new Map<SessionId, ChatTextAnnotationSource>()
  private readonly names = new Map<string, string>()
  private readonly listeners = new Set<() => void>()
  private readonly queue: Array<() => void> = []
  private active = 0
  private revision = 0
  private disposed = false

  constructor(private readonly stock: IStockClient, private readonly open: (hit: InstrumentMatch) => void,
    private readonly label: (hit: InstrumentMatch) => string,
    private readonly action?: (hit: InstrumentMatch) => ReactNode) {}

  /** Read the last confirmed name for a quote tab.
   * @param code - complete thscode.
   * @returns the last resolved display name, if one is known.
   */
  name(code: string): string | undefined { return this.names.get(code) }

  /** @inheritDoc ChatTextAnnotations.forSession */
  forSession(sessionId: SessionId): ChatTextAnnotationSource {
    const existing = this.sources.get(sessionId)
    if (existing !== undefined) return existing
    const source: ChatTextAnnotationSource = {
      getSnapshot: () => this.revision,
      subscribe: (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } },
      request: (markdown) => { for (const candidate of candidates(markdown)) void this.lookup(candidate) },
      resolve: text => this.annotations(text),
    }
    this.sources.set(sessionId, source)
    return source
  }

  /** Release listeners and ignore late resolutions on plugin unload. */
  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.sources.clear()
    this.cache.clear()
    this.pending.clear()
  }

  private annotations(text: string): readonly MarkdownTextAnnotation[] {
    const found: MarkdownTextAnnotation[] = []
    const now = Date.now()
    for (const [candidate, cached] of this.cache) {
      const hit = cached.hit
      if (cached.expires <= now || hit === undefined) continue
      const haystack = /^\d/u.test(candidate) ? text.toUpperCase() : text
      let start = 0
      while ((start = haystack.indexOf(candidate, start)) !== -1) {
        const end = start + candidate.length
        if (!/^\d/u.test(candidate) || (!/[0-9a-z]/iu.test(text[start - 1] ?? '') && !/[0-9a-z]/iu.test(text[end] ?? ''))) {
          found.push({ start, end, label: this.label(hit), title: `${hit.name} · ${hit.thscode}`,
            onActivate: () => { if (!this.disposed) this.open(hit) },
            ...this.action === undefined ? {} : { after: this.action(hit) } })
        }
        start = end
      }
    }
    return found.sort((a, b) => a.start - b.start || b.end - a.end)
  }

  private lookup(candidate: string): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const cached = this.cache.get(candidate)
    if (cached !== undefined && cached.expires > Date.now()) return Promise.resolve()
    const existing = this.pending.get(candidate)
    if (existing !== undefined) return existing
    const task = this.withSlot(() => this.stock.searchSymbols(candidate, 20)).then((hits) => {
      if (this.disposed) return
      const hit = exactMatch(candidate, hits)
      this.cache.set(candidate, { hit, expires: Date.now() + (hit === undefined ? 300_000 : 3_600_000) })
      if (this.cache.size > 512) {
        const oldest = this.cache.keys().next().value
        if (oldest !== undefined) this.cache.delete(oldest)
      }
      if (hit !== undefined) this.names.set(hit.thscode, hit.name)
      this.revision++
      for (const listener of this.listeners) listener()
    }).catch(() => {
      if (!this.disposed) this.cache.set(candidate, { hit: undefined, expires: Date.now() + 60_000 })
    })
      .finally(() => { this.pending.delete(candidate) })
    this.pending.set(candidate, task)
    return task
  }

  private withSlot<T>(run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        this.active++
        void run().then(resolve, reject).finally(() => {
          this.active--
          this.queue.shift()?.()
        })
      }
      if (this.active < 2) start()
      else this.queue.push(start)
    })
  }
}
