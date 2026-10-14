import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import css from './SelectionActions.module.css'

interface SelectedPassage {
  text: string
  x: number
  y: number
  below: boolean
}

/** Show follow-up actions only for a selection wholly inside one Assistant text block. */
export function SelectionActions({ children, explain, verify, onFollowUp }: {
  children: ReactNode
  explain: { label: string; prompt: string }
  verify: { label: string; prompt: string }
  onFollowUp: (prompt: string) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [passage, setPassage] = useState<SelectedPassage | null>(null)
  const update = useCallback(() => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
      setPassage(null)
      return
    }
    const blockOf = (node: Node | null): Element | null => {
      const element = node instanceof Element ? node : node?.parentElement
      return element?.closest('[data-assistant-answer]') ?? null
    }
    const block = blockOf(selection.anchorNode)
    if (block === null || block !== blockOf(selection.focusNode) || !root.current?.contains(block)) {
      setPassage(null)
      return
    }
    const text = selection.toString().trim()
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    if (text === '' || rect.width === 0) {
      setPassage(null)
      return
    }
    setPassage({
      text,
      x: window.innerWidth < 232 ? window.innerWidth / 2
        : Math.min(Math.max(rect.left + rect.width / 2, 116), window.innerWidth - 116),
      y: rect.top >= 52 ? rect.top - 8 : rect.bottom + 8,
      below: rect.top < 52,
    })
  }, [])
  useEffect(() => {
    if (passage === null) return
    const dismiss = () => { setPassage(null) }
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest('[data-selection-actions]') === null) dismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [passage])
  const choose = (question: string) => {
    if (passage === null) return
    onFollowUp(`> ${passage.text.replace(/\n/g, '\n> ')}\n\n${question}`)
    window.getSelection()?.removeAllRanges()
    setPassage(null)
  }
  return <div ref={root} onMouseUp={update} onKeyUp={update} onTouchEnd={() => { window.setTimeout(update, 0) }}>
    {children}
    {passage !== null && createPortal(
      <div className={css.actions} data-selection-actions data-below={passage.below || undefined}
        style={{ left: passage.x, top: passage.y }}>
        <button type="button" onClick={() => { choose(explain.prompt) }}>{explain.label}</button>
        <button type="button" onClick={() => { choose(verify.prompt) }}>{verify.label}</button>
      </div>, document.body,
    )}
  </div>
}
