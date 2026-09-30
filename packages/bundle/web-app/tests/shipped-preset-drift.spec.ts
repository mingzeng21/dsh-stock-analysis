/** Guard the shipped stock-analysis copy of the standard preset. */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

const PRESETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'presets')

/** One plugin row in a preset declaration. */
interface PluginRow {
  readonly id?: unknown
}

/** The preset declaration inserted by a bundle patch. */
interface PresetDeclaration {
  readonly config?: {
    readonly id?: unknown
    readonly plugins?: unknown
  }
}

/** One operation in a bundle patch. */
interface PatchRow {
  readonly insert?: readonly PresetDeclaration[]
}

/** Read the plugin rows for one shipped preset from its production patch. */
function plugins(preset: string): PluginRow[] {
  const source = readFileSync(join(PRESETS, `${preset}.patch.yml`), 'utf8')
  // Use the Loader schema so conditional rows compare as the expressions the
  // shipped composition mounts.
  const patch = yaml.load(source, { schema: entryListSchema }) as PatchRow[]
  const declaration = patch.flatMap(row => row.insert ?? []).find(row => row.config?.id === preset)
  if (!Array.isArray(declaration?.config?.plugins)) {
    throw new Error(`${preset}: patch has no preset declaration with plugin rows`)
  }
  return declaration.config.plugins as PluginRow[]
}

/** Index plugin rows by their declared id, rejecting a row without one. */
function byId(preset: string): Map<string, PluginRow> {
  const indexed = new Map<string, PluginRow>()
  for (const row of plugins(preset)) {
    if (typeof row.id !== 'string') throw new Error(`${preset}: plugin row without a string id`)
    indexed.set(row.id, row)
  }
  return indexed
}

describe('shipped stock-analysis preset', () => {
  it('carries every standard plugin row unchanged and adds tool-stock', () => {
    const standard = byId('standard')
    const stockAnalysis = byId('stock-analysis')

    for (const [id, row] of standard) {
      expect(stockAnalysis.has(id), `stock-analysis is missing standard plugin "${id}"`).toBe(true)
      expect(stockAnalysis.get(id), `stock-analysis plugin "${id}" drifted from standard`).toEqual(row)
    }

    const extra = [...stockAnalysis.keys()].filter(id => !standard.has(id)).sort()
    expect(extra).toEqual(['tool-stock'])
  })
})
