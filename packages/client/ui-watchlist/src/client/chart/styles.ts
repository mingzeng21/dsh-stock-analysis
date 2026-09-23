/**
 * Chart colors to the library's style tree. Pure: the same colors always
 * produce the same styles, and every field the chart draws with is named here
 * rather than inherited from a preset palette.
 * @module @deepseek-ai/dsh-client-ui-watchlist/chart/styles
 */

import type { DeepPartial, Styles } from 'klinecharts'
import type { ChartColors } from './colors.ts'

/** Axis tick text size in px, matched to the surrounding metadata text. */
const AXIS_TEXT_SIZE = 11

/**
 * Build the chart style tree for one palette.
 * @param colors - concrete colors resolved from the design tokens.
 * @returns the partial style tree the chart accepts.
 */
export function chartStyles(colors: ChartColors): DeepPartial<Styles> {
  const axis = {
    axisLine: { color: colors.grid },
    tickLine: { color: colors.grid },
    tickText: { color: colors.text, size: AXIS_TEXT_SIZE },
  }
  return {
    grid: {
      show: true,
      horizontal: { color: colors.grid },
      vertical: { color: colors.grid },
    },
    candle: {
      bar: {
        upColor: colors.rise,
        downColor: colors.fall,
        noChangeColor: colors.text,
        upBorderColor: colors.rise,
        downBorderColor: colors.fall,
        noChangeBorderColor: colors.text,
        upWickColor: colors.rise,
        downWickColor: colors.fall,
        noChangeWickColor: colors.text,
      },
      priceMark: {
        high: { color: colors.text },
        low: { color: colors.text },
        last: {
          upColor: colors.rise,
          downColor: colors.fall,
          noChangeColor: colors.text,
          text: { color: colors.background },
        },
      },
      tooltip: {
        // The title line renders "{ticker} · {period}". The chart is not told
        // which instrument it draws — the panel header names it directly above —
        // and the toolbar already shows the period, so the line is hidden rather
        // than filled with the library's own period wording.
        title: { show: false },
        legend: { color: colors.text, size: AXIS_TEXT_SIZE },
        rect: { color: colors.background, borderColor: colors.grid },
      },
    },
    indicator: {
      lines: [{ color: colors.text }],
      bars: [{ upColor: colors.rise, downColor: colors.fall, noChangeColor: colors.text }],
      tooltip: {
        title: { color: colors.text },
        legend: { color: colors.text },
      },
    },
    xAxis: axis,
    yAxis: axis,
    separator: { color: colors.grid },
    crosshair: {
      horizontal: {
        line: { color: colors.crosshair },
        text: { backgroundColor: colors.crosshair, color: colors.background },
      },
      vertical: {
        line: { color: colors.crosshair },
        text: { backgroundColor: colors.crosshair, color: colors.background },
      },
    },
  }
}
