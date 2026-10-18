/** Directory, topic studies, and graph over one durable research snapshot. */
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  AddResearchSourceRequest, ResearchPage, ResearchPageId, ResearchPageKind, ResearchSnapshot,
  ResearchSource, ResearchSourceId, ResearchStudy, SaveResearchPageRequest,
} from '@deepseek-ai/dsh-api-research-controller/types'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ResearchPanel.module.css'

const KINDS: readonly ResearchPageKind[] = ['entity', 'concept', 'topic', 'source']

/** Data and operations passed from the browser plugin. */
export interface ResearchPanelInjected {
  hooks: {
    library: ObservableSnapshot<ResearchSnapshot>
    phase: ObservableSnapshot<'loading' | 'ready' | 'error'>
  }
  load: () => Promise<void>
  saveSource: (request: AddResearchSourceRequest) => Promise<void>
  savePage: (request: SaveResearchPageRequest) => Promise<void>
  restorePage: (id: ResearchPageId, revision: number) => Promise<void>
  startStudy: (topic: string) => Promise<void>
  runSource: (source: ResearchSource) => Promise<void>
  openStudy: (study: ResearchStudy) => void
  acceptProposal: (id: string) => Promise<void>
  rejectProposal: (id: string) => Promise<void>
  sourceFile: (id: ResearchSourceId) => Promise<string>
  saveTemplate: (kind: ResearchPageKind, markdown: string) => Promise<void>
}

/** Props assembled by the main slot. */
export type ResearchPanelProps = PropsRuntime<'main'> & PropsLocale<'research'> & InjectFace<ResearchPanelInjected>

type Selection = { readonly type: 'page' | 'source' | 'template' | 'index' | 'log'; readonly id?: string }

/** Browser-safe base64 for a bounded original file. */
async function encodeFile(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = reader.result
      if (typeof value !== 'string') { reject(new Error('file read failed')); return }
      resolve(value.slice(value.indexOf(',') + 1))
    }
    reader.onerror = () => { reject(reader.error ?? new Error('file read failed')) }
    reader.readAsDataURL(file)
  })
}

/** Generate the readable index view from published pages. */
function indexMarkdown(state: ResearchSnapshot, heading: string, kindLabel: (kind: ResearchPageKind) => string): string {
  const sections = KINDS.map((kind) => {
    const rows = state.pages.filter(page => page.kind === kind)
      .map(page => `- [[${page.title}]] — ${page.summary}`)
    return `## ${kindLabel(kind)}\n${rows.join('\n') || '- '}`
  })
  return `${heading}\n\n${sections.join('\n\n')}`
}

/** Generate the chronological log view from committed activity. */
function logMarkdown(state: ResearchSnapshot, heading: string): string {
  return `${heading}\n\n${[...state.activity].reverse().map(row =>
    `## [${new Date(row.at).toISOString().slice(0, 10)}] ${row.action} | ${row.title}`,
  ).join('\n\n')}`
}

/** Local link graph; clicking a node opens its page in the directory. */
function Graph({ pages, active, onOpen, empty, limit }: {
  pages: readonly ResearchPage[]
  active?: string | undefined
  onOpen: (id: ResearchPageId) => void
  empty: string
  limit: string
}) {
  const visible = active === undefined ? pages.slice(0, 30) : pages.filter(page =>
    page.id === active || page.links.includes(active as ResearchPageId)
      || pages.find(item => item.id === active)?.links.includes(page.id),
  ).slice(0, 30)
  if (visible.length === 0) return <p className={css.empty}>{empty}</p>
  const points = new Map(visible.map((page, index) => {
    const angle = 2 * Math.PI * index / visible.length - Math.PI / 2
    return [page.id, { x: 400 + 270 * Math.cos(angle), y: 330 + 245 * Math.sin(angle) }] as const
  }))
  return <div className={css.graphWrap}>
    <p>{limit}</p>
    <svg viewBox="0 0 800 660" className={css.graph} role="img" aria-label={limit}>
      {visible.flatMap(page => page.links.map((target) => {
        const from = points.get(page.id); const to = points.get(target)
        return from && to ? <line key={`${page.id}-${target}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={css.edge} /> : null
      }))}
      {visible.map((page) => {
        const point = points.get(page.id)
        if (point === undefined) return null
        return <g key={page.id} role="button" tabIndex={0} aria-label={page.title}
          onClick={() => { onOpen(page.id) }}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(page.id) } }}>
          <circle cx={point.x} cy={point.y} r="40" className={page.id === active ? css.nodeActive : css.node} />
          <text x={point.x} y={point.y + 4} textAnchor="middle" className={css.nodeLabel}>{page.title.slice(0, 6)}</text>
        </g>
      })}
    </svg>
  </div>
}

/** Render and edit the personal library. */
export function ResearchPanel(props: ResearchPanelProps) {
  const { t, useLibrary, usePhase, load, saveSource, savePage, restorePage, startStudy, runSource, openStudy,
    acceptProposal, rejectProposal, sourceFile, saveTemplate } = props
  const state = useLibrary(value => value)
  const phase = usePhase(value => value)
  const [tab, setTab] = useState<'directory' | 'study' | 'graph'>('directory')
  const [selection, setSelection] = useState<Selection>({ type: 'index' })
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<'source' | 'page' | 'template' | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [date, setDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<ResearchPageKind>('topic')
  const [topic, setTopic] = useState('')
  const [sourceIds, setSourceIds] = useState<string[]>([])
  const [linkIds, setLinkIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void load() }, [load])

  const selectedPage = selection.type === 'page' ? state.pages.find(page => page.id === selection.id) : undefined
  const selectedSource = selection.type === 'source' ? state.sources.find(source => source.id === selection.id) : undefined
  const selectedTemplate = selection.type === 'template' ? KINDS.find(value => value === selection.id) : undefined
  const backlinks = selectedPage === undefined ? [] : state.pages.filter(page => page.links.includes(selectedPage.id))
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('markdown.copy'), copiedLabel: t('markdown.copied') }, footnotes: t('markdown.footnotes'),
  }), [t])

  const beginPage = (page?: ResearchPage) => {
    setKind(page?.kind ?? 'topic'); setTitle(page?.title ?? ''); setSummary(page?.summary ?? '')
    setText(page?.markdown ?? state.templates.topic)
    setSourceIds([...(page?.sourceIds ?? [])]); setLinkIds([...(page?.links ?? [])]); setForm('page'); setError(null)
  }
  const beginSource = () => { setTitle(''); setText(''); setUrl(''); setDate(''); setFile(null); setForm('source'); setError(null) }
  const beginTemplate = (value: ResearchPageKind) => { setKind(value); setText(state.templates[value]); setForm('template'); setError(null) }
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(null)
    try { await operation(); setForm(null) } catch { setError(t('error.save')) } finally { setBusy(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (form === 'source' && file !== null && file.size > 5_000_000) {
      setError(t('form.fileLimit'))
      return
    }
    void perform(async () => {
      switch (form) {
        case 'source': {
          const request: AddResearchSourceRequest = {
            title, ...(text.trim() ? { text } : {}), ...(url.trim() ? { url } : {}),
            ...(date ? { publishedAt: date } : {}),
            ...(file === null ? {} : { fileName: file.name, fileBase64: await encodeFile(file) }),
          }
          await saveSource(request)
          break
        }
        case 'page': {
          const request: SaveResearchPageRequest = {
            ...(selectedPage === undefined ? {} : { id: selectedPage.id, expectedRevision: selectedPage.revision }),
            kind, title, summary, markdown: text,
            sourceIds: sourceIds.map(id => brandString<ResearchSourceId>(id)),
            links: linkIds.map(id => brandString<ResearchPageId>(id)),
          }
          await savePage(request)
          break
        }
        case 'template': await saveTemplate(kind, text); break
        default: break
      }
    })
  }
  const toggle = (id: string, values: string[], change: (next: string[]) => void) => {
    change(values.includes(id) ? values.filter(value => value !== id) : [...values, id])
  }
  const filtered = state.pages.filter(page => `${page.title} ${page.summary}`.toLowerCase().includes(search.toLowerCase()))
  const downloadSource = (source: ResearchSource) => {
    if (source.file === undefined) return
    void perform(async () => {
      const base64 = await sourceFile(source.id)
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: source.file?.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = source.file?.name ?? source.title
      anchor.click()
      setTimeout(() => { URL.revokeObjectURL(url) }, 1000)
    })
  }

  return <section className={css.panel} aria-label={t('title')}>
    <header className={css.header}>
      <h1>{t('title')}</h1>
      <nav className={css.tabs} aria-label={t('title')}>
        {(['directory', 'study', 'graph'] as const).map(value => <button key={value} type="button"
          aria-current={tab === value ? 'page' : undefined} onClick={() => { setTab(value); setForm(null) }}>
          {t(`tab.${value}`)}
        </button>)}
      </nav>
    </header>
    {phase === 'loading' ? <p className={css.empty}>{t('loading')}</p> : phase === 'error' ?
      <div className={css.empty}><p>{t('error.load')}</p><button onClick={() => { void load() }}>{t('retry')}</button></div> :
      tab === 'directory' ? <div className={css.workspace}>
        <aside className={css.tree} aria-label={t('tab.directory')}>
          <div className={css.treeActions}>
            <button onClick={beginSource}>{t('new.source')}</button>
            <button onClick={() => { setSelection({ type: 'index' }); beginPage() }}>{t('new.page')}</button>
          </div>
          <input aria-label={t('search')} placeholder={t('search')} value={search} onChange={(event) => { setSearch(event.target.value) }} />
          <h2>{t('dir.raw')}</h2>
          <div className={css.folder}>{t('dir.rawSources')}</div>
          {state.sources.map(source => <button key={source.id} className={css.treeItem}
            aria-current={selection.id === source.id ? 'page' : undefined}
            onClick={() => { setSelection({ type: 'source', id: source.id }); setForm(null) }}>{source.title}</button>)}
          <div className={css.folder}>{t('dir.rawAssets')}</div>
          {state.sources.filter(source => source.file !== undefined).map(source => <button key={`asset-${source.id}`}
            className={css.treeItem} onClick={() => { setSelection({ type: 'source', id: source.id }); setForm(null) }}>{source.file?.name}</button>)}
          <h2>{t('dir.wiki')}</h2>
          <button className={css.treeItem} onClick={() => { setSelection({ type: 'index' }); setForm(null) }}>{t('dir.index')}</button>
          <button className={css.treeItem} onClick={() => { setSelection({ type: 'log' }); setForm(null) }}>{t('dir.log')}</button>
          {KINDS.map(value => <div key={value}>
            <div className={css.folder}>{t(`dir.${value === 'entity' ? 'entities' : value === 'concept' ? 'concepts' : value === 'topic' ? 'topics' : 'sources'}`)}</div>
            {filtered.filter(page => page.kind === value).map(page => <button key={page.id} className={css.treeItem}
              aria-current={selection.id === page.id ? 'page' : undefined}
              onClick={() => { setSelection({ type: 'page', id: page.id }); setForm(null) }}>{page.title}</button>)}
          </div>)}
          <h2>{t('dir.templates')}</h2>
          {KINDS.map(value => <button key={value} className={css.treeItem}
            onClick={() => { setSelection({ type: 'template', id: value }); setForm(null) }}>{t('dir.templateFile', { kind: value })}</button>)}
        </aside>
        <main className={css.content}>
          {state.proposals.length > 0 && <section className={css.proposals}>
            <h2>{t('proposal.title')} ({state.proposals.length})</h2>
            {state.proposals.map(proposal => <div key={proposal.id} className={css.proposal}>
              <span>{proposal.title}</span>
              <details><summary>{t('proposal.preview')}</summary><pre className={css.rawText}>{proposal.markdown}</pre></details>
              <button onClick={() => { void perform(() => acceptProposal(proposal.id)) }}>{t('proposal.accept')}</button>
              <button onClick={() => { void perform(() => rejectProposal(proposal.id)) }}>{t('proposal.reject')}</button>
            </div>)}
          </section>}
          {form === null ? <>
            {selection.type === 'index' && <MarkdownText text={indexMarkdown(state, t('index.heading'), value => t(`kind.${value}`))} labels={markdownLabels} />}
            {selection.type === 'log' && <MarkdownText text={logMarkdown(state, t('log.heading'))} labels={markdownLabels} />}
            {selectedSource && <article>
              <h2>{selectedSource.title}</h2><p className={css.muted}>{t('source.immutable')}</p>
              {selectedSource.url && <p><a href={selectedSource.url} target="_blank" rel="noreferrer">{selectedSource.url}</a></p>}
              {selectedSource.text && <MarkdownText text={selectedSource.text} labels={markdownLabels} />}
              {selectedSource.file && <p><button onClick={() => { downloadSource(selectedSource) }}>{t('source.file', { name: selectedSource.file?.name ?? '' })}</button></p>}
              <button disabled={busy} onClick={() => { void perform(() => runSource(selectedSource)) }}>{t('source.compile')}</button>
              {!selectedSource.text && !selectedSource.file && <p>{t('source.urlOnly')}</p>}
            </article>}
            {selectedPage && <article>
              <div className={css.articleHead}><div><h2>{selectedPage.title}</h2><p className={css.muted}>{t('page.revision', { revision: String(selectedPage.revision) })} · {selectedPage.summary}</p></div>
                <button onClick={() => { beginPage(selectedPage) }}>{t('page.edit')}</button></div>
              <MarkdownText text={selectedPage.markdown} labels={markdownLabels} />
              {state.history.filter(item => item.id === selectedPage.id).length > 0 && <details>
                <summary>{t('page.history')}</summary>
                {state.history.filter(item => item.id === selectedPage.id).map(item => <div key={`${item.id}-${item.revision}`}>
                  <h3>{t('page.revision', { revision: String(item.revision) })}</h3><pre className={css.rawText}>{item.markdown}</pre>
                  <button disabled={busy} onClick={() => { void perform(() => restorePage(selectedPage.id, item.revision)) }}>{t('page.restore')}</button>
                </div>)}
              </details>}
              <h3>{t('page.references')}</h3>
              {selectedPage.sourceIds.map(id => <button key={id} className={css.link} onClick={() => { setSelection({ type: 'source', id }) }}>{state.sources.find(item => item.id === id)?.title ?? id}</button>)}
              <h3>{t('page.related')}</h3>
              {selectedPage.links.map(id => <button key={id} className={css.link} onClick={() => { setSelection({ type: 'page', id }) }}>{state.pages.find(item => item.id === id)?.title ?? id}</button>)}
              <h3>{t('page.backlinks')}</h3>
              {backlinks.map(page => <button key={page.id} className={css.link} onClick={() => { setSelection({ type: 'page', id: page.id }) }}>{page.title}</button>)}
            </article>}
            {selectedTemplate && <article><div className={css.articleHead}><h2>{t('dir.templateFile', { kind: selectedTemplate })}</h2><button onClick={() => { beginTemplate(selectedTemplate) }}>{t('form.template')}</button></div>
              <pre className={css.rawText}>{state.templates[selectedTemplate]}</pre></article>}
          </> : <form className={css.form} onSubmit={submit}>
            <h2>{t(form === 'source' ? 'new.source' : form === 'page' ? 'new.page' : 'form.template')}</h2>
            {form !== 'template' && <label>{t('form.title')}<input required value={title} onChange={(event) => { setTitle(event.target.value) }} /></label>}
            {form === 'source' && <>
              <label>{t('form.url')}<input type="url" value={url} onChange={(event) => { setUrl(event.target.value) }} /></label>
              <label>{t('form.date')}<input type="date" value={date} onChange={(event) => { setDate(event.target.value) }} /></label>
              <label>{t('form.file')}<input type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => { setFile(event.target.files?.[0] ?? null) }} /></label>
            </>}
            {form === 'page' && <>
              <label>{t('form.kind')}<select value={kind} onChange={(event) => { const next = event.target.value as ResearchPageKind; setKind(next); if (!selectedPage) setText(state.templates[next]) }}>
                {KINDS.map(value => <option key={value} value={value}>{t(`kind.${value}`)}</option>)}</select></label>
              <label>{t('form.summary')}<input value={summary} onChange={(event) => { setSummary(event.target.value) }} /></label>
              <fieldset><legend>{t('form.sources')}</legend>{state.sources.map(source => <label key={source.id} className={css.choice}>
                <input type="checkbox" checked={sourceIds.includes(source.id)} onChange={() => { toggle(source.id, sourceIds, setSourceIds) }} />{source.title}</label>)}</fieldset>
              <fieldset><legend>{t('form.links')}</legend>{state.pages.filter(page => page.id !== selectedPage?.id).map(page => <label key={page.id} className={css.choice}>
                <input type="checkbox" checked={linkIds.includes(page.id)} onChange={() => { toggle(page.id, linkIds, setLinkIds) }} />{page.title}</label>)}</fieldset>
            </>}
            <label>{t(form === 'source' ? 'form.text' : 'form.markdown')}
              <textarea required={form !== 'source'} value={text} onChange={(event) => { setText(event.target.value) }} rows={16} /></label>
            {error && <p role="alert">{error}</p>}
            <div className={css.actions}><button type="submit" disabled={busy}>{t('form.save')}</button><button type="button" onClick={() => { setForm(null) }}>{t('form.cancel')}</button></div>
          </form>}
        </main>
      </div> : tab === 'study' ? <main className={css.studyContent}>
        <h2>{t('tab.study')}</h2>
        <p className={css.muted}>{t('study.intro')}</p>
        <form className={css.topicForm} onSubmit={(event) => {
          event.preventDefault()
          const value = topic.trim()
          if (value === '') return
          void perform(async () => { await startStudy(value); setTopic('') })
        }}>
          <label htmlFor="research-topic">{t('study.topic')}</label>
          <div className={css.topicRow}><input id="research-topic" required maxLength={240}
            placeholder={t('study.placeholder')} value={topic} onChange={(event) => { setTopic(event.target.value) }} />
          <button type="submit" disabled={busy}>{t('study.start')}</button></div>
        </form>
        {error && <p role="alert">{error}</p>}
        <h3>{t('study.history')}</h3>
        {state.studies.length === 0 ? <p className={css.muted}>{t('study.empty')}</p> :
          <div className={css.studyList}>{[...state.studies].reverse().map(study =>
            <button key={study.id} disabled={study.sessionId === undefined}
              onClick={() => { openStudy(study) }}>{study.title}</button>)}</div>}
      </main> : <Graph pages={state.pages} active={selection.type === 'page' ? selection.id : undefined}
        onOpen={(id) => { setSelection({ type: 'page', id }); setTab('directory') }} empty={t('graph.empty')} limit={t('graph.limit')} />}
  </section>
}
