/** One atomic durable document for the personal research library. */
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { z } from 'zod'
import type { ResearchPageId, ResearchSnapshot, ResearchSourceId, ResearchStudyId } from './types.ts'

const sourceId = z.uuid().transform(value => brandString<ResearchSourceId>(value))
const pageId = z.uuid().transform(value => brandString<ResearchPageId>(value))
const studyId = z.uuid().transform(value => brandString<ResearchStudyId>(value))

const source = z.object({
  id: sourceId, title: z.string(), createdAt: z.number(), publishedAt: z.string().optional(),
  url: z.string().optional(), text: z.string().optional(),
  file: z.object({ attachmentId: z.string(), name: z.string(), bytes: z.number() }).optional(),
  report: z.object({
    sessionId: z.string().transform(value => brandString<SessionId>(value)),
    turn: z.number().int().positive(),
  }).optional(),
})
const page = z.object({
  id: pageId, kind: z.enum(['entity', 'concept', 'topic', 'source']), title: z.string(),
  summary: z.string(), markdown: z.string(), sourceIds: z.array(sourceId), links: z.array(pageId),
  revision: z.number(), createdAt: z.number(), updatedAt: z.number(),
})
const study = z.object({
  id: studyId, title: z.string(), question: z.string(),
  stage: z.enum(['question', 'chain', 'bottleneck', 'evidence', 'falsifiers', 'memo']),
  notes: z.string(), sessionId: z.string().optional(), createdAt: z.number(), updatedAt: z.number(),
})
const proposal = z.object({
  id: z.string(), pageId: pageId.optional(), expectedRevision: z.number().optional(), kind: z.enum(['entity', 'concept', 'topic', 'source']),
  title: z.string(), summary: z.string(), markdown: z.string(), sourceIds: z.array(sourceId),
  links: z.array(pageId), createdAt: z.number(),
})
const activity = z.object({
  id: z.string(), at: z.number(), action: z.enum(['source', 'page', 'study', 'proposal']), title: z.string(),
})

/** Initial page templates, editable through the research controller. */
export const INITIAL_TEMPLATES = {
  entity: '# 实体名\n\n## 概述\n\n## 已确认事实\n\n## 时间线\n\n## 待验证问题\n\n## 来源\n',
  concept: '# 概念名\n\n## 定义\n\n## 产业链位置\n\n## 相关概念\n\n## 来源\n',
  topic: '# 研究主题\n\n## 研究问题\n\n## 核心假设\n\n## 证据与反证\n\n## 开放问题\n\n## 来源\n',
  source: '# 来源标题\n\n## 摘要\n\n## 关键事实\n\n## 与已有知识的关系\n\n## 待核查\n',
} as const

const snapshot = z.object({
  sources: z.array(source), pages: z.array(page), history: z.array(page), studies: z.array(study),
  proposals: z.array(proposal), activity: z.array(activity),
  templates: z.object({ entity: z.string(), concept: z.string(), topic: z.string(), source: z.string() }),
})

/** The library is small enough to publish all related updates in one write. */
export const researchDomainSpec = defineDomain({
  name: 'personal_research', version: 1,
  global: { schema: snapshot, initial: {
    sources: [], pages: [], history: [], studies: [], proposals: [], activity: [], templates: INITIAL_TEMPLATES,
  } satisfies ResearchSnapshot },
  tables: {},
})
