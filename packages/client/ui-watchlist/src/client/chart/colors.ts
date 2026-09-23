/**
 * The chart's colors, resolved from the same design tokens every other surface
 * styles with.
 *
 * A canvas cannot resolve a CSS variable, so the tokens are read once as
 * computed values and handed to the chart as concrete colors. Reading them from
 * the mounted element rather than from a service keeps the chart on the same
 * palette as the markup around it, including a theme switch the presenter has
 * already applied to the document.
 * @module @deepseek-ai/dsh-client-ui-watchlist/chart/colors
 */

/** Concrete colors one chart draws with. */
export interface ChartColors {
  /** Plot background. */
  readonly background: string
  /** Axis and separator lines. */
  readonly grid: string
  /** Axis and tooltip text. */
  readonly text: string
  /** A rising bar. */
  readonly rise: string
  /** A falling bar. */
  readonly fall: string
  /** Crosshair line and its label background. */
  readonly crosshair: string
}

/**
 * Token names this module reads. A-share convention colors a rise red and a
 * fall green, which is the opposite of the semantic names these two tokens
 * carry, so the mapping is stated here rather than inferred from the name.
 */
const TOKENS = {
  background: '--dsw-alias-bg-base',
  grid: '--dsw-alias-border-l2',
  text: '--dsw-alias-label-tertiary',
  rise: '--dsw-alias-state-error-primary',
  fall: '--dsw-alias-state-success-primary',
  crosshair: '--dsw-alias-label-dimmed',
} as const satisfies Readonly<Record<keyof ChartColors, string>>

/**
 * Resolve the chart colors from an element's computed style.
 * @param element - mounted element inside the themed document.
 * @returns one concrete color per role; a token this document does not define
 *   resolves to an empty string, which leaves the chart library's own default
 *   in place — the token stylesheet is always loaded where the panel renders.
 */
export function resolveChartColors(element: HTMLElement): ChartColors {
  const style = getComputedStyle(element)
  return {
    background: style.getPropertyValue(TOKENS.background).trim(),
    grid: style.getPropertyValue(TOKENS.grid).trim(),
    text: style.getPropertyValue(TOKENS.text).trim(),
    rise: style.getPropertyValue(TOKENS.rise).trim(),
    fall: style.getPropertyValue(TOKENS.fall).trim(),
    crosshair: style.getPropertyValue(TOKENS.crosshair).trim(),
  }
}
