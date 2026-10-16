// @vitest-environment jsdom
/** Board lookup, independent observations, and member focus in the sector dashboard. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SectorCatalog, SectorDashboard as SectorData, SectorMatch } from '@deepseek-ai/dsh-api-stock-controller/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { SectorDashboard } from '../src/client/SectorDashboard.tsx'
import { zh } from '../src/client/locales.ts'

const sector: SectorMatch = { thscode: '886001.TI', name: '机器人概念', kind: 'concept' }
const industry: SectorMatch = { thscode: '881001.TI', name: '机器人行业', kind: 'industry' }
const catalog: SectorCatalog = { matches: [industry, sector], truncated: false }
const candle = (time: number, close: number, turnover = 100) => ({
  time, open: close, high: close + 1, low: close - 1, close, volume: 10, turnover,
})
const data: SectorData = {
  sector,
  constituents: [
    { thscode: '600001.SH', ticker: '600001', name: '甲公司' },
    { thscode: '000002.SZ', ticker: '000002', name: '乙公司' },
  ],
  constituentsTruncated: false,
  history: { thscode: sector.thscode, interval: '1d', truncated: false, candles: [
    candle(1_780_000_000_000, 100), candle(1_780_086_400_000, 103, 500),
  ] },
}
const t = makeTranslate(zh)
afterEach(cleanup)

function mount(overrides: Partial<Parameters<typeof SectorDashboard>[0]> = {}) {
  const onSelect = vi.fn()
  const onRetry = vi.fn()
  const onScopeChange = vi.fn()
  const props = { catalog, data: null, loading: false, error: false, selected: null,
    onSelect, onRetry, onScopeChange, t, ...overrides }
  const view = render(<SectorDashboard {...props} />)
  return { ...view, onSelect, onRetry, onScopeChange, props }
}

it('matches an exact concept before similar industries and accepts keyboard submission', () => {
  const { onSelect } = mount()
  fireEvent.change(screen.getByLabelText('板块名称'), { target: { value: '机器人概念' } })
  const matches = within(screen.getByLabelText('匹配板块')).getAllByRole('button')
  expect(matches[0]?.textContent).toContain('机器人概念')
  fireEvent.click(screen.getByRole('button', { name: '查看板块' }))
  expect(onSelect).toHaveBeenCalledWith(sector)
})

it('shows a partial match, an unmatched name, and a truncated catalog notice', () => {
  const { onSelect } = mount({ catalog: { ...catalog, truncated: true } })
  fireEvent.change(screen.getByLabelText('板块名称'), { target: { value: '行业' } })
  fireEvent.click(screen.getByRole('button', { name: /机器人行业/ }))
  expect(onSelect).toHaveBeenCalledWith(industry)
  fireEvent.change(screen.getByLabelText('板块名称'), { target: { value: '不存在' } })
  expect(screen.getByText('没有匹配的板块，请检查名称')).toBeTruthy()
  expect(screen.getByText('目录返回不完整，部分板块可能无法匹配')).toBeTruthy()
})

it('shows index measures and filters or selects current constituents', () => {
  const { onScopeChange } = mount({ data, selected: sector })
  expect(screen.getByText('近 20 日波动')).toBeTruthy()
  expect(screen.getByText('当日成交额')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /甲公司/ }))
  expect(onScopeChange).toHaveBeenCalledWith({ kind: 'sector', sector: sector.thscode, windowDays: 120, stock: '600001.SH' })
  fireEvent.change(screen.getByLabelText('查找成分股'), { target: { value: '000002' } })
  expect(screen.queryByRole('button', { name: /甲公司/ })).toBeNull()
  expect(screen.getByRole('button', { name: /乙公司/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '近 30 天' }))
  expect(screen.getByRole('button', { name: '近 30 天' }).getAttribute('aria-pressed')).toBe('true')
  expect(onScopeChange).toHaveBeenCalledWith({ kind: 'sector', sector: sector.thscode, windowDays: 30, stock: '600001.SH' })
})

it('draws daily opening and closing candles with highs, lows, and volume', () => {
  const up = { ...candle(1_780_000_000_000, 103, 300), open: 98, high: 105, low: 97 }
  const down = { ...candle(1_780_086_400_000, 99, 500), open: 104, high: 106, low: 98 }
  const fallingLast = { ...candle(1_780_172_800_000, 97, 400), open: 99 }
  mount({ data: { ...data, history: { ...data.history, candles: [up, down, fallingLast] } }, selected: sector })
  const chart = screen.getByRole('img', { name: '指数日 K 线' })
  expect(chart.querySelectorAll('rect')).toHaveLength(6)
  expect(chart.querySelectorAll('title')[0]?.textContent).toContain('开盘 98 · 最高 105 · 最低 97 · 收盘 103')
  expect(chart.querySelectorAll('title')[1]?.textContent).toContain('开盘 104 · 最高 106 · 最低 98 · 收盘 99')
  expect(document.querySelector('[class*="chartLegend"]')?.textContent).toContain('上涨下跌成交量')
})

it('keeps loading, failure, empty series, and capped members explicit', () => {
  const empty: SectorData = { ...data, constituents: [], constituentsTruncated: true,
    history: { ...data.history, truncated: true, candles: [] } }
  const { rerender, props, onRetry } = mount({ catalog: null, loading: true })
  expect(screen.queryByText('输入板块名称并选择匹配项')).toBeNull()
  rerender(<SectorDashboard {...props} catalog={catalog} data={empty} selected={sector} loading={false} error />)
  expect(screen.getAllByText('所选区间没有指数日线')).toHaveLength(2)
  expect(screen.getByText('成分股列表返回不完整')).toBeTruthy()
  expect(screen.getByText('指数日线返回不完整')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(onRetry).toHaveBeenCalledTimes(1)
})

it('moves a mentioned stock into the current inquiry scope', () => {
  const { onScopeChange } = mount({ data, selected: sector, focus: { code: '600001.SH', sequence: 1 } })
  expect(onScopeChange).toHaveBeenCalledWith({ kind: 'sector', sector: sector.thscode, windowDays: 120, stock: '600001.SH' })
})

it('clears a selected stock when the board changes', () => {
  const { rerender, props, onScopeChange } = mount({ data, selected: sector })
  fireEvent.click(screen.getByRole('button', { name: /甲公司/ }))
  const nextData: SectorData = { ...data, sector: industry, constituents: [
    { thscode: '000003.SZ', ticker: '000003', name: '丙公司' },
  ] }
  rerender(<SectorDashboard {...props} data={nextData} selected={industry} />)
  fireEvent.click(screen.getByRole('button', { name: '近 30 天' }))
  expect(onScopeChange).toHaveBeenLastCalledWith({ kind: 'sector', sector: industry.thscode, windowDays: 30 })
})

it('accepts an exact board code and leaves an unmatched submission untouched', () => {
  const { onSelect } = mount()
  const input = screen.getByLabelText('板块名称')
  fireEvent.change(input, { target: { value: '881001.TI' } })
  fireEvent.click(screen.getByRole('button', { name: '查看板块' }))
  expect(onSelect).toHaveBeenCalledWith(industry)
  fireEvent.change(input, { target: { value: '不存在' } })
  const form = input.closest('form')
  if (form === null) throw new Error('sector search form is absent')
  fireEvent.submit(form)
  expect(onSelect).toHaveBeenCalledTimes(1)
})

it('shows an initial read failure and retries without data', () => {
  const { onRetry } = mount({ catalog: null, error: true })
  expect(screen.getByText('暂时无法加载板块数据')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(onRetry).toHaveBeenCalledOnce()
})

it('shows one flat point, a falling window, and an empty selected window', () => {
  const flat: SectorData = { ...data, history: { ...data.history,
    candles: [candle(1_780_000_000_000, 100)] } }
  const { rerender, props } = mount({ data: flat, selected: sector })
  expect(screen.getByText('+0%')).toBeTruthy()
  const falling: SectorData = { ...data, history: { ...data.history,
    candles: [candle(1_780_000_000_000, 103), candle(1_780_086_400_000, 100)] } }
  rerender(<SectorDashboard {...props} data={falling} selected={sector} />)
  expect(screen.getByText(/-2.91%/)).toBeTruthy()
  const spaced: SectorData = { ...data, history: { ...data.history,
    candles: [candle(1_760_000_000_000, 100), candle(1_780_086_400_000, 103)] } }
  rerender(<SectorDashboard {...props} data={spaced} selected={sector} />)
  fireEvent.click(screen.getByRole('button', { name: '近 30 天' }))
  expect(screen.getByText('所选走势窗口')).toBeTruthy()
})

it('ignores answer links for stocks absent from the current member list', () => {
  const { onScopeChange } = mount({ data, selected: sector, focus: { code: '999999.SH', sequence: 1 } })
  expect(onScopeChange).not.toHaveBeenCalled()
})

it('omits a daily return when the prior close is zero', () => {
  const zero: SectorData = { ...data, history: { ...data.history,
    candles: [candle(1_780_000_000_000, 0), candle(1_780_086_400_000, 100)] } }
  mount({ data: zero, selected: sector })
  expect(screen.getByText('日收益率标准差')).toBeTruthy()
})
