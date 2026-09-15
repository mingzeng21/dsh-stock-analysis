/**
 * Native rendering of one stock tool result.
 *
 * The canonical value is the programmatic surface and stays complete; this
 * renderer is what the model reads, so it is bounded by a configured character
 * budget and reports what it dropped. Batch facts come first: a model that
 * cannot see the data time or the truncation state will read a stale or partial
 * page as the whole answer.
 * @module @deepseek-ai/dsh-tool-stock/render
 */

import type { StockToolValue } from './value.ts'

/** Milliseconds of the fixed `Asia/Shanghai` offset the vendor timestamps carry. */
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

/** Render one vendor millisecond timestamp deterministically, without a locale. */
function formatAsOf(ms: number): string {
  const wall = new Date(ms + SHANGHAI_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
  return `${wall} +08:00`
}

/** Render one scalar or nested JSON cell on a single line. */
function formatCell(cell: unknown): string {
  if (cell === null) return 'null'
  switch (typeof cell) {
    case 'string':
      return cell
    case 'number':
      return String(cell)
    case 'boolean':
      return String(cell)
    case 'undefined':
      return 'null'
    default:
      return JSON.stringify(cell)
  }
}

/** Whether one row is a record rather than a scalar or array. */
function isRecord(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

/** Render one row as `key=value` pairs in vendor field order. */
function formatRow(row: unknown): string {
  if (!isRecord(row)) return formatCell(row)
  const cells: string[] = []
  for (const [field, cell] of Object.entries(row)) cells.push(`${field}=${formatCell(cell)}`)
  return cells.length === 0 ? '（空行）' : cells.join(' ')
}

/**
 * Render one canonical value as the model-facing text block.
 * @param value - canonical value returned by a stock tool.
 * @param maxChars - character budget for the rendered text; the batch-fact header is always kept.
 * @returns the rendered text, with an explicit note when rows were dropped.
 */
export function renderStockResult(value: StockToolValue, maxChars: number): string {
  const lines = [`${value.endpointId}: ${value.count} 行`]
  if (value.total !== undefined) lines.push(`上游总行数: ${value.total}`)
  if (value.asOf !== undefined) lines.push(`asOf: ${formatAsOf(value.asOf)}`)
  if (value.truncated) lines.push('已截断: 本地只保留了前若干行')
  if (value.next !== undefined) lines.push(`next: ${formatCell(value.next)}（本页已满，可能还有更多）`)
  if (value.count === 0) lines.push('（本次返回 0 行）')

  let used = lines.reduce((total, line) => total + line.length + 1, 0)
  let shown = 0
  for (const [index, row] of value.rows.entries()) {
    const line = `${index + 1}. ${formatRow(row)}`
    if (used + line.length > maxChars) break
    lines.push(line)
    used += line.length + 1
    shown += 1
  }
  if (shown < value.rows.length) {
    lines.push(`…（仅显示 ${shown}/${value.rows.length} 行：渲染上限 ${maxChars} 字符）`)
  }
  return lines.join('\n')
}
