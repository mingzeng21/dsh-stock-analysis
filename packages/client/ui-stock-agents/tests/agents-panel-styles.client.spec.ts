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
