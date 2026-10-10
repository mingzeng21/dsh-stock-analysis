/** Sidebar glyph for the stock Agents catalog. */
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** @param props - sidebar icon dimensions. @returns three research cards. */
export function StockAgentsIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    <path d="M9 11.5h5M11.5 9v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
}
