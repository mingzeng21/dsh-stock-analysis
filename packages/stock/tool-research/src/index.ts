/** Model tools for reading the personal wiki and proposing reviewed edits. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-research-controller'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ResearchPageId, ResearchSourceId } from '@deepseek-ai/dsh-api-research-controller/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'

/** Plugin name shown in the preset. */
export const name = 'tool-research'
/** Required registry and authoritative research library. */
export const inject = ['tools', 'researchController']

/** Bounds on complete model-visible results. */
export interface Config {
  /** Maximum characters returned by one search or read call. */
  readonly maxResultChars: number
  /** Maximum hits per content category in a search call. */
  readonly maxSearchResults: number
}

/** Deployment-configured output bounds. */
export const Config: z<Config> = z.object({
  maxResultChars: z.number().step(1).min(1000).default(12_000),
  maxSearchResults: z.number().step(1).min(1).default(20),
})

const TEXT_OUTPUT = {
  schema: { type: 'string' as const },
  render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }],
}

/** Register search, read, and review-gated proposal tools. */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'research_search',
    description: 'Search the personal research wiki and source catalog before analyzing a related stock or topic. Results include stable ids; read useful hits next.',
    parameters: { query: { type: 'string', required: true, description: 'Company, concept, or research topic.' } },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const query = args.query.trim().toLocaleLowerCase()
      if (query === '') return 'Search query is empty.'
      const state = ctx.researchController.current()
      const pages = state.pages.filter(page => `${page.title} ${page.summary} ${page.markdown}`.toLocaleLowerCase().includes(query))
        .slice(0, config.maxSearchResults).map(page => ({ id: page.id, title: page.title, kind: page.kind, summary: page.summary }))
      const sources = state.sources.filter(source => `${source.title} ${source.text ?? ''}`.toLocaleLowerCase().includes(query))
        .slice(0, config.maxSearchResults).map(source => ({ id: source.id, title: source.title, publishedAt: source.publishedAt }))
      const total = pages.length + sources.length
      while (JSON.stringify({ pages, sources, truncated: true }).length > config.maxResultChars) {
        if (sources.length > 0) sources.pop()
        else if (pages.length > 0) pages.pop()
        else break
      }
      return JSON.stringify({ pages, sources, truncated: pages.length + sources.length < total })
    },
    presentCall: args => ({ card: 'generic', title: `Search research: ${args.query}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'research_read',
    description: 'Read a personal wiki page or original text source by id. For long content, pass the returned nextOffset to read subsequent chunks. URL-only and file-only records contain metadata, not verified full text.',
    parameters: {
      id: { type: 'string', required: true, description: 'Exact page or source id.' },
      offset: { type: 'number', description: 'Zero-based character offset. Defaults to 0; use nextOffset to continue.' },
    },
    output: TEXT_OUTPUT,
    isConcurrencySafe: () => true,
    execute: async (args) => {
      const state = ctx.researchController.current()
      const page = state.pages.find(item => item.id === args.id)
      const source = state.sources.find(item => item.id === args.id)
      if (page === undefined && source === undefined) return `No research page or source has id ${args.id}.`
      const offset = args.offset ?? 0
      if (!Number.isSafeInteger(offset) || offset < 0) return 'offset must be a non-negative integer.'
      const content = page?.markdown ?? source?.text ?? ''
      const metadata = page === undefined
        ? { id: source?.id, title: source?.title, publishedAt: source?.publishedAt,
          url: source?.url?.slice(0, 300), urlTruncated: (source?.url?.length ?? 0) > 300,
          file: source?.file === undefined ? undefined : { name: source.file.name, bytes: source.file.bytes } }
        : { id: page.id, title: page.title, kind: page.kind, summary: page.summary.slice(0, 160),
          revision: page.revision, sourceIds: page.sourceIds.slice(0, 5), links: page.links.slice(0, 5),
          referencesTruncated: page.sourceIds.length > 5 || page.links.length > 5 }
      let low = 0
      let high = Math.max(0, Math.min(content.length - offset, config.maxResultChars))
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        const nextOffset = offset + middle < content.length ? offset + middle : null
        if (JSON.stringify({ ...metadata, content: content.slice(offset, offset + middle), offset,
          nextOffset, totalChars: content.length }).length <= config.maxResultChars) low = middle
        else high = middle - 1
      }
      return JSON.stringify({ ...metadata, content: content.slice(offset, offset + low), offset,
        nextOffset: offset + low < content.length ? offset + low : null, totalChars: content.length })
    },
    presentCall: args => ({ card: 'generic', title: `Read research ${args.id}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'research_propose',
    description: 'Propose a wiki page edit for human review. This does not publish or replace a page. Cite saved source ids and distinguish disclosed facts from inference.',
    parameters: {
      pageId: { type: 'string', description: 'Existing page id to revise; omit to create a page.' },
      kind: { type: 'string', required: true, enum: ['entity', 'concept', 'topic', 'source'], description: 'Wiki page category.' },
      title: { type: 'string', required: true, description: 'Page title.' },
      summary: { type: 'string', required: true, description: 'One-line page summary.' },
      markdown: { type: 'string', required: true, description: 'Complete proposed Markdown page.' },
      sourceIds: { type: 'array', required: true, items: { type: 'string' }, description: 'Saved source ids supporting this page.' },
      links: { type: 'array', required: true, items: { type: 'string' }, description: 'Existing wiki page ids linked by this page.' },
    },
    output: TEXT_OUTPUT,
    execute: async (args) => {
      const state = await ctx.researchController.propose({
        ...(args.pageId === undefined ? {} : { id: brandString<ResearchPageId>(args.pageId) }),
        kind: args.kind, title: args.title, summary: args.summary, markdown: args.markdown,
        sourceIds: args.sourceIds.map(id => brandString<ResearchSourceId>(id)),
        links: args.links.map(id => brandString<ResearchPageId>(id)),
      })
      const newest = state.proposals.at(-1)
      return newest === undefined ? 'Proposal was not saved.' : `Proposal ${newest.id} is awaiting review in Personal Research Lab.`
    },
    presentCall: args => ({ card: 'generic', title: `Propose wiki page: ${args.title}`, kind: 'other' }),
  }))
}
