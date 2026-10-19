import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot, WEB_FIXTURE_TIME } from './support.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/stock-mentions', import.meta.url))
const SESSION = fileURLToPath(new URL('../../../snapshots/web/stock-mentions/session.v4.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('../../../snapshots/web/stock-mentions/ui.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'stock-mentions-web-e2e'

describe('web e2e: inline stock mentions', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    vi.spyOn(scaffold.ctx.stock, 'resolveSymbols').mockImplementation(async query =>
      query === '贵州茅台' || query === '600519.SH' ? [{ thscode: '600519.SH', ticker: '600519', name: '贵州茅台', assetType: 'a-share' }] : [])
    vi.spyOn(scaffold.ctx.stock, 'call').mockImplementation(async endpointId => ({
      endpointId,
      rows: endpointId === 'a-share.prices.snapshot' ? [{
        thscode: '600519.SH', last_price: 1252.57, price_change: -4.55, price_change_ratio_pct: -0.36,
        open_price: 1259, high_price: 1259.95, low_price: 1250.8, prev_price: 1257.12,
        volume: 2501689, turnover: 3135910000,
      }] : endpointId === 'a-share.prices.historical' ? [
        { date_ms: 1789516800000, open_price: 1250, high_price: 1260, low_price: 1240, close_price: 1252, volume: 10, turnover: 12_520 },
        { date_ms: 1789603200000, open_price: 1252, high_price: 1265, low_price: 1250, close_price: 1258, volume: 12, turnover: 15_096 },
      ] : [],
      meta: { truncated: false, asOf: WEB_FIXTURE_TIME },
    }))
    await seedSession(scaffold, readFileSync(SESSION, 'utf8'), SEED_ID, undefined, { createdAt: WEB_FIXTURE_TIME })
    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    page = await newEnglishPage(browser)
    await page.clock.setFixedTime(WEB_FIXTURE_TIME)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    try {
      await browser?.close()
    } finally {
      await scaffold?.close()
    }
  })

  it.skipIf(MODE === 'record')('opens an inline mention and keeps Markdown links and code inert', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-stock-mentions'))
    await page.getByText(/^dsh-web-e2e-ws-/u).click()
    await expect.poll(() => page.getByRole('button', { name: 'View quote for 贵州茅台 (600519.SH)' }).count(),
      { timeout: 15_000 }).toBe(2)
    expect(await page.locator('a button').count()).toBe(0)
    expect(await page.locator('code button').count()).toBe(0)
    await page.getByRole('button', { name: 'View quote for 贵州茅台 (600519.SH)' }).first().click()
    await expect.poll(() => page.getByText('1252.57', { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    const quotePanel = page.getByRole('dialog', { name: '贵州茅台 Stock quote' })
    await quotePanel.waitFor({ state: 'visible' })
    expect(await quotePanel.evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(360)
    const aria = (await captureStableAria(page, '[class*="frame"]', scaffold.workspaceCwd)).split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(EXPECTED, aria, MODE)
    const dayTab = quotePanel.getByRole('tab', { name: 'Recent daily prices' })
    const newsTab = quotePanel.getByRole('tab', { name: 'Related news' })
    await dayTab.focus()
    await page.keyboard.press('ArrowRight')
    expect(await newsTab.getAttribute('aria-selected')).toBe('true')
    expect(await quotePanel.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('quote-tab-news')
    await page.keyboard.press('Home')
    expect(await dayTab.getAttribute('aria-selected')).toBe('true')
    await page.getByRole('button', { name: 'Agents' }).click()
    await quotePanel.waitFor({ state: 'visible' })
    await quotePanel.getByRole('button', { name: 'Close quote' }).click()
    await quotePanel.waitFor({ state: 'hidden' })
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(DIR, ['session.v4.jsonl', 'ui.expected.md'])
  }, 60_000)
})
