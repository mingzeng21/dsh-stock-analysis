/** Existing-style book glyph for the personal research row. */
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** @param props - requested icon size. @returns an open book glyph. */
export function ResearchIcon({ size }: SidebarPanelIconOwnerProps) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 4.2C6.4 3.1 4.7 3 2 3.4v9.2c2.7-.4 4.4-.3 6 .8 1.6-1.1 3.3-1.2 6-.8V3.4c-2.7-.4-4.4-.3-6 .8Zm0 0v9.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
}
