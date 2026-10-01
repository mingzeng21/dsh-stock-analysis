/** Shipped stock specialists remain ordinary DSH skills with discoverable card metadata. */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillFileSystem from '@deepseek-ai/dsh-skill-filesystem'
import { describe, expect, it } from 'vitest'

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')

describe('bundled stock Agents', () => {
  it('discovers card metadata without loading specialist bodies', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      await ctx.plugin(SkillFileSystem, { includeDefaultRoots: false, bundledSkillDir: skillsDir, watch: false })
      const skills = await ctx.skills.list({ cwd: process.cwd() })
      expect(skills.map(skill => skill.name)).toEqual([
        'stock-hot-topics', 'stock-market-overview', 'stock-screening',
      ])
      expect(skills.map(skill => skill.metadata?.stockAgent)).toEqual([
        expect.objectContaining({ launch: 'query' }),
        expect.objectContaining({ launch: 'immediate' }),
        expect.objectContaining({ launch: 'query' }),
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
