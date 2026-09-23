/**
 * The K-line canvas, wrapped so the rest of the panel never touches the chart
 * library.
 *
 * The handle receives bars and returns a canvas: it does not read Remote, does
 * not see the panel store, and is not told which instrument it draws — the
 * instrument is named by the panel header directly above it. The library's
 * pull-based loader is served from the bars this handle holds, so replacing
 * them is one `resetData` and never a library-specific update path.
 * @module @deepseek-ai/dsh-client-ui-watchlist/chart
 */

import { dispose, init, type Chart, type KLineData } from 'klinecharts'
import type { ChartColors } from './colors.ts'
import { chartStyles } from './styles.ts'

export type { ChartColors } from './colors.ts'
export { resolveChartColors } from './colors.ts'

/** One bar the chart draws, in the wire vocabulary the panel already holds. */
export interface ChartBar {
  /** Bar open time in milliseconds since the Unix epoch. */
  readonly time: number
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
}

/** Price and volume precision: A-share prices carry cents and volumes are whole shares. */
const PRICE_PRECISION = 2
const VOLUME_PRECISION = 0

/** Moving average periods drawn over the candle pane. */
const MA_PERIODS = [5, 10, 20]

/** The library's own pane id for the candle plot, where a moving average belongs. */
const CANDLE_PANE = 'candle_pane'

/** One live chart. */
export interface CandleChartHandle {
  /** Replace the drawn series. */
  setBars(bars: readonly ChartBar[]): void
  /** Repaint for a new palette, without rebuilding the chart. */
  setColors(colors: ChartColors): void
  /** Release the canvas and its listeners. */
  dispose(): void
}

/** One bar in the library's own row vocabulary. */
function toRow(bar: ChartBar): KLineData {
  return { timestamp: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }
}

/**
 * Create one chart inside an element that already has its final size.
 * @param container - the element the canvas is created in.
 * @param colors - concrete colors resolved from the design tokens.
 * @returns the handle the panel drives; disposing it releases the element.
 * @throws {Error} when the library refuses the element, which means the
 *   container was not laid out or already owns a chart.
 */
export function createCandleChart(container: HTMLElement, colors: ChartColors): CandleChartHandle {
  const styles = chartStyles(colors)
  const chart: Chart | null = init(container, { styles })
  /* v8 ignore next 2 -- the library answers null only for an element id that
     resolves to no element, and this adapter always passes the element itself. */
  if (chart === null) throw new Error('ui-watchlist: the chart library refused the container')
  chart.setSymbol({ ticker: '', pricePrecision: PRICE_PRECISION, volumePrecision: VOLUME_PRECISION })
  chart.setPeriod({ span: 1, type: 'day' })
  let bars: readonly KLineData[] = []
  chart.setDataLoader({
    // The loader answers from the bars this handle holds, so a replacement is
    // one `resetData` and the library keeps owning paging and zoom.
    getBars: ({ callback }) => { callback([...bars]) },
  })
  chart.createIndicator({ name: 'MA', calcParams: [...MA_PERIODS], paneId: CANDLE_PANE })
  chart.createIndicator('VOL')
  return {
    setBars(next) {
      bars = next.map(toRow)
      chart.resetData()
    },
    setColors(next) {
      chart.setStyles(chartStyles(next))
    },
    dispose() {
      dispose(container)
    },
  }
}
