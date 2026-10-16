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

const DIR = fileURLToPath(new URL('../../../snapshots/web/stock-limit-up-pulse', import.meta.url))
const SESSION = fileURLToPath(new URL('../../../snapshots/web/stock-limit-up-pulse/session.v4.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('../../../snapshots/web/stock-limit-up-pulse/ui.expected.md', import.meta.url))
const MODE = webSnapshotMode()
const SEED_ID = 'stock-limit-up-pulse-web-e2e'
const DATES = ['2026-10-09', '2026-10-10', '2026-10-13', '2026-10-14', '2026-10-15']

describe('web e2e: closing-limit pulse history', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    vi.spyOn(scaffold.ctx.stock, 'call').mockImplementation(async (endpointId, params) => {
      const ladder = DATES.map((date, index) => ({
        date,
        boards: {
          two_board: [{ thscode: '600001.SH', name: '甲公司' }],
          three_board: index > 1 ? [{ thscode: '600002.SH', name: '乙公司' }] : [],
          four_board: [], five_board: [], six_board: [], seven_over: [],
        },
      }))
      const date = endpointId === 'a-share.special-data.limit-up-pool'
        ? new Date(Number(params?.['date_ms'])).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) : ''
      const index = DATES.indexOf(date)
      return {
        endpointId,
        rows: endpointId === 'a-share.special-data.limit-up-ladder' ? ladder
          : endpointId === 'a-share.special-data.limit-up-pool' && index >= 0
            ? Array.from({ length: index + 2 }, (_, stockIndex) => ({
              thscode: `60000${stockIndex + 1}.SH`, name: ['甲公司', '乙公司', '丙公司', '丁公司', '戊公司', '己公司'][stockIndex],
              continue_day_cnt: stockIndex === 0 ? 2 : stockIndex === 1 && index > 1 ? 3 : 1,
              seal_money: (stockIndex + 1) * 100_000_000,
              max_seal_money: (stockIndex + 1) * 125_000_000,
              limit_up_reason: stockIndex % 2 === 0 ? '存储芯片' : '机器人概念',
            })) : [],
        meta: { truncated: false, asOf: WEB_FIXTURE_TIME },
      }
    })
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

  it.skipIf(MODE === 'record')('reopens the synchronized pulse with its inquiry transcript', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-stock-limit-up-pulse'))
    await page.getByText(/^dsh-web-e2e-ws-/u).click()
    await page.getByRole('button', { name: 'Agents' }).click()
    await page.getByRole('button', { name: /联动涨停家数、连板梯队、封单与涨停原因/u }).click()
    await expect.poll(() => page.getByRole('img', { name: '30 日涨停结构同步面板' }).count(), { timeout: 20_000 }).toBe(1)
    await page.getByRole('button', { name: '返回Agents' }).click()
    await page.getByRole('button', { name: '显示分析记录' }).click()
    await page.getByRole('button', { name: '查看结果' }).click()
    await expect.poll(() => page.getByRole('img', { name: '30 日涨停结构同步面板' }).count(), { timeout: 20_000 }).toBe(1)
    expect(await page.getByText('涨停原因分布').count()).toBe(1)
    expect(await page.getByRole('complementary', { name: '问看板' }).isHidden()).toBe(false)
    const aria = (await captureStableAria(page, '[class*="frame"]', scaffold.workspaceCwd)).split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(EXPECTED, aria, MODE)
    expect(tripwire.pageErrors).toEqual([])
    await assertFixtureInventory(DIR, ['session.v4.jsonl', 'ui.expected.md'])
  }, 60_000)
})
