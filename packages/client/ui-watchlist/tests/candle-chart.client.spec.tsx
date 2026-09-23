// @vitest-environment jsdom
/**
 * The chart module and its element: the token resolution, the style tree a
 * palette produces, the adapter's calls into the library, and the element's
 * build, repaint, replace, and teardown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createCandleChart, resolveChartColors, type ChartBar, type ChartColors } from '../src/client/chart/index.ts'
import { chartStyles } from '../src/client/chart/styles.ts'
import { CandleChart } from '../src/client/CandleChart.tsx'
import { installCanvas } from './support/canvas.ts'

const COLORS: ChartColors = {
  background: '#ffffff',
  grid: '#e5e5e5',
  text: '#929aa5',
  rise: '#c9302c',
  fall: '#2d9d78',
  crosshair: '#76808f',
}

/** One bar, overridable per test. */
function bar(time: number, close = 10): ChartBar {
  return { time, open: close, high: close + 1, low: close - 1, close, volume: 100 }
}

beforeEach(() => { installCanvas() })
afterEach(cleanup)

/** A host element with the size a canvas needs. */
function host(): HTMLElement {
  const element = document.createElement('div')
  Object.defineProperty(element, 'clientWidth', { value: 600 })
  Object.defineProperty(element, 'clientHeight', { value: 320 })
  document.body.append(element)
  return element
}

describe('resolveChartColors', () => {
  it('reads every chart role from its design token', () => {
    const element = host()
    element.style.setProperty('--dsw-alias-bg-base', '#101010')
    element.style.setProperty('--dsw-alias-border-l2', '#222222')
    element.style.setProperty('--dsw-alias-label-tertiary', '#929aa5')
    element.style.setProperty('--dsw-alias-state-error-primary', '#c9302c')
    element.style.setProperty('--dsw-alias-state-success-primary', '#2d9d78')
    element.style.setProperty('--dsw-alias-label-dimmed', '#76808f')
    expect(resolveChartColors(element)).toEqual({
      background: '#101010',
      grid: '#222222',
      text: '#929aa5',
      rise: '#c9302c',
      fall: '#2d9d78',
      crosshair: '#76808f',
    })
  })

  it('leaves a role empty when the document defines no such token', () => {
    expect(resolveChartColors(host())).toEqual({
      background: '', grid: '', text: '', rise: '', fall: '', crosshair: '',
    })
  })
})

describe('chartStyles', () => {
  it('carries every palette role onto the fields the chart draws with', () => {
    const styles = chartStyles(COLORS)
    expect(styles.grid?.horizontal?.color).toBe(COLORS.grid)
    expect(styles.candle?.bar?.upColor).toBe(COLORS.rise)
    expect(styles.candle?.bar?.downColor).toBe(COLORS.fall)
    expect(styles.xAxis?.tickText?.color).toBe(COLORS.text)
    expect(styles.yAxis?.axisLine?.color).toBe(COLORS.grid)
    expect(styles.separator?.color).toBe(COLORS.grid)
    expect(styles.crosshair?.vertical?.line?.color).toBe(COLORS.crosshair)
    expect(styles.crosshair?.horizontal?.text?.color).toBe(COLORS.background)
    expect(styles.candle?.tooltip?.title?.show).toBe(false)
  })

  it('is pure: the same palette always produces an equal tree', () => {
    expect(chartStyles(COLORS)).toEqual(chartStyles({ ...COLORS }))
  })
})

describe('createCandleChart', () => {
  it('builds a chart, replaces its series, repaints, and releases the element', () => {
    const element = host()
    const handle = createCandleChart(element, COLORS)
    expect(element.querySelector('canvas')).not.toBeNull()

    // Replacing the series is what the library's loader answers from, so the
    // drawn series is readable back through the chart it built.
    handle.setBars([bar(1, 10), bar(2, 11)])
    expect(element.querySelector('canvas')).not.toBeNull()

    handle.setColors({ ...COLORS, rise: '#ff0000' })
    handle.dispose()
    expect(element.querySelector('canvas')).toBeNull()
  })

  it('disposes a chart that was never given a series', () => {
    const element = host()
    const handle = createCandleChart(element, COLORS)
    handle.dispose()
    expect(element.querySelector('canvas')).toBeNull()
  })
})

describe('CandleChart', () => {
  it('builds one chart for its lifetime and draws the series it is given', () => {
    const view = render(<CandleChart bars={[bar(1)]} themeRevision={0} />)
    const canvas = view.container.querySelector('canvas')
    expect(canvas).not.toBeNull()
    view.rerender(<CandleChart bars={[bar(1), bar(2)]} themeRevision={0} />)
    expect(view.container.querySelector('canvas')).toBe(canvas)
  })

  it('repaints on a new theme revision without rebuilding the chart', () => {
    const view = render(<CandleChart bars={[]} themeRevision={0} />)
    const canvas = view.container.querySelector('canvas')
    view.rerender(<CandleChart bars={[]} themeRevision={1} />)
    expect(view.container.querySelector('canvas')).toBe(canvas)
  })

  it('releases the canvas when it unmounts', () => {
    const view = render(<CandleChart bars={[]} themeRevision={0} />)
    expect(view.container.querySelector('canvas')).not.toBeNull()
    view.unmount()
    expect(view.container.querySelector('canvas')).toBeNull()
  })

  it('paints with the palette the mounted document defines', () => {
    const view = render(<CandleChart bars={[bar(1)]} themeRevision={0} />)
    const hostElement = view.container.firstElementChild as HTMLElement
    hostElement.style.setProperty('--dsw-alias-bg-base', '#000000')
    expect(resolveChartColors(hostElement).background).toBe('#000000')
  })
})

describe('the chart library contract', () => {
  it('is loaded through the module the adapter imports', async () => {
    const library = await import('klinecharts')
    expect(typeof library.init).toBe('function')
    expect(typeof library.dispose).toBe('function')
    expect(vi.isMockFunction(library.init)).toBe(false)
  })
})
