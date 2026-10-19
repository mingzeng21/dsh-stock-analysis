import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/client/AgentsPanel.module.css', import.meta.url)),
  'utf8',
)

it('adds the macOS titlebar clearance to the embedded Conversation header inset', () => {
  expect(css).toMatch(
    /:global\(\[data-platform='darwin'\]\)\s*\.detailNav\s*\{[^}]*padding-top:\s*calc\(28px \+ var\(--dsh-frame-top-clearance, 0px\)\);/s,
  )
})

it('stacks the dashboard inquiry when its content pane narrows and keeps the history control large', () => {
  expect(css).toMatch(/\.detail\s*\{[^}]*container-type:\s*inline-size;/s)
  expect(css).toMatch(/@container \(max-width: 1050px\)\s*\{[\s\S]*?\.dashboardWorkspace\s*\{[^}]*flex-direction:\s*column;/)
  expect(css).toMatch(/\.historyToggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s)
})
