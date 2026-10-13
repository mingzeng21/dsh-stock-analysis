import type { InstrumentMatch } from '@deepseek-ai/dsh-api-stock-controller/client'

/** Selection shown when a global page has no Session-scoped sidebar. */
export class StockQuoteOverlay {
  private selection: InstrumentMatch | null = null
  private readonly listeners = new Set<() => void>()

  /** Subscribe to selection changes.
   * @param listener - Invoked after the selected instrument changes.
   * @returns A listener disposer.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Read the selected instrument.
   * @returns The current match or null while the panel is closed.
   */
  readonly getSnapshot = (): InstrumentMatch | null => this.selection

  /** Show one instrument in the global right-edge panel.
   * @param selection - Exact, unique A-share match.
   */
  open(selection: InstrumentMatch): void {
    this.selection = selection
    this.emit()
  }

  /** Dismiss the global panel. */
  close(): void {
    if (this.selection === null) return
    this.selection = null
    this.emit()
  }

  private emit(): void { for (const listener of this.listeners) listener() }
}
