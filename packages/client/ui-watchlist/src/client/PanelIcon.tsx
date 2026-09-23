/**
 * Navigation glyph for the watchlist's global-panel row: a price line over two
 * candles. Drawn here because the panel list is the only consumer and the
 * shared icon set has no market glyph.
 */
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the watchlist's navigation glyph.
 * @param props - icon presentation supplied by the panel row.
 * @returns the glyph at the requested size.
 */
export function WatchlistPanelIcon({ size }: SidebarPanelIconOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 11.5 6 8l2.6 2.2L13.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.4 12.6V9.9M4.4 7.6V6.9M4.4 9.9v-2.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10.9 12.6V9.4M10.9 6.6v-1M10.9 9.4V6.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
