/**
 * Navigation glyph for the Conversation's global-panel row: a speech bubble
 * whose tail marks it as the message surface rather than another chat action.
 * Drawn here because the sidebar's panel list is the only consumer and the
 * shared icon set has no conversation mark.
 */
import type { SidebarPanelIconOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the Conversation's navigation glyph.
 * @param props - icon presentation supplied by the panel row.
 * @returns the glyph at the requested size.
 */
export function ConversationPanelIcon({ size }: SidebarPanelIconOwnerProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.4 4.2C2.4 3.2 3.2 2.4 4.2 2.4h7.6c1 0 1.8.8 1.8 1.8v5.2c0 1-.8 1.8-1.8 1.8H7.1L4 13.6V11.2H4.2c-1 0-1.8-.8-1.8-1.8V4.2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="M5.4 5.8h5.2M5.4 8.2h3.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
