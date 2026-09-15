/**
 * Drift guard for the shipped presets that are copies of `standard`.
 *
 * `stock-analysis` repeats `standard`'s rows because a preset is a complete
 * agent composition rather than an overlay. The copy is necessary and the
 * duplication is the cost; without a guard, a capability added to `standard`
 * would silently never reach a `stock-analysis` session, and the preset would
 * decay into a weaker agent than its own description promises.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const PRESETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets')

/** Row ids a `standard` copy is allowed to add or change, with the reason. */
const ALLOWED_ADDITIONS: Readonly<Record<string, readonly string[]>> = {
  'stock-analysis': ['tool-stock'],
}

/** One top-level composition row. */
interface Row {
  readonly id?: unknown
}

/** Read one preset's rows. */
function rows(preset: string): Row[] {
  const source = readFileSync(join(PRESETS, preset, 'agent.cordis.yml'), 'utf8')
  // The preset dialect carries `!!js` scalars; parse it with the same schema
  // the Loader mounts so a conditional row compares as the expression node it is.
  return yaml.load(source, { schema: entryListSchema }) as Row[]
}

/** Index rows by their declared id, rejecting a row without one. */
function byId(preset: string): Map<string, Row> {
  const indexed = new Map<string, Row>()
  for (const row of rows(preset)) {
    if (typeof row.id !== 'string') throw new Error(`${preset}: composition row without a string id`)
    indexed.set(row.id, row)
  }
  return indexed
}

describe('shipped preset copies of standard', () => {
  for (const [preset, additions] of Object.entries(ALLOWED_ADDITIONS)) {
    it(`${preset} carries every standard row unchanged except its declared additions`, () => {
      const standard = byId('standard')
      const copy = byId(preset)

      for (const [id, row] of standard) {
        expect(copy.has(id), `${preset} is missing standard row "${id}"`).toBe(true)
        // The whole row, not only its presence: a stale config value is the
        // failure this guard exists to catch.
        expect(copy.get(id), `${preset} row "${id}" drifted from standard`).toEqual(row)
      }

      const extra = [...copy.keys()].filter(id => !standard.has(id)).sort()
      expect(extra).toEqual([...additions].sort())
    })
  }
})
