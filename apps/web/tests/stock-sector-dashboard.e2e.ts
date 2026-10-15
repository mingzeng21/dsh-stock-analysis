import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot, WEB_FIXTURE_TIME } from './support.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/stock-sector-dashboard', import.meta.url))
const SESSION = fileURLToPath(new URL('../../../snapshots/web/stock-sector-dashboard/session.v4.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('../../../snapshots/web/stock-sector-dashboard/ui.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'stock-sector-dashboard-web-e2e'

describe('web e2e: sector dashboard history', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    vi.spyOn(scaffold.ctx.stock, 'call').mockImplementation(async (endpointId, params) => ({
      endpointId,
      rows: endpointId === 'a-share-index.catalog.ths-index-list'
        ? params?.['tag'] === 'cn_concept' ? [{ thscode: '886001.TI', name: '机器人概念' }] : []
        : endpointId === 'a-share-index.constituents.ths-stock-list'
          ? [{ thscode: '600001.SH', ticker: '600001', name: '甲公司' }]
          : endpointId === 'a-share-index.prices.historical' ? [
            { date_ms: 1789516800000, open_price: 98, high_price: 105, low_price: 97, close_price: 103, volume: 300, turnover: 3000 },
            { date_ms: 1789603200000, open_price: 104, high_price: 106, low_price: 98, close_price: 99, volume: 500, turnover: 5000 },
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

  it.skipIf(MODE === 'record')('reopens the board with daily candles and the inquiry transcript', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-stock-sector-dashboard'))
    await page.getByText(/^dsh-web-e2e-ws-/u).click()
    await page.getByRole('button', { name: 'Agents' }).click()
    await page.getByRole('button', { name: '查看结果' }).click()
    await expect.poll(() => page.getByRole('img', { name: '指数日 K 线' }).count(), { timeout: 15_000 }).toBe(1)
    expect(await page.getByText('上涨下跌成交量').count()).toBe(1)
    expect(await page.getByRole('complementary', { name: '问看板' }).isHidden()).toBe(false)
    const aria = (await captureStableAria(page, '[class*="frame"]', scaffold.workspaceCwd)).split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(EXPECTED, aria, MODE)
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(DIR, ['session.v4.jsonl', 'ui.expected.md'])
  }, 60_000)
})
