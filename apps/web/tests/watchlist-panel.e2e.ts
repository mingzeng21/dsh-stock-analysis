// The watchlist panel is the only surface that reads the `watchlist` and
// `stock` namespaces through a *consumer* context rather than the context of
// the plugin that owns them. Cordis hands a consuming plugin a traceable proxy
// of the model whose `ctx` is the consumer's own, so a model resolving its
// namespace from `this.ctx` is checked against the consumer's injections and
// fails every call before reaching the wire — which the panel reports as its
// generic `Failed: unknown` copy. Nothing below the assembled browser catches
// that, so this boots the real host with the real built client bundles in
// chromium and reads what the user sees.
//
// Keyless and vendor-free: the list read is the durable-storage path, and the
// symbol search is asserted at the wire (a host without a market-data provider
// still answers the call), so no model and no vendor is required.
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { REPO_ROOT, newEnglishPage, requireDist } from './support.ts'

/** Start `dsh web` and resolve the token-bearing URL it prints once ready. */
function waitForReadyLine(child: ChildProcess): Promise<string> {
  return new Promise((resolveReady, reject) => {
    let out = ''
    const timer = setTimeout(() => { reject(new Error(`dsh web not ready in 90s; output:\n${out}`)) }, 90_000)
    const onData = (chunk: Buffer): void => {
      out += chunk.toString()
      const match = /dsh web: (http:\/\/[^\s]+)/.exec(out)
      if (match?.[1] !== undefined) {
        clearTimeout(timer)
        resolveReady(match[1])
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`dsh web exited early (code ${String(code)}); output:\n${out}`))
    })
  })
}

describe('watchlist panel (real host, built client bundles)', () => {
  let child: ChildProcess | undefined
  let browser: Browser | undefined
  let scratch: string | undefined
  let page: Page | undefined
  const apiCalls: string[] = []

  /** The page every case drives, once `beforeAll` has opened it. */
  function open(): Page {
    if (page === undefined) throw new Error('watchlist panel e2e: no page is open')
    return page
  }

  /** Every API path the page has called so far, with its status. */
  function callsTo(path: string): string[] {
    return apiCalls.filter(call => call.endsWith(` ${path}`))
  }

  /** Show the Watchlist panel, dismissing the first-run notice when it is up. */
  async function showWatchlist(): Promise<Page> {
    const target = open()
    await target.getByRole('button', { name: 'New session', exact: true }).first().waitFor({ timeout: 30_000 })
    const notice = target.getByRole('button', { name: 'Continue', exact: true }).first()
    if (await notice.count() > 0) await notice.click({ timeout: 10_000 })
    const nav = target.getByRole('button', { name: 'Watchlist', exact: true }).first()
    await nav.waitFor({ state: 'visible', timeout: 30_000 })
    await nav.click({ timeout: 10_000 })
    return target
  }

  beforeAll(async () => {
    requireDist()
    scratch = mkdtempSync(join(tmpdir(), 'dsh-web-watchlist-'))
    const tsxLoader = pathToFileURL(createRequire(join(REPO_ROOT, 'package.json')).resolve('tsx')).href
    child = spawn(
      process.execPath,
      ['--import', tsxLoader, join(REPO_ROOT, 'apps/cli/src/bin.ts'), 'web', '--no-open', '--port', '0'],
      {
        cwd: scratch,
        env: {
          ...process.env,
          DEEPSEEK_API_KEY: 'keyless-watchlist-panel',
          DSH_HOME: join(scratch, '.dsh'),
          DSH_AGENTS_HOME: join(scratch, '.agents'),
          TSX_TSCONFIG_PATH: join(REPO_ROOT, 'tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    const readyUrl = await waitForReadyLine(child)
    browser = await chromium.launch({ headless: true })
    page = await newEnglishPage(browser, 1200)
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.pathname.startsWith('/api/')) apiCalls.push(`${String(response.status())} ${url.pathname}`)
    })
    await page.goto(readyUrl)
  })

  afterAll(async () => {
    await browser?.close()
    child?.kill('SIGTERM')
    if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
  })

  it('reads the durable list instead of reporting a failure', async () => {
    const panel = await showWatchlist()
    await expect.poll(() => callsTo('/api/watchlist/list').length, { timeout: 15_000 }).toBeGreaterThan(0)
    expect(callsTo('/api/watchlist/list')).toContain('200 /api/watchlist/list')
    // The failure copy is `Failed: {code}`; the empty list is the honest state
    // of a world with no instruments in it.
    await panel.getByText('No instruments yet', { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await panel.locator('body').innerText()).not.toContain('Failed:')
  })

  it('sends a symbol search to the host instead of failing before the wire', async () => {
    const panel = await showWatchlist()
    await panel.getByRole('button', { name: 'Add instrument', exact: true }).first().click({ timeout: 10_000 })
    await panel.getByPlaceholder('Name or code').first().fill('600519')
    await panel.getByRole('button', { name: 'Search', exact: true }).first().click()
    await expect.poll(() => callsTo('/api/stock/searchSymbols').length, { timeout: 15_000 }).toBeGreaterThan(0)
    expect(callsTo('/api/stock/searchSymbols')).toContain('200 /api/stock/searchSymbols')
  })
})
