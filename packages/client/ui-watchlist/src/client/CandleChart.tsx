/**
 * The candle canvas as a React element.
 *
 * The library is imperative and canvas-based, so this component owns exactly
 * three effects: build the chart once, repaint it when the palette changes, and
 * replace its bars when the series changes. It reads no hook of its own beyond
 * React's — the bars and the theme revision arrive as props.
 */
import { useEffect, useRef } from 'react'
import { createCandleChart, resolveChartColors, type CandleChartHandle, type ChartBar } from './chart/index.ts'
import css from './CandleChart.module.css'

/** Props the analysis side supplies. */
export interface CandleChartProps {
  /** Bars to draw, in ascending time order. */
  readonly bars: readonly ChartBar[]
  /**
   * Monotonic theme revision. A change re-reads the design tokens and repaints,
   * because a canvas cannot follow a CSS variable on its own.
   */
  readonly themeRevision: number
}

/**
 * Render the candle canvas.
 * @param props - the series and the theme revision.
 * @returns the chart host element.
 */
export function CandleChart({ bars, themeRevision }: CandleChartProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const chart = useRef<CandleChartHandle | undefined>(undefined)

  useEffect(() => {
    const element = host.current
    /* v8 ignore next -- React attaches the ref before effects run: the host renders unconditionally. */
    if (element === null) return
    const instance = createCandleChart(element, resolveChartColors(element))
    chart.current = instance
    return () => {
      instance.dispose()
      chart.current = undefined
    }
  }, [])

  useEffect(() => {
    const element = host.current
    /* v8 ignore next -- the mount effect above owns this element for the component's lifetime. */
    if (element === null) return
    chart.current?.setColors(resolveChartColors(element))
  }, [themeRevision])

  useEffect(() => {
    chart.current?.setBars(bars)
  }, [bars])

  return <div ref={host} className={css.canvas} />
}
